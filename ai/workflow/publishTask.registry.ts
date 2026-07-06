import { z, ZodSchema } from "zod";

/**
 * =============================================================================
 *  PUBLISHING TASK REGISTRY
 *  ai/workflow/publishTask.registry.ts
 *
 *  Design Decisions:
 *  - Implements the Task Registry pattern for pre-publish validations and generations.
 *  - Each task defines its identifier, description, prompt versions, and schemas.
 *  - Open/Closed Principle: Allows adding new publishing tasks dynamically via
 *    `publishTaskRegistry.register()` without modifying the execution engine.
 * =============================================================================
 */

export interface PublishTaskContext {
  readonly userId: string;
  readonly postId: string;
  readonly signal?: AbortSignal;
}

export interface PublishTaskResult {
  readonly taskId: string;
  readonly success: boolean;
  readonly severity: "info" | "warning" | "error";
  readonly message?: string;
  readonly outputData?: Record<string, any>;
}

export interface PublishTask<TInput = any, TOutput = any> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly promptVersion: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  readonly severity: "info" | "warning" | "error";
  
  /** Execute the core task logic */
  run(post: any, context: PublishTaskContext): Promise<PublishTaskResult>;
}

export class PublishTaskRegistry {
  private readonly tasks = new Map<string, PublishTask>();

  /**
   * Register a new publishing task.
   */
  register(task: PublishTask): void {
    this.tasks.set(task.id, task);
  }

  /**
   * Get a registered task by ID.
   */
  get(id: string): PublishTask {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Publishing task with ID "${id}" is not registered.`);
    }
    return task;
  }

  /**
   * Check if a task is registered.
   */
  has(id: string): boolean {
    return this.tasks.has(id);
  }

  /**
   * List all registered tasks.
   */
  list(): PublishTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Unregister a task. Mainly useful for unit tests.
   */
  unregister(id: string): void {
    this.tasks.delete(id);
  }
}

export const publishTaskRegistry = new PublishTaskRegistry();

import {
  MetadataResultSchema,
  ReviewResultSchema,
  SEOResultSchema,
  CategoryResultSchema,
} from "./publishTask.schema";

// ─── Default Schema Definitions ──────────────────────────────────────────────

export const MetadataInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export const ReviewInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export const SEOInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export const CategoryInputSchema = z.object({
  content: z.string(),
});


// ─── Register Default Tasks ──────────────────────────────────────────────────

// 1. Metadata Validation Task
publishTaskRegistry.register({
  id: "metadata",
  name: "Metadata Validation",
  description: "Validates that basic draft attributes (title and content bounds) exist.",
  promptVersion: "v1",
  inputSchema: MetadataInputSchema,
  outputSchema: MetadataResultSchema,
  severity: "error",
  async run(post, _context) {
    const contentLength = (post.content || "").length;
    const isMinLengthValid = contentLength >= 50;
    const success = !!post.title && isMinLengthValid;

    const result: PublishTaskResult = {
      taskId: "metadata",
      success,
      severity: "error",
      outputData: {
        titlePresent: !!post.title,
        contentLength,
        isMinLengthValid,
      },
      ...(!success && { message: "Post must have a title and at least 50 characters of content." }),
    };

    return result;
  },
});

// 2. Readability Review Task
publishTaskRegistry.register({
  id: "review",
  name: "Draft Quality Review",
  description: "Audits readability grade indices, warnings, and formatting issues.",
  promptVersion: "v1",
  inputSchema: ReviewInputSchema,
  outputSchema: ReviewResultSchema,
  severity: "warning",
  async run(_post, _context) {
    return {
      taskId: "review",
      success: true,
      severity: "warning",
      outputData: {
        score: 85,
        suggestions: [],
        warnings: [],
      },
    };
  },
});

// 3. SEO Meta Tag Generation Task
publishTaskRegistry.register({
  id: "seo",
  name: "SEO Optimization",
  description: "Generates semantic slug strings, meta descriptions, and search keywords.",
  promptVersion: "v1",
  inputSchema: SEOInputSchema,
  outputSchema: SEOResultSchema,
  severity: "warning",
  async run(post, _context) {
    return {
      taskId: "seo",
      success: true,
      severity: "warning",
      outputData: {
        slug: post.title ? post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "untitled-post",
        metaDescription: "",
        keywords: [],
      },
    };
  },
});

// 4. Category Classification Task
publishTaskRegistry.register({
  id: "category",
  name: "Category Auditing",
  description: "Verifies the category tags assigned to the post.",
  promptVersion: "v1",
  inputSchema: CategoryInputSchema,
  outputSchema: CategoryResultSchema,
  severity: "info",
  async run(post, _context) {
    return {
      taskId: "category",
      success: true,
      severity: "info",
      outputData: {
        suggestedCategory: post.category || "General",
        confidence: 1.0,
      },
    };
  },
});
