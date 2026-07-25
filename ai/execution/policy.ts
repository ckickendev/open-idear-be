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
    // ─── Shared model whitelist ──────────────────────────────────────────
    // Semantic aliases ("fast", "quality", "vision", "default") are resolved
    // to actual Gemini identifiers inside GeminiProvider.  Policies must
    // whitelist BOTH the alias and the resolved identifier so that the
    // facade's model-check passes regardless of which string is forwarded.
    const sharedModels = [
      "fast", "quality", "vision", "default",
      "gemini-1.5-flash", "gemini-1.5-pro",
      "gemini-2.0-flash", "gemini-2.5-pro",
      "gemini-2.5-flash",
    ];


    // 1. Planner Engine Policy
    this.register("planner", {
      name: "DefaultPlannerPolicy",
      scope: "planner",
      allowedModels: sharedModels,
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      timeoutMs: 30000,
      budgetCap: 0.10,
      allowStreaming: false,
      temperatureOverride: 0.2,
    });

    // 2. Writer Engine Policy
    this.register("writer", {
      name: "DefaultWriterPolicy",
      scope: "writer",
      allowedModels: sharedModels,
      maxAttempts: 2,
      initialDelayMs: 1500,
      backoffMultiplier: 2,
      timeoutMs: 120000,
      budgetCap: 0.80,
      allowStreaming: true,
      temperatureOverride: 0.7,
    });

    // 3. Editor Copilot Engine Policy
    this.register("editor", {
      name: "DefaultEditorPolicy",
      scope: "editor",
      allowedModels: sharedModels,
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 1.5,
      timeoutMs: 30000,
      budgetCap: 0.05,
      allowStreaming: false,
      temperatureOverride: 0.5,
    });

    // 4. Publishing Engine Policy
    this.register("publishing", {
      name: "DefaultPublishingPolicy",
      scope: "publishing",
      allowedModels: sharedModels,
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      timeoutMs: 45000,
      budgetCap: 0.20,
      allowStreaming: false,
      temperatureOverride: 0.1,
    });

    // 5. Growth Engine Policy
    this.register("growth", {
      name: "DefaultGrowthPolicy",
      scope: "growth",
      allowedModels: sharedModels,
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
