import { Workflow } from "./executor";
import { EditorCopilot, editorCopilot, copilotActionRegistry } from "../agent";
import type { AgentOptions } from "../agent/types";

// =============================================================================
//  EDITING WORKFLOW
//  ai/workflow/editing.workflow.ts
//
//  Design Decisions:
//  - Implements the specialized workflow coordinating all editor copilot actions.
//  - Validates action IDs and payloads against the dynamic Action Registry.
//  - Leverages Dependency Injection (DI): accepts an EditorCopilot instance.
//  - Completely decoupled from specific LLM providers (does not know Gemini).
// =============================================================================

export interface EditingWorkflowInput {
  /** Unique id of the editor action (e.g. "continue" | "improve" | "review") */
  readonly actionId: string;
  /** Raw input parameters passed from the client editor */
  readonly payload: any;
}

export class EditingWorkflow extends Workflow<EditingWorkflowInput, any> {
  private readonly copilot: EditorCopilot;

  /**
   * @param copilot Injected EditorCopilot instance (Dependency Injection).
   */
  constructor(copilot?: EditorCopilot) {
    super();
    this.copilot = copilot || editorCopilot;
  }

  /**
   * Overrides execute to coordinate the validation, context loading,
   * and execution of the selected editor copilot strategy.
   *
   * @param initialInput Action registry key and payload properties.
   * @param options      Options containing AbortSignals and context metadata.
   */
  override async execute(
    initialInput: EditingWorkflowInput,
    options: AgentOptions = {}
  ): Promise<any> {
    const { actionId, payload } = initialInput;

    // 1. Receive & Validate action ID
    if (!actionId || !copilotActionRegistry.has(actionId)) {
      throw new Error(`Unsupported or unregistered copilot action: "${actionId}"`);
    }

    const action = copilotActionRegistry.get(actionId);

    // 2. Validate request parameters against strategy input schema
    const validatedInput = action.inputSchema.parse(payload);

    // 3. Build & execute target flow via EditorCopilot runner
    const result = await this.copilot.execute(actionId, validatedInput, options);

    if (!result.success) {
      throw new Error(`EditingWorkflow failed execution of action "${actionId}".`);
    }

    // 4. Return validated result
    return result.data;
  }
}
