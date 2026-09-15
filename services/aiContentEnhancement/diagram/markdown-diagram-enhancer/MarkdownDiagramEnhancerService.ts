/**
 * MarkdownDiagramEnhancerService.ts
 *
 * Injects generated Mermaid diagrams into Markdown content under target headings
 * while preserving original formatting, content, and preventing duplicate insertions.
 * OpenIdear AI Content Enhancement System - Sprint 3
 */

import { MermaidDiagram } from "../schemas/diagram.schema";

export interface DiagramEnhancementOptions {
  preserveOriginalFences?: boolean;
  addSpacingLines?: boolean;
}

export interface DiagramEnhancementOutput {
  markdown: string;
  insertedCount: number;
  skippedCount: number;
  insertedHeadings: string[];
}

export class MarkdownDiagramEnhancerService {
  /**
   * Enhances Markdown article by inserting corresponding Mermaid diagrams after matching headings.
   */
  public enhance(
    markdown: string,
    diagrams: MermaidDiagram[],
    options: DiagramEnhancementOptions = {}
  ): DiagramEnhancementOutput {
    if (!markdown || typeof markdown !== "string") {
      return {
        markdown: markdown || "",
        insertedCount: 0,
        skippedCount: 0,
        insertedHeadings: [],
      };
    }

    if (!diagrams || diagrams.length === 0) {
      return {
        markdown,
        insertedCount: 0,
        skippedCount: 0,
        insertedHeadings: [],
      };
    }

    const lines = markdown.split("\n");
    const insertedHeadings: string[] = [];
    let insertedCount = 0;
    let skippedCount = 0;

    // Create a lookup map of normalized heading -> MermaidDiagram
    const diagramMap = new Map<string, MermaidDiagram>();
    for (const diagram of diagrams) {
      if (diagram && diagram.heading && diagram.code) {
        const normKey = this.normalizeHeadingText(diagram.heading);
        diagramMap.set(normKey, diagram);
      }
    }

    const updatedLines: string[] = [];
    let idx = 0;

    while (idx < lines.length) {
      const line = lines[idx];
      updatedLines.push(line);

      // Check if line is a Markdown heading (#, ##, ###)
      if (this.isHeadingLine(line)) {
        const rawHeadingText = this.extractHeadingText(line);
        const normHeading = this.normalizeHeadingText(rawHeadingText);

        const matchingDiagram = diagramMap.get(normHeading);

        if (matchingDiagram) {
          // Check if diagram is already present immediately following this heading
          const alreadyHasDiagram = this.hasDiagramAhead(lines, idx + 1);

          if (!alreadyHasDiagram) {
            // Format and insert Mermaid block
            const formattedDiagramBlock = this.formatMermaidBlock(matchingDiagram.code);

            // Add clean spacing
            updatedLines.push("");
            updatedLines.push(...formattedDiagramBlock);
            updatedLines.push("");

            insertedHeadings.push(rawHeadingText);
            insertedCount++;
          } else {
            skippedCount++;
          }
        }
      }

      idx++;
    }

    return {
      markdown: updatedLines.join("\n"),
      insertedCount,
      skippedCount,
      insertedHeadings,
    };
  }

  /**
   * Checks if a line is a markdown heading (#, ##, ###).
   */
  public isHeadingLine(line: string): boolean {
    return /^#{1,3}\s+\S+/.test(line.trim());
  }

  /**
   * Extracts heading text without leading hashes.
   */
  public extractHeadingText(line: string): string {
    return line.replace(/^#{1,3}\s+/, "").trim();
  }

  /**
   * Normalizes heading text for comparison (lowercase, trimmed, stripped of special chars).
   */
  public normalizeHeadingText(heading: string): string {
    return heading
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim();
  }

  /**
   * Inspects subsequent lines to detect if a Mermaid diagram is already present.
   */
  public hasDiagramAhead(lines: string[], startIndex: number): boolean {
    let checkIdx = startIndex;

    // Scan up to 5 lines ahead, skipping empty lines
    while (checkIdx < lines.length && checkIdx < startIndex + 5) {
      const line = lines[checkIdx].trim();

      if (line === "") {
        checkIdx++;
        continue;
      }

      // If another heading starts, stop checking
      if (this.isHeadingLine(line)) {
        return false;
      }

      // Detect mermaid block fence opening or keyword
      if (
        line.startsWith("```mermaid") ||
        line.startsWith("graph TD") ||
        line.startsWith("flowchart TD") ||
        line.startsWith("sequenceDiagram") ||
        line.startsWith("stateDiagram-v2") ||
        line.startsWith("erDiagram")
      ) {
        return true;
      }

      // Non-empty line that isn't a diagram means no diagram immediately under heading
      return false;
    }

    return false;
  }

  /**
   * Formats raw Mermaid diagram code cleanly inside markdown code fences.
   */
  public formatMermaidBlock(rawCode: string): string[] {
    let cleanCode = rawCode.trim();

    // Strip existing code fences if included in code string
    cleanCode = cleanCode
      .replace(/^```(mermaid)?/i, "")
      .replace(/```$/, "")
      .trim();

    return ["```mermaid", cleanCode, "```"];
  }
}

export const markdownDiagramEnhancerService = new MarkdownDiagramEnhancerService();
