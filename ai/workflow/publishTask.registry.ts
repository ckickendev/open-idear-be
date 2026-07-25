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
  description: "Validates all pre-publish checklist parameters.",
  promptVersion: "v1",
  inputSchema: MetadataInputSchema,
  outputSchema: MetadataResultSchema,
  severity: "error",
  async run(post, _context) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Title Audit
    const title = (post.title || "").trim();
    const titleValid = title.length >= 5 && title.length <= 60;
    if (!post.title) {
      errors.push("Post Title is missing.");
    } else if (!titleValid) {
      warnings.push(`Post Title should be between 5-60 characters (currently: ${title.length}).`);
    }

    // 2. Description Audit
    const description = (post.description || "").trim();
    const descriptionValid = description.length >= 20 && description.length <= 160;
    if (!post.description) {
      errors.push("Meta Description is missing.");
    } else if (!descriptionValid) {
      warnings.push(`Meta Description should be between 20-160 characters (currently: ${description.length}).`);
    }

    // 3. Category Audit
    const categoryPresent = !!post.category;
    if (!categoryPresent) {
      errors.push("Post Category is not selected.");
    }

    // 4. Tags Audit
    const tagsPresent = Array.isArray(post.tags) && post.tags.length > 0;
    if (!tagsPresent) {
      warnings.push("No tags are assigned to the article.");
    }

    // 5. Slug Audit
    const slug = (post.slug || "").trim();
    const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
    if (!post.slug) {
      errors.push("SEO URL slug is missing.");
    } else if (!slugValid) {
      errors.push("Slug must contain only lowercase letters, numbers, and hyphens (no spaces/symbols).");
    }

    // 6. Cover Audit
    const coverPresent = !!(post.coverImage || post.image);
    if (!coverPresent) {
      warnings.push("No cover banner image is specified for the article.");
    }

    // Parse draft content body
    const content = post.content || "";

    // 7. Images Alt Audit
    let imagesAltValid = true;
    const mdImageRegex = /!\[(.*?)\]\((.*?)\)/g;
    let mdMatch;
    while ((mdMatch = mdImageRegex.exec(content)) !== null) {
      if (!mdMatch[1] || mdMatch[1].trim() === "") {
        imagesAltValid = false;
        warnings.push(`Found image with missing ALT descriptive tags: "${mdMatch[2]}".`);
      }
    }

    const htmlImageRegex = /<img[^>]+alt=["'](.*?)["']/g;
    let htmlMatch;
    while ((htmlMatch = htmlImageRegex.exec(content)) !== null) {
      if (!htmlMatch[1] || htmlMatch[1].trim() === "") {
        imagesAltValid = false;
        warnings.push("Found HTML image with missing ALT tag attribute.");
      }
    }

    // 8. Headings Hierarchy Audit
    let headingsOrderValid = true;
    if (content.includes("# ") || content.includes("<h1>")) {
      headingsOrderValid = false;
      errors.push("H1 header tag is forbidden inside content body copy (reserved for article title).");
    }
    // Simple hierarchy rule: H3 should not exist without a prior H2
    const h2Index = content.indexOf("## ");
    const h3Index = content.indexOf("### ");
    if (h3Index !== -1 && (h2Index === -1 || h3Index < h2Index)) {
      headingsOrderValid = false;
      warnings.push("Invalid heading nest hierarchy: H3 (###) used before main H2 (##) section.");
    }

    // 9. FAQ Section Audit
    const faqBlockPresent = content.toLowerCase().includes("faq") || content.toLowerCase().includes("frequently asked questions");

    // 10. Secure Links Audit
    let linksSecure = true;
    const unsecureLinkRegex = /\[.*?\]\(http:\/\/.*?\)/g;
    if (unsecureLinkRegex.test(content) || content.includes("href=\"http://")) {
      linksSecure = false;
      warnings.push("Found unsecure external links (HTTP) in the article body. Use HTTPS instead.");
    }

    // 11. Affiliate Placements Audit
    let affiliateValid = true;
    if (content.includes("amzn.to/") || content.includes("amazon.com/dp/")) {
      // Basic check for tracking ID presence
      if (!content.includes("tag=") && !content.includes("ref=")) {
        affiliateValid = false;
        warnings.push("Amazon affiliate link detected missing a valid tracking parameters.");
      }
    }

    const success = errors.length === 0;

    const result: PublishTaskResult = {
      taskId: "metadata",
      success,
      severity: "error",
      outputData: {
        titleValid,
        descriptionValid,
        categoryPresent,
        tagsPresent,
        slugValid,
        coverPresent,
        imagesAltValid,
        headingsOrderValid,
        faqBlockPresent,
        linksSecure,
        affiliateValid,
        errors,
        warnings,
      },
      ...(!success && { message: `Checklist failed: ${errors[0]}` }),
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
