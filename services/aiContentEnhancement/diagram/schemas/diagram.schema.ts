/**
 * diagram.schema.ts
 *
 * Zod schemas and TypeScript types for the Mermaid Enhancement System.
 * OpenIdear AI Content Enhancement System - Sprint 3
 */

import { z } from "zod";

// ─── Diagram Type Enum ──────────────────────────────────────────────────────

export const DiagramTypeEnum = z.enum([
  "flowchart",
  "sequence",
  "architecture",
  "state",
  "er",
]);

export type DiagramType = z.infer<typeof DiagramTypeEnum>;

// ─── Diagram Suggestion ─────────────────────────────────────────────────────

export const DiagramSuggestionSchema = z.object({
  heading: z.string(),
  position: z.number(),
  diagramType: DiagramTypeEnum,
  purpose: z.string(),
  priority: z.number().min(1).max(5),
});

export type DiagramSuggestion = z.infer<typeof DiagramSuggestionSchema>;

// ─── Diagram Plan ────────────────────────────────────────────────────────────

export const DiagramPlanSchema = z.object({
  suggestions: z.array(DiagramSuggestionSchema),
  totalSuggestions: z.number(),
});

export type DiagramPlan = z.infer<typeof DiagramPlanSchema>;

// ─── Mermaid Diagram ─────────────────────────────────────────────────────────

export const MermaidDiagramSchema = z.object({
  heading: z.string(),
  code: z.string(),
  diagramType: z.string(),
  purpose: z.string(),
  priority: z.number(),
});

export type MermaidDiagram = z.infer<typeof MermaidDiagramSchema>;

// ─── Diagram Enhancement Result ──────────────────────────────────────────────

export const DiagramEnhancementResultSchema = z.object({
  enhancedMarkdown: z.string(),
  insertedDiagrams: z.array(MermaidDiagramSchema),
  skippedDiagrams: z.array(DiagramSuggestionSchema),
  diagramStatistics: z.object({
    planned: z.number(),
    generated: z.number(),
    inserted: z.number(),
    skipped: z.number(),
  }),
});

export type DiagramEnhancementResult = z.infer<typeof DiagramEnhancementResultSchema>;
