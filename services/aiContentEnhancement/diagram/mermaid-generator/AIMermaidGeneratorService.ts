/**
 * AIMermaidGeneratorService.ts
 *
 * Generates valid Mermaid diagram syntax from section heading, content,
 * and selected diagram type using the AI provider.
 * OpenIdear AI Content Enhancement System - Sprint 3
 */

import { providerRegistry } from "../../../../ai/provider";
import { aiLogger } from "../../../../ai/telemetry";
import { MermaidDiagramSchema, type MermaidDiagram } from "../schemas/diagram.schema";

interface GeneratorInput {
  sectionHeading: string;
  sectionContent: string;
  selectedDiagramType: string;
  articleContext: string;
  userId?: string;
}

const DIRECTIVE_MAP: Record<string, string> = {
  flowchart: "flowchart TD",
  architecture: "flowchart TD",
  sequence: "sequenceDiagram",
  state: "stateDiagram-v2",
  er: "erDiagram",
};

export class AIMermaidGeneratorService {
  /**
   * Generates a valid Mermaid diagram for a given section.
   */
  async generate(input: GeneratorInput): Promise<MermaidDiagram> {
    const startTime = Date.now();
    const directive = DIRECTIVE_MAP[input.selectedDiagramType] || "flowchart TD";
    const provider = providerRegistry.getDefault();

    const systemPrompt = `You are a Mermaid diagram generator. Generate valid Mermaid syntax for a technical diagram.

Diagram type: ${input.selectedDiagramType}
Directive header: ${directive}

Rules:
- Start with the correct directive: "${directive}"
- Use meaningful, short node labels (max 4 words per label).
- Use alphanumeric node IDs (e.g., A, B, nodeAuth).
- Keep diagrams concise: max 12 nodes, max 15 connections.
- Do NOT wrap output in markdown code fences (\`\`\`mermaid ... \`\`\`).
- Return ONLY the raw Mermaid syntax, nothing else.`;

    const userPrompt = `Section: "${input.sectionHeading}"
Content: ${input.sectionContent.slice(0, 800)}
Article context: ${input.articleContext.slice(0, 500)}`;

    try {
      const completion = await provider.complete(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { model: "fast", temperature: 0.3 }
      );

      let code = (completion.text || "").trim();

      // Strip any markdown code fences the LLM may have added
      code = code
        .replace(/^```mermaid\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      // Verify structural directive header is present
      const firstLine = code.split("\n")[0]?.trim().toLowerCase() || "";
      const hasValidDirective = Object.values(DIRECTIVE_MAP).some(
        (d) => firstLine.startsWith(d.toLowerCase())
      );

      if (!hasValidDirective) {
        code = `${directive}\n${code}`;
      }

      const diagram: MermaidDiagram = MermaidDiagramSchema.parse({
        heading: input.sectionHeading,
        code,
        diagramType: input.selectedDiagramType,
        purpose: `Diagram for: ${input.sectionHeading}`,
        priority: 1,
      });

      await aiLogger.log({
        providerId: provider.id,
        model: "fast",
        prompt: { system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
        durationMs: Date.now() - startTime,
        response: code,
        promptName: "mermaid_generator",
        promptVersion: "v1",
      });

      return diagram;
    } catch (err: any) {
      // Fallback: generate a minimal valid diagram
      const fallbackCode = this.generateFallback(
        input.sectionHeading,
        input.selectedDiagramType,
        directive
      );

      return {
        heading: input.sectionHeading,
        code: fallbackCode,
        diagramType: input.selectedDiagramType,
        purpose: `Fallback diagram for: ${input.sectionHeading}`,
        priority: 1,
      };
    }
  }

  /**
   * Generates a minimal valid Mermaid template as a fallback.
   */
  private generateFallback(heading: string, type: string, directive: string): string {
    const safeLabel = heading.replace(/[^a-zA-Z0-9\s]/g, "").slice(0, 30);

    switch (type) {
      case "sequence":
        return `sequenceDiagram\n    Client->>Server: Request\n    Server-->>Client: Response`;
      case "state":
        return `stateDiagram-v2\n    [*] --> Active\n    Active --> [*]`;
      case "er":
        return `erDiagram\n    ENTITY ||--o{ RELATED : has`;
      default:
        return `${directive}\n    A[${safeLabel}] --> B[Process]\n    B --> C[Result]`;
    }
  }
}

export const aiMermaidGeneratorService = new AIMermaidGeneratorService();
