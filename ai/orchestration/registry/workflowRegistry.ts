// =============================================================================
//  AI ORCHESTRATION PLATFORM — WORKFLOW REGISTRY
//  ai/orchestration/registry/workflowRegistry.ts
//
//  Design Decisions:
//  - Multi-version registry: Map<name, Map<version, Workflow>> via BaseRegistry.
//  - Latest version is resolved when no version is specified.
//  - Supports lifecycle plugin hooks for observability.
//  - Validates dependency graph integrity on registration (fail-fast).
// =============================================================================

import type { Workflow, OrchestrationRegistryPlugin, StepDefinition } from "../contracts";
import { BaseRegistry } from "./baseRegistry";

export class WorkflowRegistry extends BaseRegistry<Workflow> {
  private readonly plugins: OrchestrationRegistryPlugin[] = [];

  protected override getIdentifier(workflow: Workflow): string {
    return workflow.name;
  }

  // ─── Plugin Management ──────────────────────────────────────────────────────

  addPlugin(plugin: OrchestrationRegistryPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  // ─── Registration & Unregistration Overrides ────────────────────────────────

  override register(workflow: Workflow): this {
    this.validateStepGraph(workflow.name, workflow.steps);
    super.register(workflow);
    this.plugins.forEach((p) => p.onWorkflowRegister?.(workflow));
    return this;
  }

  override unregister(name: string, version: string): this {
    super.unregister(name, version);
    this.plugins.forEach((p) => p.onWorkflowUnregister?.(name, version));
    return this;
  }

  override resolve(name: string, version?: string): Workflow {
    return super.resolve(name, version, "WorkflowRegistry");
  }

  // ─── Graph Validation ───────────────────────────────────────────────────────

  /**
   * Validates that no circular dependencies exist in the workflow's step graph.
   * Uses DFS cycle detection. Called at registration time so failures are immediate.
   */
  private validateStepGraph(name: string, steps: StepDefinition[]): void {
    const stepIds = new Set(steps.map((s) => s.id));

    // Check all dependsOn references resolve to known steps
    for (const step of steps) {
      for (const dep of step.dependsOn ?? []) {
        if (!stepIds.has(dep)) {
          throw new Error(
            `[WorkflowRegistry] Workflow "${name}": step "${step.id}" ` +
              `declares dependsOn "${dep}" which does not exist.`
          );
        }
      }
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adjacency = new Map<string, string[]>(
      steps.map((s) => [s.id, s.dependsOn ?? []])
    );

    const hasCycle = (node: string): boolean => {
      visited.add(node);
      inStack.add(node);
      for (const dep of adjacency.get(node) ?? []) {
        if (!visited.has(dep) && hasCycle(dep)) return true;
        if (inStack.has(dep)) return true;
      }
      inStack.delete(node);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id) && hasCycle(step.id)) {
        throw new Error(
          `[WorkflowRegistry] Workflow "${name}" contains a circular dependency ` +
            `involving step "${step.id}".`
        );
      }
    }
  }
}

/** Singleton workflow registry instance. */
export const workflowRegistry = new WorkflowRegistry();
