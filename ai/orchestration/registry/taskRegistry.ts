// =============================================================================
//  AI ORCHESTRATION PLATFORM — TASK REGISTRY
//  ai/orchestration/registry/taskRegistry.ts
//
//  Design Decisions:
//  - Multi-version registry: Map<id, Map<version, Task>> via BaseRegistry.
//  - Latest version is resolved automatically when version is omitted.
//  - Supports registry plugins (observability & integration).
//  - Strongly typed contracts.
// =============================================================================

import type { Task, OrchestratedTask, OrchestrationRegistryPlugin } from "../contracts";
import { BaseRegistry } from "./baseRegistry";

export class TaskRegistry extends BaseRegistry<Task> {
  private readonly plugins: OrchestrationRegistryPlugin[] = [];

  protected override getIdentifier(task: Task): string {
    return task.id;
  }

  // ─── Plugin Management ──────────────────────────────────────────────────────

  addPlugin(plugin: OrchestrationRegistryPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  // ─── Registration & Unregistration Overrides ────────────────────────────────

  override register(task: Task): this {
    super.register(task);
    this.plugins.forEach((p) => p.onTaskRegister?.(task as OrchestratedTask));
    return this;
  }

  override unregister(taskId: string, version?: string): this {
    if (version !== undefined) {
      super.unregister(taskId, version);
    } else {
      // If version is omitted, unregister all versions of this task ID
      this.items.delete(taskId);
    }
    this.plugins.forEach((p) => p.onTaskUnregister?.(taskId));
    return this;
  }

  override resolve<TInput = any, TOutput = any>(taskId: string, version?: string): Task<TInput, TOutput> {
    return super.resolve(taskId, version, "TaskRegistry") as Task<TInput, TOutput>;
  }

  listIds(): string[] {
    return this.listNames();
  }

  get size(): number {
    let count = 0;
    for (const versions of this.items.values()) {
      count += versions.size;
    }
    return count;
  }
}

/** Singleton task registry instance. */
export const taskRegistry = new TaskRegistry();
