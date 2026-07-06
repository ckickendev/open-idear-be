import { z, ZodSchema } from "zod";
import { BaseAgent } from "./base.agent";
import type { AgentOptions, AgentResult } from "./types";
import {
  ContinueSchema,
  ImproveSchema,
  ExampleSchema,
  ReviewSchema,
} from "./copilot.schema";

// =============================================================================
//  COPILOT ACTION STRATEGY CONTRACT & REGISTRY
// =============================================================================

export interface CopilotAction<TInput = any, TOutput = any> {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly promptName: string;
  readonly defaultPromptVersion: string;
  readonly inputSchema: ZodSchema<TInput>;
  readonly outputSchema: ZodSchema<TOutput>;
  readonly responseFormat: "text" | "json";
  readonly defaultModel: string; // semantic model alias (e.g. "fast" | "quality")
  validate?: (data: TOutput) => Promise<boolean> | boolean;
}

export class CopilotActionRegistry {
  private actions = new Map<string, CopilotAction>();

  register(action: CopilotAction) {
    this.actions.set(action.id, action);
  }

  get(id: string): CopilotAction {
    const action = this.actions.get(id);
    if (!action) {
      throw new Error(`Copilot action with id "${id}" is not registered.`);
    }
    return action;
  }

  has(id: string): boolean {
    return this.actions.has(id);
  }

  list(): CopilotAction[] {
    return Array.from(this.actions.values());
  }
}

export const copilotActionRegistry = new CopilotActionRegistry();

// ─── Register Default Actions ────────────────────────────────────────────────

copilotActionRegistry.register({
  id: "continue",
  title: "Continue Writing",
  description: "Seamlessly write the next sentences based on preceding context",
  promptName: "continue",
  defaultPromptVersion: "v1",
  inputSchema: z.object({
    surroundingContext: z.string(),
    additionalInstructions: z.string().optional(),
  }),
  outputSchema: ContinueSchema,
  responseFormat: "text",
  defaultModel: "fast",
});

copilotActionRegistry.register({
  id: "improve",
  title: "Improve Writing",
  description: "Polish clarity, grammar, and tone for a selected text block",
  promptName: "improve",
  defaultPromptVersion: "v1",
  inputSchema: z.object({
    selectedText: z.string(),
    instruction: z.string(),
    surroundingContext: z.string().optional(),
    audience: z.string().optional(),
    tone: z.string().optional(),
  }),
  outputSchema: ImproveSchema,
  responseFormat: "json",
  defaultModel: "fast",
  validate: (data) => {
    return typeof data.improvedText === "string" && data.improvedText.trim().length > 0;
  },
});

copilotActionRegistry.register({
  id: "example",
  title: "Generate Example",
  description: "Build an illustrative text or code block based on text details",
  promptName: "example",
  defaultPromptVersion: "v1",
  inputSchema: z.object({
    selectedText: z.string(),
    additionalInstructions: z.string().optional(),
    surroundingContext: z.string().optional(),
    language: z.string().optional(),
    articleTitle: z.string().optional(),
    audience: z.string().optional(),
    sectionTitle: z.string().optional(),
  }),
  outputSchema: ExampleSchema,
  responseFormat: "text",
  defaultModel: "fast",
});

copilotActionRegistry.register({
  id: "review",
  title: "Review Article",
  description: "Generate a complete peer review audit checklist and suggestions report",
  promptName: "review",
  defaultPromptVersion: "v1",
  inputSchema: z.object({
    currentArticle: z.string(),
    articleTitle: z.string(),
    goal: z.string().optional(),
    audience: z.string().optional(),
    tone: z.string().optional(),
  }),
  outputSchema: ReviewSchema,
  responseFormat: "json",
  defaultModel: "quality",
});


// =============================================================================
//  TRANSIENT THREAD-SAFE RUNNER AGENT
// =============================================================================

class CopilotActionAgent extends BaseAgent {
  readonly name = "CopilotActionAgent";
  protected readonly promptName: string;
  protected readonly responseFormat: "text" | "json";
  protected readonly defaultModel: string;
  protected readonly schema?: ZodSchema<any>;
  private readonly action: CopilotAction;

  constructor(action: CopilotAction) {
    super();
    this.action = action;
    this.promptName = action.promptName;
    this.responseFormat = action.responseFormat;
    this.defaultModel = action.defaultModel;
    this.schema = action.outputSchema;
  }

  protected override async validate(data: any): Promise<boolean> {
    if (this.action.validate) {
      return this.action.validate(data);
    }
    return true;
  }
}


// =============================================================================
//  EDITOR COPILOT ENGINE
// =============================================================================

export class EditorCopilot {
  /**
   * Executes a registered editor action.
   */
  async execute(
    actionId: string,
    rawInput: any,
    options: AgentOptions = {}
  ): Promise<AgentResult<any>> {
    const action = copilotActionRegistry.get(actionId);

    // 1. Validate inputs before running the LLM
    const validatedInput = action.inputSchema.parse(rawInput);

    // 2. Instantiate transient agent execution flow
    const runner = new CopilotActionAgent(action);

    // 3. Execute prompt loading, provider completion, output validation, and telemetry logging
    return runner.execute(validatedInput, options);
  }

  /**
   * Executes a registered editor action as a stream yielding chunks.
   */
  async *executeStream(
    actionId: string,
    rawInput: any,
    options: AgentOptions = {}
  ): AsyncGenerator<string, any, undefined> {
    const action = copilotActionRegistry.get(actionId);

    const validatedInput = action.inputSchema.parse(rawInput);
    const runner = new CopilotActionAgent(action);

    yield* runner.executeStream(validatedInput, options);
  }
}

export const editorCopilot = new EditorCopilot();
