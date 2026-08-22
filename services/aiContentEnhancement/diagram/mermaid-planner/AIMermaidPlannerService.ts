/**
 * AIMermaidPlannerService.ts
 *
 * Analyzes markdown article headings and technical sections to determine
 * which sections benefit from Mermaid diagrams and which diagram type to use.
 * OpenIdear AI Content Enhancement System - Sprint 3
 */

import { providerRegistry } from "../../../../ai/provider";
import { aiLogger } from "../../../../ai/telemetry";
import { DiagramPlanSchema, DiagramSuggestionSchema, type DiagramPlan, type DiagramSuggestion } from "../schemas/diagram.schema";

interface PlannerInput {
  title: string;
  markdownContent: string;
  userId?: string;
  maxDiagrams?: number;
}

const TECHNICAL_KEYWORDS = [
  "architecture", "network", "request flow", "microservices",
  "ci/cd", "cicd", "pipeline", "authentication", "auth",
  "deployment", "database", "schema", "state machine",
  "state transition", "workflow", "infrastructure", "api gateway",
  "docker", "kubernetes", "load balancer", "message queue",
];

export class AIMermaidPlannerService {
  /**
   * Analyzes markdown and returns a structured DiagramPlan
   * with suggestions for which sections should have diagrams.
   */
  async plan(input: PlannerInput): Promise<DiagramPlan> {
    const startTime = Date.now();
    const maxDiagrams = input.maxDiagrams || 3;

    // Extract headings with their content
    const sections = this.extractSections(input.markdownContent);

    // Filter to only technical sections
    const technicalSections = sections.filter((s) =>
      this.isTechnicalSection(s.heading, s.content)
    );

    if (technicalSections.length === 0) {
      return { suggestions: [], totalSuggestions: 0 };
    }

    // Build prompt for the AI to suggest diagram types
    const provider = providerRegistry.getDefault();
    const sectionSummaries = technicalSections
      .slice(0, 10) // cap sections to avoid token overload
      .map((s, i) => `${i + 1}. "${s.heading}" — ${s.content.slice(0, 200)}`)
      .join("\n");

    const systemPrompt = `You are a technical diagram planner. Given article section headings and excerpts, suggest which sections would benefit from a Mermaid diagram.

Rules:
- Only suggest diagrams for sections about: architecture, network flows, request flows, microservices, CI/CD, authentication, deployment, database relationships, state transitions.
- Do NOT suggest diagrams for introductions, conclusions, or simple explanations.
- Maximum ${maxDiagrams} diagrams total.
- For each suggestion, choose one diagramType: "flowchart", "sequence", "state", "er", or "architecture".
- Return ONLY valid JSON: { "suggestions": [{ "heading": "...", "position": 0, "diagramType": "flowchart", "purpose": "...", "priority": 1 }], "totalSuggestions": N }`;

    const userPrompt = `Article title: "${input.title}"\n\nSections:\n${sectionSummaries}`;

    try {
      const result = await provider.generateJSON(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { model: "fast", temperature: 0.2 }
      );

      const parsed = DiagramPlanSchema.parse(result);

      await aiLogger.log({
        providerId: provider.id,
        model: "fast",
        prompt: { system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
        durationMs: Date.now() - startTime,
        response: JSON.stringify(parsed),
        promptName: "mermaid_planner",
        promptVersion: "v1",
      });

      return parsed;
    } catch (err: any) {
      // Fallback: use heuristic-based planning without AI
      const suggestions = this.heuristicPlan(technicalSections, maxDiagrams);
      return { suggestions, totalSuggestions: suggestions.length };
    }
  }

  /**
   * Extracts markdown sections by heading.
   */
  private extractSections(markdown: string): Array<{ heading: string; content: string; position: number }> {
    const lines = markdown.split("\n");
    const sections: Array<{ heading: string; content: string; position: number }> = [];
    let currentHeading = "";
    let currentContent: string[] = [];
    let currentPosition = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

      if (headingMatch) {
        if (currentHeading) {
          sections.push({
            heading: currentHeading,
            content: currentContent.join("\n"),
            position: currentPosition,
          });
        }
        currentHeading = headingMatch[2].trim();
        currentContent = [];
        currentPosition = i;
      } else {
        currentContent.push(line);
      }
    }

    // Push final section
    if (currentHeading) {
      sections.push({
        heading: currentHeading,
        content: currentContent.join("\n"),
        position: currentPosition,
      });
    }

    return sections;
  }

  /**
   * Determines if a section is technical enough for a diagram.
   */
  private isTechnicalSection(heading: string, content: string): boolean {
    const combined = `${heading} ${content}`.toLowerCase();
    return TECHNICAL_KEYWORDS.some((kw) => combined.includes(kw));
  }

  /**
   * Fallback heuristic planner when AI is unavailable.
   */
  private heuristicPlan(
    sections: Array<{ heading: string; content: string; position: number }>,
    max: number
  ): DiagramSuggestion[] {
    return sections.slice(0, max).map((s, i) => ({
      heading: s.heading,
      position: s.position,
      diagramType: this.inferDiagramType(s.heading, s.content),
      purpose: `Visualize ${s.heading}`,
      priority: i + 1,
    }));
  }

  /**
   * Infers diagram type from content keywords.
   */
  private inferDiagramType(heading: string, content: string): "flowchart" | "sequence" | "state" | "er" | "architecture" {
    const text = `${heading} ${content}`.toLowerCase();
    if (text.includes("state") || text.includes("transition")) return "state";
    if (text.includes("database") || text.includes("schema") || text.includes("entity")) return "er";
    if (text.includes("request") || text.includes("api") || text.includes("sequence")) return "sequence";
    if (text.includes("architecture") || text.includes("infrastructure")) return "architecture";
    return "flowchart";
  }
}

export const aiMermaidPlannerService = new AIMermaidPlannerService();
