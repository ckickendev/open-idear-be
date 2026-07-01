import { providerRegistry } from "../provider";

// ─── Supported diagram types ─────────────────────────────────────────────────

export type DiagramType =
  | "flowchart"
  | "sequence"
  | "er"
  | "class"
  | "architecture"
  | "auto";

export interface DiagramRequest {
  editorContent: string;
  diagramType: DiagramType;
  additionalInstructions?: string;
}

export interface DiagramResult {
  mermaidCode: string;
  diagramType: DiagramType;
  title: string;
  description: string;
}

// ─── Per-type generation instructions ────────────────────────────────────────

const TYPE_INSTRUCTIONS: Record<DiagramType, string> = {
  flowchart: `Generate a Mermaid FLOWCHART diagram (flowchart TD or LR).
Use shapes: rectangles for processes [], diamonds for decisions {}, rounded for start/end (()).
Include clear directional arrows with meaningful labels.`,

  sequence: `Generate a Mermaid SEQUENCE DIAGRAM (sequenceDiagram).
Define actors/participants. Show request/response pairs with ->> and -->>.
Use activate/deactivate for async operations. Add notes where helpful.`,

  er: `Generate a Mermaid ER DIAGRAM (erDiagram).
Define entities with their attributes and data types.
Show relationships with cardinality (||--o{, ||--|{, etc.).
Use clear entity names in PascalCase.`,

  class: `Generate a Mermaid CLASS DIAGRAM (classDiagram).
Show classes with their properties and methods.
Include visibility modifiers (+public, -private, #protected).
Show inheritance, composition, and association relationships.`,

  architecture: `Generate a Mermaid ARCHITECTURE DIAGRAM using graph TD.
Group related components using subgraph blocks.
Show data flows and service dependencies.
Use descriptive node labels and directional arrows.`,

  auto: `Analyze the content and automatically determine the BEST diagram type.
Choose the most fitting Mermaid diagram type that visualizes the core concept.
Use standard Mermaid syntax for the chosen type.`,
};

// ─── DiagramAgent ─────────────────────────────────────────────────────────────

export class DiagramAgent {
  /**
   * Generates a Mermaid diagram from editor content.
   */
  async generate(request: DiagramRequest): Promise<DiagramResult> {
    const { editorContent, diagramType, additionalInstructions = "" } = request;

    if (!editorContent || !editorContent.trim()) {
      throw new Error("editorContent is required and cannot be empty.");
    }

    const provider = providerRegistry.getDefault();
    const typeInstruction = TYPE_INSTRUCTIONS[diagramType];

    const systemPrompt = `You are an expert software diagram generator specializing in Mermaid.js syntax.
Your job is to analyze technical content and produce clean, accurate Mermaid diagram code.

CRITICAL RULES:
1. Return ONLY a valid JSON object — no markdown wrappers, no extra text.
2. The mermaidCode field must contain ONLY pure Mermaid syntax — no backtick fences, no "mermaid" prefix.
3. Mermaid code must be valid and renderable. Test for syntax correctness.
4. Use descriptive, meaningful labels. Avoid generic names like "Node1".
5. If the content is ambiguous, make reasonable engineering assumptions and proceed.

FUTURE SUPPORT: This system will support PlantUML in the future. Design clean, portable diagrams.`;

    const userPrompt = `Analyze the following article/editor content and generate a Mermaid diagram.

DIAGRAM TYPE INSTRUCTIONS:
${typeInstruction}

${additionalInstructions ? `ADDITIONAL INSTRUCTIONS:\n${additionalInstructions}\n` : ""}

EDITOR CONTENT:
---
${editorContent.slice(0, 6000)}
---

Return a JSON object with this exact schema:
{
  "mermaidCode": "the complete Mermaid diagram code (pure syntax only, no fences)",
  "diagramType": "the Mermaid diagram type used (flowchart|sequenceDiagram|erDiagram|classDiagram)",
  "title": "a short, descriptive title for this diagram (max 60 chars)",
  "description": "1-2 sentences explaining what this diagram shows"
}`;

    const response = await provider.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3 }
    );

    // Parse and validate the JSON response
    const cleaned = response.text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as DiagramResult;

    if (!parsed.mermaidCode || !parsed.mermaidCode.trim()) {
      throw new Error("AI returned an empty diagram. Please try again with more detailed content.");
    }

    // Strip any accidental backtick fences from mermaidCode
    const cleanCode = parsed.mermaidCode
      .replace(/^```mermaid\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    return {
      mermaidCode: cleanCode,
      diagramType: (parsed.diagramType as DiagramType) || diagramType,
      title: parsed.title || "Generated Diagram",
      description: parsed.description || "",
    };
  }
}

export const diagramAgent = new DiagramAgent();
