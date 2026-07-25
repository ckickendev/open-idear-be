// =============================================================================
//  AI ORCHESTRATION PLATFORM — CONDITION EVALUATOR
//  ai/orchestration/condition/index.ts
//
//  Design Decisions:
//  - Evaluates standard conditions (state, step, always, success, failure).
//  - Supports compound boolean composition (and, or, not).
//  - Supports custom condition plugins via CustomConditionRegistry.
//  - Stateless condition evaluation logic.
// =============================================================================

import type { ConditionExpression, StepRecord } from "../contracts";

export type CustomConditionEvaluatorFn = (
  shared: Readonly<Record<string, any>>,
  steps: Readonly<Record<string, StepRecord>>,
  args?: Record<string, any>
) => boolean;

export class CustomConditionRegistry {
  private readonly evaluators = new Map<string, CustomConditionEvaluatorFn>();

  register(evaluatorId: string, fn: CustomConditionEvaluatorFn): this {
    this.evaluators.set(evaluatorId, fn);
    return this;
  }

  resolve(evaluatorId: string): CustomConditionEvaluatorFn {
    const fn = this.evaluators.get(evaluatorId);
    if (fn === undefined) {
      throw new Error(`[CustomConditionRegistry] Evaluator "${evaluatorId}" is not registered.`);
    }
    return fn;
  }

  has(evaluatorId: string): boolean {
    return this.evaluators.has(evaluatorId);
  }
}

export const customConditionRegistry = new CustomConditionRegistry();

export class ConditionEvaluator {
  static evaluate(
    condition: ConditionExpression,
    shared: Readonly<Record<string, any>>,
    steps: Readonly<Record<string, StepRecord>>
  ): boolean {
    switch (condition.type) {
      case "always":
        return true;
      case "success":
        return ConditionEvaluator.evaluateSuccess(condition, steps);
      case "failure":
        return ConditionEvaluator.evaluateFailure(condition, steps);
      case "state":
        return ConditionEvaluator.evaluateState(condition, shared);
      case "step":
        return ConditionEvaluator.evaluateStep(condition, steps);
      case "custom":
        return ConditionEvaluator.evaluateCustom(condition, shared, steps);
      case "and":
        return condition.conditions.every((c) =>
          ConditionEvaluator.evaluate(c, shared, steps)
        );
      case "or":
        return condition.conditions.some((c) =>
          ConditionEvaluator.evaluate(c, shared, steps)
        );
      case "not":
        return !ConditionEvaluator.evaluate(condition.condition, shared, steps);
    }
  }

  private static evaluateSuccess(
    condition: Extract<ConditionExpression, { type: "success" }>,
    steps: Readonly<Record<string, StepRecord>>
  ): boolean {
    if (condition.stepId !== undefined) {
      const record = steps[condition.stepId];
      return record !== undefined && (record.status === "succeeded" || record.status === "skipped");
    }
    // General run success: no step has failed
    return !Object.values(steps).some((r) => r.status === "failed");
  }

  private static evaluateFailure(
    condition: Extract<ConditionExpression, { type: "failure" }>,
    steps: Readonly<Record<string, StepRecord>>
  ): boolean {
    if (condition.stepId !== undefined) {
      const record = steps[condition.stepId];
      return record !== undefined && record.status === "failed";
    }
    // General run failure: at least one step has failed
    return Object.values(steps).some((r) => r.status === "failed");
  }

  private static evaluateState(
    condition: Extract<ConditionExpression, { type: "state" }>,
    shared: Readonly<Record<string, any>>
  ): boolean {
    const actual = ConditionEvaluator.resolvePath(condition.key, shared);

    switch (condition.operator) {
      case "exists":
        return actual !== undefined && actual !== null;
      case "notExists":
        return actual === undefined || actual === null;
      case "eq":
        return actual === condition.value;
      case "neq":
        return actual !== condition.value;
      case "gt":
        return typeof actual === "number" && typeof condition.value === "number"
          ? actual > condition.value
          : false;
      case "lt":
        return typeof actual === "number" && typeof condition.value === "number"
          ? actual < condition.value
          : false;
      case "gte":
        return typeof actual === "number" && typeof condition.value === "number"
          ? actual >= condition.value
          : false;
      case "lte":
        return typeof actual === "number" && typeof condition.value === "number"
          ? actual <= condition.value
          : false;
      case "includes":
        return Array.isArray(actual)
          ? actual.includes(condition.value)
          : typeof actual === "string" && typeof condition.value === "string"
          ? actual.includes(condition.value)
          : false;
    }
  }

  private static evaluateStep(
    condition: Extract<ConditionExpression, { type: "step" }>,
    steps: Readonly<Record<string, StepRecord>>
  ): boolean {
    const record = steps[condition.stepId];
    if (record === undefined) return false;
    return record.status === condition.status;
  }

  private static evaluateCustom(
    condition: Extract<ConditionExpression, { type: "custom" }>,
    shared: Readonly<Record<string, any>>,
    steps: Readonly<Record<string, StepRecord>>
  ): boolean {
    const fn = customConditionRegistry.resolve(condition.evaluatorId);
    return fn(shared, steps, condition.args);
  }

  private static resolvePath(key: string, source: Record<string, any>): unknown {
    return key.split(".").reduce<unknown>((current, segment) => {
      if (current !== null && typeof current === "object" && segment in (current as object)) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, source);
  }
}
