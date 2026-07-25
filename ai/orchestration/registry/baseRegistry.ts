// =============================================================================
//  AI ORCHESTRATION PLATFORM — BASE REGISTRY
//  ai/orchestration/registry/baseRegistry.ts
//
//  Design Decisions:
//  - Generic multi-version registry base class to eliminate duplicated code.
//  - Standardizes resolve, unregister, has, and listing operations.
//  - Leverages abstract getIdentifier method to resolve keys dynamically (name vs. id).
// =============================================================================

export interface Registrable {
  readonly version: string;
}

export abstract class BaseRegistry<T extends Registrable> {
  protected readonly items = new Map<string, Map<string, T>>();

  protected abstract getIdentifier(item: T): string;

  register(item: T): this {
    const id = this.getIdentifier(item);
    if (!this.items.has(id)) {
      this.items.set(id, new Map());
    }
    this.items.get(id)!.set(item.version, item);
    return this;
  }

  unregister(id: string, version: string): this {
    const versions = this.items.get(id);
    if (versions?.has(version)) {
      versions.delete(version);
      if (versions.size === 0) {
        this.items.delete(id);
      }
    }
    return this;
  }

  resolve(id: string, version?: string, errorContext?: string): T {
    const versions = this.items.get(id);
    if (versions === undefined || versions.size === 0) {
      throw new Error(
        `[${errorContext || "Registry"}] Item "${id}" is not registered. ` +
          `Registered keys: [${this.listNames().join(", ")}]`
      );
    }

    if (version !== undefined) {
      const item = versions.get(version);
      if (item === undefined) {
        throw new Error(
          `[${errorContext || "Registry"}] Item "${id}" v${version} not found. ` +
            `Available versions: [${[...versions.keys()].join(", ")}]`
        );
      }
      return item;
    }

    // Default to the latest version by sorting keys lexicographically
    const latest = [...versions.keys()].sort().at(-1)!;
    return versions.get(latest)!;
  }

  has(id: string, version?: string): boolean {
    const versions = this.items.get(id);
    if (versions === undefined) return false;
    if (version === undefined) return versions.size > 0;
    return versions.has(version);
  }

  listNames(): string[] {
    return [...this.items.keys()];
  }

  listVersions(id: string): string[] {
    return [...(this.items.get(id)?.keys() ?? [])].sort();
  }

  listAll(): T[] {
    const all: T[] = [];
    for (const versions of this.items.values()) {
      all.push(...versions.values());
    }
    return all;
  }
}
