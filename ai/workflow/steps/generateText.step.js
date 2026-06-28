/**
 * ai/workflow/steps/generateText.step.js
 *
 * Responsibility:
 *   The most general-purpose step in the system.
 *   Takes a prompt name + input variables, renders the prompt via the
 *   PromptRenderer, sends it to ctx.provider, and returns the raw text response.
 *
 *   Input:  { promptName, promptVersion, vars, streamToCtx? }
 *   Output: { text: string }
 *
 * Why it exists:
 *   Many agent tasks reduce to "render a prompt, call the model, return text."
 *   This step handles that pattern so other steps can focus on their own
 *   data transformation rather than repeating provider call boilerplate.
 */
