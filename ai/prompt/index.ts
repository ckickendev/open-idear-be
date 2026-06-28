// =============================================================================
//  PROMPT LAYER — PUBLIC BARREL
//  ai/prompt/index.ts
//
//  This is the public entry point for the prompt management system.
//  Exports the PromptBuilder for dynamic prompt assembly and the PromptLoader
//  for caching file-system prompt loading.
// =============================================================================

export { PromptBuilder, type BuiltPrompt } from "./builder";
export { PromptLoader, FilePromptSource, promptLoader, type PromptDefinition, type PromptSource } from "./loader";
export { PromptRegistry, promptRegistry } from "./registry";
// export { type PromptTemplate, type PromptVersion } from "./types.js";
// export { compile } from "./renderer.js";
// export { validateOutput } from "./validator.js";
