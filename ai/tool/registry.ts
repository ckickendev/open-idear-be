import type { AITool } from "./types";
import type { AIConfigScope } from "../config";
import { PermissionChecker } from "./permission";

/**
 * Interface contract defining future plugin extensions for the registry.
 */
export interface ToolRegistryPlugin {
  readonly name: string;
  onRegister?(tool: AITool): void | Promise<void>;
  onUnregister?(name: string, version?: string): void | Promise<void>;
}

/**
 * Registry coordinating tool registration, semantic lookups, purges, and versions.
 */
export class ToolRegistry {
  // Map of ToolName -> Map of Version -> AITool
  private readonly tools = new Map<string, Map<string, AITool>>();
  private readonly plugins: ToolRegistryPlugin[] = [];

  /**
   * Registers a plugin hook to extend registry operations in the future.
   */
  use(plugin: ToolRegistryPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  /**
   * Registers a tool instance mapping it by name and version.
   */
  async register(tool: AITool): Promise<this> {
    let versionMap = this.tools.get(tool.name);
    if (!versionMap) {
      versionMap = new Map<string, AITool>();
      this.tools.set(tool.name, versionMap);
    }

    versionMap.set(tool.version, tool);

    // Trigger registered plugin hooks
    for (const plugin of this.plugins) {
      if (plugin.onRegister) {
        await plugin.onRegister(tool);
      }
    }

    return this;
  }

  /**
   * Unregisters a specific tool version or purges all versions under the name.
   */
  async unregister(name: string, version?: string): Promise<boolean> {
    const versionMap = this.tools.get(name);
    if (!versionMap) return false;

    let success = false;
    if (version) {
      success = versionMap.delete(version);
      if (versionMap.size === 0) {
        this.tools.delete(name);
      }
    } else {
      this.tools.delete(name);
      success = true;
    }

    if (success) {
      for (const plugin of this.plugins) {
        if (plugin.onUnregister) {
          await plugin.onUnregister(name, version);
        }
      }
    }

    return success;
  }

  /**
   * Finds a tool by name and version. Resolves the latest semantic version if version is omitted.
   */
  get(name: string, version?: string): AITool {
    const versionMap = this.tools.get(name);
    if (!versionMap || versionMap.size === 0) {
      throw new Error(`Tool "${name}" is not registered in ToolRegistry.`);
    }

    if (version) {
      const tool = versionMap.get(version);
      if (!tool) {
        throw new Error(`Tool "${name}" with version "${version}" is not registered.`);
      }
      return tool;
    }

    // Resolve latest semantic version
    const versions = Array.from(versionMap.keys());
    const latestVersion = this.resolveLatestVersion(versions);
    return versionMap.get(latestVersion)!;
  }

  /**
   * Lists all registered tools and their associated versions.
   */
  list(): AITool[] {
    const list: AITool[] = [];
    for (const versionMap of this.tools.values()) {
      list.push(...Array.from(versionMap.values()));
    }
    return list;
  }

  /**
   * Lists all registered versions of a tool name.
   */
  listVersions(name: string): string[] {
    const versionMap = this.tools.get(name);
    return versionMap ? Array.from(versionMap.keys()) : [];
  }

  /**
   * Retrieves tool metadata and formats it for engine parameters.
   */
  getMetadata(name: string, version?: string) {
    const tool = this.get(name, version);
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      version: tool.version,
      category: tool.category,
      tags: tool.tags,
      permissions: tool.permissions,
    };
  }

  // ─── Tool Discovery APIs ──────────────────────────────────────────────────

  /**
   * Finds registered tools filtering by semantic category.
   */
  findByCategory(category: string): AITool[] {
    return this.list().filter((t) => t.category === category);
  }

  /**
   * Finds registered tools filtering by tag metadata.
   */
  findByTag(tag: string): AITool[] {
    return this.list().filter((t) => t.tags && t.tags.includes(tag));
  }

  /**
   * Finds all tools authorized for a given config scope and user credentials.
   */
  findAllowed(scope: AIConfigScope, userRole?: string, userId?: string): AITool[] {
    return this.list().filter((t) => {
      const mockContext = {
        traceId: "discovery",
        scope,
        user: userId ? { id: userId, role: userRole } : undefined,
        metadata: {},
      };
      return PermissionChecker.isAllowed(t.permissions, mockContext);
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Resolves the latest semantic version string from an array of versions (e.g. ["1.0.0", "1.1.2", "2.0.0"]).
   */
  private resolveLatestVersion(versions: string[]): string {
    if (versions.length === 1) return versions[0];

    return versions.sort((a, b) => {
      const partsA = a.split(".").map(Number);
      const partsB = b.split(".").map(Number);

      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA !== numB) {
          return numB - numA; // Descending sort
        }
      }
      return 0;
    })[0];
  }
}

export const toolRegistry = new ToolRegistry();
