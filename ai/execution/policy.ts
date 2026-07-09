import type { ExecutionPolicy } from "./types";
import { type AIConfigScope } from "../config";

/**
 * Registry coordinating named execution policies.
 */
export class PolicyRegistry {
  private readonly policies = new Map<AIConfigScope, ExecutionPolicy>();

  constructor() {
    this.registerDefaults();
  }

  register(scope: AIConfigScope, policy: ExecutionPolicy): void {
    this.policies.set(scope, policy);
  }

  get(scope: AIConfigScope): ExecutionPolicy {
    const policy = this.policies.get(scope);
    if (!policy) {
      throw new Error(`Execution policy for scope "${scope}" is not registered.`);
    }
    return policy;
  }

  private registerDefaults(): void {
    // 1. Planner Engine Policy
    this.register("planner", {
      name: "DefaultPlannerPolicy",
      scope: "planner",
      allowedModels: ["fast", "gemini-2.0-flash"],
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      timeoutMs: 30000,
      budgetCap: 0.10, // Max $0.10 USD
      allowStreaming: false,
      temperatureOverride: 0.2, // Cold temperature for structured outputs
    });

    // 2. Writer Engine Policy
    this.register("writer", {
      name: "DefaultWriterPolicy",
      scope: "writer",
      allowedModels: ["quality", "gemini-2.5-pro"],
      maxAttempts: 2,
      initialDelayMs: 1500,
      backoffMultiplier: 2,
      timeoutMs: 120000,
      budgetCap: 0.80, // High budget for reasoning drafts
      allowStreaming: true,
      temperatureOverride: 0.7, // Warm temperature for creative drafts
    });

    // 3. Editor Copilot Engine Policy
    this.register("editor", {
      name: "DefaultEditorPolicy",
      scope: "editor",
      allowedModels: ["fast", "gemini-2.0-flash"],
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 1.5,
      timeoutMs: 30000,
      budgetCap: 0.05, // Fast low cost edits
      allowStreaming: false,
      temperatureOverride: 0.5,
    });

    // 4. Publishing Engine Policy
    this.register("publishing", {
      name: "DefaultPublishingPolicy",
      scope: "publishing",
      allowedModels: ["quality", "gemini-2.5-pro"],
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      timeoutMs: 45000,
      budgetCap: 0.20,
      allowStreaming: false,
      temperatureOverride: 0.1, // Strict structure checks
    });

    // 5. Growth Engine Policy
    this.register("growth", {
      name: "DefaultGrowthPolicy",
      scope: "growth",
      allowedModels: ["fast", "gemini-2.0-flash", "quality"],
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      timeoutMs: 45000,
      budgetCap: 0.15,
      allowStreaming: false,
      temperatureOverride: 0.3,
    });
  }
}

export const policyRegistry = new PolicyRegistry();
