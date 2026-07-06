import { promptRegistry, PromptRegistry } from "./registry";
import { type PromptDefinition } from "./loader";

/**
 * =============================================================================
 *  PROMPT VERSION MANAGER
 *  ai/prompt/manager.ts
 *
 *  Design Decisions:
 *  - Interacts with PromptRegistry to control version states.
 *  - Implements rollback history stacks per prompt template name.
 *  - Enforces config fallbacks to default templates ("v1") on load failures.
 *  - Resolves frontmatter configurations metadata from target version blocks.
 *  - Keeps templates as markdown files on disk without DB requirements.
 * =============================================================================
 */

export class PromptVersionManager {
  private readonly registry: PromptRegistry;
  private readonly history = new Map<string, string[]>();

  constructor(registry?: PromptRegistry) {
    this.registry = registry || promptRegistry;
  }

  /**
   * Maps active version for a prompt, archiving the previous version for rollbacks.
   */
  setActiveVersion(name: string, version: string): void {
    const current = this.registry.getActiveVersion(name);
    if (current !== version) {
      const historyStack = this.history.get(name) || [];
      historyStack.push(current);
      this.history.set(name, historyStack);
    }
    this.registry.setActiveVersion(name, version);
  }

  /**
   * Gets the currently active version of a prompt.
   */
  getActiveVersion(name: string): string {
    return this.registry.getActiveVersion(name);
  }

  /**
   * Rolls back a prompt to its previous active version.
   * Returns the newly active version, or null if no rollback history exists.
   */
  rollback(name: string): string | null {
    const historyStack = this.history.get(name);
    if (!historyStack || historyStack.length === 0) {
      return null;
    }
    const previous = historyStack.pop()!;
    this.registry.setActiveVersion(name, previous);
    return previous;
  }

  /**
   * Retrieves prompt template content and frontmatter metadata.
   * Automatically falls back to "v1" if the requested version fails to load.
   */
  async lookup(name: string, version?: string): Promise<PromptDefinition> {
    const targetVersion = version || this.getActiveVersion(name);
    try {
      return await this.registry.get(name, targetVersion);
    } catch (err) {
      const defaultVersion = "v1";
      if (targetVersion !== defaultVersion) {
        console.warn(`[PromptVersionManager] Version "${targetVersion}" failed to load for "${name}". Falling back to "${defaultVersion}".`);
        return await this.registry.get(name, defaultVersion);
      }
      throw err;
    }
  }

  /**
   * Returns frontmatter configurations (e.g. temperature, maxTokens) of a specific version.
   */
  async getMetadata(name: string, version?: string): Promise<Record<string, any>> {
    const definition = await this.lookup(name, version);
    return definition.metadata || {};
  }

  /**
   * Checks if a specific prompt version is available on disk.
   */
  async exists(name: string, version: string): Promise<boolean> {
    try {
      const versions = await this.registry.listVersions(name);
      return versions.includes(version);
    } catch {
      return false;
    }
  }

  /**
   * Lists all available versions for a prompt name.
   */
  async listVersions(name: string): Promise<string[]> {
    return this.registry.listVersions(name);
  }
}

export const promptVersionManager = new PromptVersionManager();
