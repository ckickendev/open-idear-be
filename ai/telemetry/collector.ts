/**
 * ai/telemetry/collector.js
 *
 * Responsibility:
 *   TraceCollector — accumulates AIEvents emitted during a single agent run.
 *   One collector instance is created per run and passed via WorkflowContext.
 *
 *   API:
 *   startStep(stepName)                  — records step start time
 *   endStep(stepName, usage, success)    — records latency + token usage + outcome
 *   addEvent(event)                      — emit arbitrary AIEvent
 *   flush() → AgentRunDoc               — returns the completed run document
 *                                          ready for the logger to persist
 *
 * Why it exists:
 *   Steps and agents should not know anything about how events are stored.
 *   The collector is the write-only side of telemetry — it accumulates;
 *   it does not query or log. Keeping collection and persistence separate
 *   means you can swap the logger (MongoDB → external APM) without touching
 *   any step or agent code.
 */
