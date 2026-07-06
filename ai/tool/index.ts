// =============================================================================
//  AI TOOL PLATFORM — PUBLIC BARREL & SETUP
//  ai/tool/index.ts
// =============================================================================

import { toolRegistry } from "./registry";
import {
  ReadPostTool,
  SearchPostTool,
  SearchMediaTool,
  SuggestTagsTool,
  GenerateSlugTool,
  SearchCategoryTool,
} from "./builtin";

export {
  type ToolPermission,
  type ToolContext,
  type ToolResult,
  type AITool,
  type ToolUserContext,
  type ToolArticleContext,
  type ToolSelectionContext,
  type ToolWorkspaceContext,
  type ToolExecutionMetadata,
} from "./types";

export {
  ToolRegistry,
  toolRegistry,
  type ToolRegistryPlugin,
} from "./registry";

export {
  ToolContextContainer,
} from "./context";

export {
  ToolExecutor,
  toolExecutor,
  type ExecutorOptions,
} from "./executor";

export {
  ReadPostTool,
  SearchPostTool,
  SearchMediaTool,
  SuggestTagsTool,
  GenerateSlugTool,
  SearchCategoryTool,
} from "./builtin";

// =============================================================================
//  AUTO-REGISTRATION OF BUILT-IN SYSTEM TOOLS
// =============================================================================

toolRegistry.register(new ReadPostTool());
toolRegistry.register(new SearchPostTool());
toolRegistry.register(new SearchMediaTool());
toolRegistry.register(new SuggestTagsTool());
toolRegistry.register(new GenerateSlugTool());
toolRegistry.register(new SearchCategoryTool());
