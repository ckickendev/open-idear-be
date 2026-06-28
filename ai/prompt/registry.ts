// =============================================================================
//  PROMPT REGISTRY
//  ai/prompt/registry.ts
//
//  Manages routing, overrides, and versions of filesystem prompts.
//
//  Design Decisions:
//  - Keeps track of "active" versions for each prompt name. When an agent requests
//    a prompt without a version, the registry determines which file to load.
//  - Allows hot-switching versions at runtime (e.g., swapping "planner" from
//    "v1" to "v2") without code deployment.
//  - Provides a filesystem scanner to dynamically list all available versions
//    for a prompt. This enables UI version-selectors or debug panels.
//  - Leverages the caching capability of the PromptLoader under the hood.
// =============================================================================

import * as fs from "fs/promises";
import * as path from "path";
import { PromptLoader, promptLoader, type PromptDefinition } from "./loader";

export class PromptRegistry {
  private readonly loader: PromptLoader;
  private readonly baseDir: string;
  private readonly activeVersions = new Map<string, string>(); // promptName -> version string

  /**
   * @param loader The prompt loader to fetch and cache files.
   * @param baseDir Path to directory containing prompt files (default: src/ai/prompts)
   */
  constructor(loader?: PromptLoader, baseDir?: string) {
    this.loader = loader || promptLoader;
    this.baseDir = baseDir || path.resolve(process.cwd(), "src/ai/prompts");
  }

  /**
   * Route a prompt name to a specific version at runtime.
   * Example: registry.setActiveVersion("planner", "v2")
   */
  setActiveVersion(name: string, version: string): void {
    this.activeVersions.set(name, version);
  }

  /**
   * Get the configured active version for a prompt.
   * Defaults to "v1" if no active version mapping has been configured.
   */
  getActiveVersion(name: string): string {
    return this.activeVersions.get(name) || "v1";
  }

  /**
   * Resolve and load the prompt.
   * If version is not specified, uses the configured active version.
   */
  async get(name: string, version?: string): Promise<PromptDefinition> {
    const resolvedVersion = version || this.getActiveVersion(name);
    return this.loader.get(name, resolvedVersion);
  }

  /**
   * Scan the filesystem to list all available versions for a prompt name.
   * Matches both flat file naming (e.g. planner.v1.md) and directory naming (e.g. planner/v1.md).
   *
   * Example: registry.listVersions("planner") -> ["v1", "v2"]
   */
  async listVersions(name: string): Promise<string[]> {
    const versions = new Set<string>();
    const normalizedName = name.replace(/\//g, ".");

    try {
      // 1. Scan flat files at base directory (e.g., name.v1.md, name.v2.json)
      const files = await fs.readdir(this.baseDir);
      for (const file of files) {
        // Match e.g., planner.v1.md or writer.v22.json
        const flatRegex = new RegExp(`^${this.escapeRegExp(normalizedName)}\\.v(\\d+)\\.(md|json)$`);
        const match = flatRegex.exec(file);
        if (match) {
          versions.add(`v${match[1]}`);
        }
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    try {
      // 2. Scan subdirectories (e.g., baseDir/name/v1.md)
      const dirPath = path.join(this.baseDir, name);
      const subFiles = await fs.readdir(dirPath);
      for (const file of subFiles) {
        // Match e.g., v1.md, v2.json
        const subRegex = /^v(\d+)\.(md|json)$/;
        const match = subRegex.exec(file);
        if (match) {
          versions.add(`v${match[1]}`);
        }
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    return Array.from(versions).sort((a, b) => {
      const numA = parseInt(a.slice(1), 10);
      const numB = parseInt(b.slice(1), 10);
      return numA - numB;
    });
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// Export default instance
export const promptRegistry = new PromptRegistry();
