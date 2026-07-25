// =============================================================================
//  AI ORCHESTRATION PLATFORM — TASK INITIALIZER
//  ai/orchestration/task/init.ts
//
//  Design Decisions:
//  - Instantiates and registers the core reusable tasks using ExecutionTask.
//  - Leverages Zod for strong input/output validations.
//  - Maps tasks to their corresponding AIConfigScope definitions.
// =============================================================================

import { z } from "zod";
import { ExecutionTask } from "./executionTask";
import { taskRegistry } from "../registry";
import type { RetryPolicy } from "../contracts";

const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
};

// ─── Planner Task ─────────────────────────────────────────────────────────────
export const plannerTask = new ExecutionTask({
  id: "planner-task",
  name: "Planner Task",
  description: "Generates an outline plan for the article.",
  version: "1.0.0",
  scope: "planner",
  promptName: "planner",
  inputSchema: z.object({
    topic: z.string(),
    audience: z.string(),
    goal: z.string(),
    tone: z.string(),
    length: z.string(),
    category: z.string(),
  }),
  outputSchema: z.object({
    title: z.string(),
    difficulty: z.string(),
    estimatedReadingTime: z.number(),
    keywords: z.array(z.string()),
    outline: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        level: z.number(),
      })
    ),
  }),
  defaultRetryPolicy,
  defaultModel: "fast",
});

// ─── Writer Task ──────────────────────────────────────────────────────────────
export const writerTask = new ExecutionTask({
  id: "writer-task",
  name: "Writer Task",
  description: "Writes a technical article draft based on the outline.",
  version: "1.0.0",
  scope: "writer",
  promptName: "writer",
  inputSchema: z.object({
    plan: z.string(),
    additionalInstructions: z.string().optional(),
  }),
  outputSchema: z.object({
    markdown: z.string(),
    wordCount: z.number(),
    estimatedReadingTime: z.number(),
  }),
  defaultRetryPolicy: {
    maxAttempts: 2,
    initialDelayMs: 1500,
    backoffMultiplier: 2,
    timeoutMs: 120000,
  },
  defaultModel: "quality",
});

// ─── SEO Metadata Task ────────────────────────────────────────────────────────
export const seoTask = new ExecutionTask({
  id: "seo-task",
  name: "SEO Metadata Task",
  description: "Generates SEO URL slug, meta description, and keywords.",
  version: "1.0.0",
  scope: "publishing",
  promptName: "seo",
  inputSchema: z.object({
    title: z.string(),
    content: z.string(),
  }),
  outputSchema: z.object({
    slug: z.string(),
    metaDescription: z.string(),
    keywords: z.array(z.string()),
  }),
  defaultRetryPolicy,
  defaultModel: "quality",
});

// ─── Affiliate Links Task ─────────────────────────────────────────────────────
export const affiliateTask = new ExecutionTask({
  id: "affiliate-task",
  name: "Affiliate Placement Task",
  description: "Suggests affiliate link placements in the text content.",
  version: "1.0.0",
  scope: "growth",
  promptName: "affiliate",
  inputSchema: z.object({
    content: z.string(),
  }),
  outputSchema: z.object({
    suggestions: z.array(
      z.object({
        term: z.string(),
        suggestedProduct: z.string(),
        placementTip: z.string(),
      })
    ),
  }),
  defaultRetryPolicy,
  defaultModel: "fast",
});

// ─── Comparison Table Task ────────────────────────────────────────────────────
export const comparisonTableTask = new ExecutionTask({
  id: "comparison-table-task",
  name: "Comparison Table Task",
  description: "Compiles side-by-side comparison table headers and rows.",
  version: "1.0.0",
  scope: "growth",
  promptName: "comparison-table",
  inputSchema: z.object({
    content: z.string(),
  }),
  outputSchema: z.object({
    title: z.string(),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  defaultRetryPolicy,
  defaultModel: "fast",
});

// Register all tasks to singleton registry
taskRegistry.register(plannerTask);
taskRegistry.register(writerTask);
taskRegistry.register(seoTask);
taskRegistry.register(affiliateTask);
taskRegistry.register(comparisonTableTask);
