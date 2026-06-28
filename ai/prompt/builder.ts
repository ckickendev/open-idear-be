// =============================================================================
//  PROMPT BUILDER
//  ai/prompt/builder.ts
//
//  A reusable, chainable builder to construct structured prompts from sections.
//
//  Design Decisions:
//  - Divides prompts into standard sections (Role, Goal, Context, Constraints,
//    Output Format, and User Input) to improve LLM instruction-following.
//  - Automatically format arrays of constraints/contexts into clean markdown lists.
//  - Fluent interface (chainable methods) for highly readable prompt definitions.
//  - Separation of instructions: Role, Goal, Context, Constraints, and Output Format
//    are assembled into the `system` prompt. User Input is compiled into the `user` prompt.
//  - Variable interpolation is deferred until the final `.build(vars)` call,
//    making the builder instance reusable across different requests.
// =============================================================================

export interface BuiltPrompt {
  /** Assembled system instructions (Role + Goal + Context + Constraints + Output) */
  readonly system: string;
  /** Assembled user prompt with interpolated variables */
  readonly user: string;
}

export class PromptBuilder {
  private _role?: string;
  private _goal?: string;
  private readonly _contexts: string[] = [];
  private readonly _constraints: string[] = [];
  private _outputFormat?: string;
  private _userInputTemplate?: string;

  /**
   * Set the role/persona of the model.
   * Example: "You are a Senior SEO Analyst."
   */
  role(role: string): this {
    this._role = role.trim();
    return this;
  }

  /**
   * Set the primary goal/objective of the task.
   * Example: "Analyze the reading grade level of the text."
   */
  goal(goal: string): this {
    this._goal = goal.trim();
    return this;
  }

  /**
   * Add context or background information. Can be called multiple times.
   */
  context(context: string | string[]): this {
    if (Array.isArray(context)) {
      this._contexts.push(...context.map(c => c.trim()));
    } else {
      this._contexts.push(context.trim());
    }
    return this;
  }

  /**
   * Add operational constraints/rules. Can be called multiple times.
   */
  constraint(constraint: string | string[]): this {
    if (Array.isArray(constraint)) {
      this._constraints.push(...constraint.map(c => c.trim()));
    } else {
      this._constraints.push(constraint.trim());
    }
    return this;
  }

  /**
   * Set the expected format and rules for the response.
   * Example: "Respond only with a valid JSON object matching the schema."
   */
  outputFormat(format: string): this {
    this._outputFormat = format.trim();
    return this;
  }

  /**
   * Set the user input prompt template. Can contain variables wrapped in curly braces {varName}.
   * Example: "Analyze this text: {inputText}"
   */
  userInput(template: string): this {
    this._userInputTemplate = template.trim();
    return this;
  }

  /**
   * Assemble the final prompt.
   * Interpolates variables in system sections (if any) and the user input template.
   *
   * @param variables Key-value map of template variables to interpolate.
   */
  build(variables: Record<string, any> = {}): BuiltPrompt {
    const systemSections: string[] = [];

    if (this._role) {
      systemSections.push(`# ROLE\n${this._role}`);
    }

    if (this._goal) {
      systemSections.push(`# GOAL\n${this._goal}`);
    }

    if (this._contexts.length > 0) {
      const contextText = this._contexts
        .map((ctx) => (this._contexts.length > 1 ? `- ${ctx}` : ctx))
        .join("\n");
      systemSections.push(`# CONTEXT\n${contextText}`);
    }

    if (this._constraints.length > 0) {
      const constraintText = this._constraints
        .map((cons) => (this._constraints.length > 1 ? `- ${cons}` : cons))
        .join("\n");
      systemSections.push(`# CONSTRAINTS\n${constraintText}`);
    }

    if (this._outputFormat) {
      systemSections.push(`# OUTPUT FORMAT\n${this._outputFormat}`);
    }

    // Assemble and interpolate the system prompt
    const systemRaw = systemSections.join("\n\n");
    const system = this._interpolate(systemRaw, variables);

    // Assemble and interpolate the user prompt
    const userRaw = this._userInputTemplate || "";
    const user = this._interpolate(userRaw, variables);

    return { system, user };
  }

  /**
   * Helper to replace {variableName} with matching value from variables.
   */
  private _interpolate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
      if (variables[key] !== undefined) {
        const val = variables[key];
        return typeof val === "object" ? JSON.stringify(val, null, 2) : String(val);
      }
      return match; // Return unchanged if variable is missing
    });
  }
}
