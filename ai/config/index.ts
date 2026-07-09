/**
 * =============================================================================
 *  AI CONFIGURATION CENTER
 *  ai/config/index.ts
 *
 *  Design Decisions:
 *  - Centralizes strongly-typed operational variables per scope (Planner, Writer, etc.).
 *  - Standardizes defaults for model aliases, temperatures, timeouts, and retries.
 *  - Supports runtime overrides per execution call.
 *  - Fully decoupled from specific LLM providers.
 * =============================================================================
 */

export interface AIRetryConfig {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
}

export interface AIConfig {
  readonly model: string;
  readonly temperature: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly timeout: number;
  readonly retry: AIRetryConfig;
  readonly stream: boolean;
}

export type AIConfigScope = "planner" | "writer" | "editor" | "publishing" | "growth";

export class AIConfigCenter {
  private readonly configs = new Map<AIConfigScope, AIConfig>();

  constructor() {
    this.initDefaultConfigs();
  }

  /**
   * Initializes baseline parameters for each workspace scope.
   */
  private initDefaultConfigs(): void {
    // 1. Planner Scope Defaults (Low temperature for deterministic outline outputs)
    this.configs.set("planner", {
      model: "fast",
      temperature: 0.2,
      topP: 0.9,
      timeout: 30000,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      },
      stream: false,
    });

    // 2. Writer Scope Defaults (Quality reasoning, longer timeout constraints for draft generations)
    this.configs.set("writer", {
      model: "quality",
      temperature: 0.7,
      topP: 0.95,
      timeout: 120000,
      retry: {
        maxAttempts: 2,
        initialDelayMs: 1500,
        backoffMultiplier: 2,
      },
      stream: true,
    });

    // 3. Editor Scope Defaults (Fast response latency targets for inline edits)
    this.configs.set("editor", {
      model: "fast",
      temperature: 0.5,
      timeout: 30000,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 1.5,
      },
      stream: false,
    });

    // 4. Publishing Scope Defaults (Audit checklist parsing)
    this.configs.set("publishing", {
      model: "quality",
      temperature: 0.1,
      timeout: 45000,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      },
      stream: false,
    });

    // 5. Growth Scope Defaults (Fast task evaluations)
    this.configs.set("growth", {
      model: "fast",
      temperature: 0.3,
      timeout: 45000,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      },
      stream: false,
    });
  }

  /**
   * Fetches the configuration schema for a specific scope.
   */
  get(scope: AIConfigScope): AIConfig {
    const config = this.configs.get(scope);
    if (!config) {
      throw new Error(`AI configuration scope "${scope}" is not registered.`);
    }
    return config;
  }

  /**
   * Dynamic runtime helper compiling default configurations with overrides parameters.
   */
  getWithOverrides(scope: AIConfigScope, overrides: Partial<AIConfig> = {}): AIConfig {
    const base = this.get(scope);
    return {
      ...base,
      ...overrides,
      retry: {
        ...base.retry,
        ...overrides.retry,
      },
    };
  }

  /**
   * Registers or updates a configuration scope (dynamic updates support).
   */
  register(scope: AIConfigScope, config: AIConfig): void {
    this.configs.set(scope, config);
  }
}

export const aiConfigCenter = new AIConfigCenter();
