import { z, ZodSchema } from "zod";

/**
 * =============================================================================
 *  GROWTH TASK REGISTRY
 *  ai/workflow/growthTask.registry.ts
 *
 *  Design Decisions:
 *  - Implements the Task Registry pattern for article value-generation growth tasks.
 *  - Enforces Zod input/output validation contracts for each task.
 *  - Open/Closed Principle: Allows adding new growth tasks dynamically via
 *    `growthTaskRegistry.register()` without modifying the execution engine.
 * =============================================================================
 */

export interface GrowthTaskContext {
  readonly userId: string;
  readonly postId: string;
  readonly signal?: AbortSignal;
}

export interface GrowthTaskResult {
  readonly taskId: string;
  readonly success: boolean;
  readonly outputData: Record<string, any>;
  readonly errorMessage?: string;
}

export interface GrowthTask<TInput = any, TOutput = any> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly promptVersion: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
}

export class GrowthTaskRegistry {
  private readonly tasks = new Map<string, GrowthTask>();

  /**
   * Register a new growth task.
   */
  register(task: GrowthTask): void {
    this.tasks.set(task.id, task);
  }

  /**
   * Get a registered task by ID or canonical feature ID.
   */
  get(id: string): GrowthTask {
    const task = this.resolveTask(id);
    if (!task) {
      throw new Error(`Growth task with ID "${id}" is not registered.`);
    }
    return task;
  }

  /**
   * Check if a task is registered by ID or canonical feature ID.
   */
  has(id: string): boolean {
    return this.resolveTask(id) !== undefined;
  }

  private resolveTask(id: string): GrowthTask | undefined {
    if (!id) return undefined;
    if (this.tasks.has(id)) return this.tasks.get(id);

    const normalized = id.replace(/_/g, "-");
    if (this.tasks.has(normalized)) return this.tasks.get(normalized);

    if (id === "faq_generation" && this.tasks.has("faq")) return this.tasks.get("faq");
    if (id === "comparison_generation" && this.tasks.has("comparison-table")) return this.tasks.get("comparison-table");
    return undefined;
  }


  /**
   * List all registered tasks.
   */
  list(): GrowthTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Unregister a task. Mainly useful for unit tests.
   */
  unregister(id: string): void {
    this.tasks.delete(id);
  }
}

export const growthTaskRegistry = new GrowthTaskRegistry();

import {
  FAQResultSchema,
  InternalLinkResultSchema,
  ComparisonTableResultSchema,
  SocialPostResultSchema,
  AffiliateResultSchema,
  ContentGapResultSchema,
} from "./growthTask.schema";

// ─── Default Schema Definitions ──────────────────────────────────────────────

export const FAQInputSchema = z.object({
  content: z.string(),
});

export const InternalLinksInputSchema = z.object({
  content: z.string(),
});

export const ComparisonTableInputSchema = z.object({
  content: z.string(),
});

export const SocialPostInputSchema = z.object({
  content: z.string(),
});

export const AffiliateInputSchema = z.object({
  content: z.string(),
});

export const ContentGapInputSchema = z.object({
  content: z.string(),
});

// ─── Register Default Tasks ──────────────────────────────────────────────────

// 1. FAQ Task
growthTaskRegistry.register({
  id: "faq",
  name: "FAQ Generator",
  description: "Extracts content focal points to generate matching FAQs and answers.",
  promptVersion: "v1",
  inputSchema: FAQInputSchema,
  outputSchema: FAQResultSchema,
});

// 2. Internal Links Task
growthTaskRegistry.register({
  id: "internal-links",
  name: "Internal Links Recommender",
  description: "Scans article content to suggest anchor texts and cross-link context topics.",
  promptVersion: "v1",
  inputSchema: InternalLinksInputSchema,
  outputSchema: InternalLinkResultSchema,
});

// 3. Comparison Table Task
growthTaskRegistry.register({
  id: "comparison-table",
  name: "Comparison Table Compiler",
  description: "Formats core tools or key metrics comparison tables.",
  promptVersion: "v1",
  inputSchema: ComparisonTableInputSchema,
  outputSchema: ComparisonTableResultSchema,
});

// 4. Social Post Task
growthTaskRegistry.register({
  id: "social-post",
  name: "Social Copywriter",
  description: "Creates high-converting posts for LinkedIn and Twitter thread variants.",
  promptVersion: "v1",
  inputSchema: SocialPostInputSchema,
  outputSchema: SocialPostResultSchema,
});

// 5. Affiliate Task
growthTaskRegistry.register({
  id: "affiliate",
  name: "Affiliate Matcher",
  description: "Recommends monetization product links and placement context blocks.",
  promptVersion: "v1",
  inputSchema: AffiliateInputSchema,
  outputSchema: AffiliateResultSchema,
});

// 6. Content Gap Task
growthTaskRegistry.register({
  id: "content-gap",
  name: "Content Gap Auditor",
  description: "Analyzes content depth to identify structural missing topics and improvement tips.",
  promptVersion: "v1",
  inputSchema: ContentGapInputSchema,
  outputSchema: ContentGapResultSchema,
});
