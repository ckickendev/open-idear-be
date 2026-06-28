import * as fs from "fs/promises";
import * as path from "path";

// =============================================================================
//  PROMPT LOADER — TYPES & CONTRACTS
//  ai/prompt/loader.ts
//
//  Design Decisions:
//  - PromptDefinition represents the resolved prompt. It contains system
//    instructions, the user template string, version, and optional metadata.
//  - PromptSource is an interface, decoupling the PromptLoader from the local
//    file system. This makes it trivial to write a DatabasePromptSource,
//    RemotePromptSource (API/S3), or MockPromptSource for unit tests.
//  - FilePromptSource is the default implementation that loads prompts from
//    the local disk. It supports both JSON (for structured configuration)
//    and Markdown with YAML Frontmatter (for human-friendly editing).
//  - Cache key is composed of `name:version` to ensure version isolation.
// =============================================================================

export interface PromptDefinition {
  readonly name: string;
  readonly version: string;
  readonly system?: string;
  readonly user: string;
  readonly metadata?: Record<string, any>;
}

/**
 * Interface representing a storage backend for prompts.
 */
export interface PromptSource {
  /**
   * Load raw prompt data from source.
   * Should throw if the prompt or version does not exist.
   */
  load(name: string, version: string): Promise<PromptDefinition>;
}

// =============================================================================
//  FILE PROMPT SOURCE
// =============================================================================

export class FilePromptSource implements PromptSource {
  private readonly baseDir: string;

  /**
   * @param baseDir Path to directory containing prompt files (default: src/ai/prompts)
   */
  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), "src/ai/prompts");
  }

  async load(name: string, version: string): Promise<PromptDefinition> {
    // We search for files named name/version.json, name/version.md,
    // or name.version.json, name.version.md
    // Example: name = "writer/section", version = "v1" -> writer/section/v1.md
    const subPath = path.join(name, version);
    const jsonPath = path.join(this.baseDir, `${subPath}.json`);
    const mdPath = path.join(this.baseDir, `${subPath}.md`);

    // 1. Try loading JSON first
    try {
      await fs.access(jsonPath);
      const raw = await fs.readFile(jsonPath, "utf-8");
      return this.parseJSON(raw, name, version);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    // 2. Try loading Markdown with Frontmatter second
    try {
      await fs.access(mdPath);
      const raw = await fs.readFile(mdPath, "utf-8");
      return this.parseMarkdown(raw, name, version);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    // 3. Fallback: try flat name files (e.g. name.version.json)
    const flatName = `${name.replace(/\//g, ".")}.${version}`;
    const flatJsonPath = path.join(this.baseDir, `${flatName}.json`);
    const flatMdPath = path.join(this.baseDir, `${flatName}.md`);

    try {
      await fs.access(flatJsonPath);
      const raw = await fs.readFile(flatJsonPath, "utf-8");
      return this.parseJSON(raw, name, version);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    try {
      await fs.access(flatMdPath);
      const raw = await fs.readFile(flatMdPath, "utf-8");
      return this.parseMarkdown(raw, name, version);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }

    throw new Error(
      `Prompt "${name}" with version "${version}" not found. Tried paths:\n` +
        `  - ${jsonPath}\n` +
        `  - ${mdPath}\n` +
        `  - ${flatJsonPath}\n` +
        `  - ${flatMdPath}`
    );
  }

  private parseJSON(raw: string, name: string, version: string): PromptDefinition {
    const parsed = JSON.parse(raw);
    if (!parsed.user) {
      throw new Error(`Invalid JSON prompt definition: "user" template is required.`);
    }
    return {
      name,
      version,
      system: parsed.system,
      user: parsed.user,
      metadata: parsed.metadata,
    };
  }

  /**
   * Parse Markdown files containing YAML Frontmatter.
   * Format:
   * ---
   * system: "You are an assistant."
   * metadata:
   *   temperature: 0.7
   * ---
   * User prompt template goes here.
   */
  private parseMarkdown(raw: string, name: string, version: string): PromptDefinition {
    const normalized = raw.replace(/\r\n/g, "\n");
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = frontmatterRegex.exec(normalized);

    if (!match) {
      // No frontmatter, treat whole content as user template
      return {
        name,
        version,
        user: normalized.trim(),
      };
    }

    const yamlStr = match[1];
    const user = match[2].trim();

    // Parse minimal YAML frontmatter without external dependencies
    const parsedYaml = this.parseSimpleYaml(yamlStr);

    return {
      name,
      version,
      system: parsedYaml.system,
      user,
      metadata: parsedYaml.metadata || {},
    };
  }

  /**
   * Lightweight, robust YAML parser for key-value and nested metadata.
   */
  private parseSimpleYaml(yamlStr: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yamlStr.split("\n");
    let inMetadata = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Handle metadata block entry
      if (trimmed.startsWith("metadata:")) {
        result.metadata = {};
        inMetadata = true;
        continue;
      }

      // Check indentation to determine if we are still in metadata
      if (inMetadata && !line.startsWith(" ") && !line.startsWith("\t")) {
        inMetadata = false;
      }

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();

      // Clean wrapped quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }

      if (inMetadata && result.metadata) {
        result.metadata[key] = this.coerceValue(val);
      } else {
        result[key] = this.coerceValue(val);
      }
    }

    return result;
  }

  private coerceValue(val: string): any {
    if (val === "true") return true;
    if (val === "false") return false;
    if (val === "null") return null;
    const num = Number(val);
    if (!isNaN(num) && val !== "") return num;
    return val;
  }
}

// =============================================================================
//  PROMPT LOADER
// =============================================================================

export class PromptLoader {
  private readonly cache = new Map<string, PromptDefinition>();
  private readonly source: PromptSource;

  constructor(source?: PromptSource) {
    this.source = source || new FilePromptSource();
  }

  /**
   * Get a prompt definition. Fetches from cache if available,
   * otherwise loads from source and caches it.
   */
  async get(name: string, version: string): Promise<PromptDefinition> {
    const cacheKey = `${name}:${version}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = await this.source.load(name, version);
    this.cache.set(cacheKey, prompt);
    return prompt;
  }

  /**
   * Clear the in-memory cache.
   * Useful for testing or implementing prompt hot-reloading.
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export default instance
export const promptLoader = new PromptLoader();
