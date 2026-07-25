// =============================================================================
//  AI WORKFLOW — ORCHESTRATION PLATFORM WORKFLOWS
//  ai/workflow/orchestratedWorkflows.ts
//
//  Design Decisions:
//  - Declares the Tutorial, Affiliate, News, and Comparison workflows.
//  - Fully built on top of the generic OrchestratedWorkflow interface.
//  - Reuses the shared, registered task IDs (planner-task, writer-task, etc.).
//  - Enforces clean declarative mapping bindings for inputs and outputs.
// =============================================================================

import { OrchestratedWorkflow, workflowRegistry } from "../orchestration";

// ─── Tutorial Workflow ────────────────────────────────────────────────────────
export const tutorialWorkflow = new OrchestratedWorkflow({
  id: "tutorial-workflow",
  name: "Tutorial Workflow",
  version: "1.0.0",
  metadata: {
    type: "tutorial",
    description: "Generates tutorial and how-to guides.",
  },
  steps: [
    {
      id: "plan",
      taskId: "planner-task",
      inputMapping: (shared: any) => ({
        topic: shared.topic,
        audience: shared.audience,
        goal: shared.goal,
        tone: shared.tone,
        length: shared.length,
        category: "Tutorial",
      }),
      outputKey: "plan",
    },
    {
      id: "write",
      taskId: "writer-task",
      dependsOn: ["plan"],
      inputMapping: (shared: any) => ({
        plan: JSON.stringify(shared.plan),
        additionalInstructions: shared.additionalInstructions,
      }),
      outputKey: "draft",
    },
    {
      id: "seo",
      taskId: "seo-task",
      dependsOn: ["write"],
      inputMapping: (shared: any) => ({
        title: shared.plan.title,
        content: shared.draft.markdown,
      }),
      outputKey: "seo",
    },
  ],
  outputKey: "draft",
});

// ─── Affiliate Workflow ───────────────────────────────────────────────────────
export const affiliateWorkflow = new OrchestratedWorkflow({
  id: "affiliate-workflow",
  name: "Affiliate Workflow",
  version: "1.0.0",
  metadata: {
    type: "affiliate",
    description: "Generates affiliate articles and monetization recommendations.",
  },
  steps: [
    {
      id: "plan",
      taskId: "planner-task",
      inputMapping: (shared: any) => ({
        topic: shared.topic,
        audience: shared.audience,
        goal: shared.goal,
        tone: shared.tone,
        length: shared.length,
        category: "Affiliate",
      }),
      outputKey: "plan",
    },
    {
      id: "write",
      taskId: "writer-task",
      dependsOn: ["plan"],
      inputMapping: (shared: any) => ({
        plan: JSON.stringify(shared.plan),
        additionalInstructions: shared.additionalInstructions,
      }),
      outputKey: "draft",
    },
    {
      id: "affiliate",
      taskId: "affiliate-task",
      dependsOn: ["write"],
      inputMapping: (shared: any) => ({
        content: shared.draft.markdown,
      }),
      outputKey: "affiliate",
    },
    {
      id: "seo",
      taskId: "seo-task",
      dependsOn: ["write"],
      inputMapping: (shared: any) => ({
        title: shared.plan.title,
        content: shared.draft.markdown,
      }),
      outputKey: "seo",
    },
  ],
  outputKey: "draft",
});

// ─── News Workflow ────────────────────────────────────────────────────────────
export const newsWorkflow = new OrchestratedWorkflow({
  id: "news-workflow",
  name: "News Workflow",
  version: "1.0.0",
  metadata: {
    type: "news",
    description: "Generates fast technical news updates and announcements.",
  },
  steps: [
    {
      id: "plan",
      taskId: "planner-task",
      inputMapping: (shared: any) => ({
        topic: shared.topic,
        audience: shared.audience,
        goal: shared.goal,
        tone: shared.tone,
        length: "short",
        category: "News",
      }),
      outputKey: "plan",
    },
    {
      id: "write",
      taskId: "writer-task",
      dependsOn: ["plan"],
      inputMapping: (shared: any) => ({
        plan: JSON.stringify(shared.plan),
        additionalInstructions: shared.additionalInstructions,
      }),
      outputKey: "draft",
    },
    {
      id: "seo",
      taskId: "seo-task",
      dependsOn: ["write"],
      inputMapping: (shared: any) => ({
        title: shared.plan.title,
        content: shared.draft.markdown,
      }),
      outputKey: "seo",
    },
  ],
  outputKey: "draft",
});

// ─── Comparison Workflow ──────────────────────────────────────────────────────
export const comparisonWorkflow = new OrchestratedWorkflow({
  id: "comparison-workflow",
  name: "Comparison Workflow",
  version: "1.0.0",
  metadata: {
    type: "comparison",
    description: "Generates comparison sheets and feature breakdown matrices.",
  },
  steps: [
    {
      id: "plan",
      taskId: "planner-task",
      inputMapping: (shared: any) => ({
        topic: shared.topic,
        audience: shared.audience,
        goal: shared.goal,
        tone: shared.tone,
        length: shared.length,
        category: "Comparison",
      }),
      outputKey: "plan",
    },
    {
      id: "write",
      taskId: "writer-task",
      dependsOn: ["plan"],
      inputMapping: (shared: any) => ({
        plan: JSON.stringify(shared.plan),
        additionalInstructions: shared.additionalInstructions,
      }),
      outputKey: "draft",
    },
    {
      id: "comparisonTable",
      taskId: "comparison-table-task",
      dependsOn: ["write"],
      inputMapping: (shared: any) => ({
        content: shared.draft.markdown,
      }),
      outputKey: "comparisonTable",
    },
    {
      id: "seo",
      taskId: "seo-task",
      dependsOn: ["write"],
      inputMapping: (shared: any) => ({
        title: shared.plan.title,
        content: shared.draft.markdown,
      }),
      outputKey: "seo",
    },
  ],
  outputKey: "draft",
});

// Register all workflows to singleton registry
workflowRegistry.register(tutorialWorkflow);
workflowRegistry.register(affiliateWorkflow);
workflowRegistry.register(newsWorkflow);
workflowRegistry.register(comparisonWorkflow);
