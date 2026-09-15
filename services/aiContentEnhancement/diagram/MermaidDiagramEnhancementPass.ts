/**
 * MermaidDiagramEnhancementPass.ts
 *
 * Implements IEnhancementPass for auto-detecting technical sections,
 * generating Mermaid diagrams, validating syntax, and injecting into Markdown.
 * OpenIdear AI Content Enhancement System - Sprint 3
 */

import { aiMermaidPlannerService } from "./mermaid-planner/AIMermaidPlannerService";
import { aiMermaidGeneratorService } from "./mermaid-generator/AIMermaidGeneratorService";
import { mermaidValidatorService } from "./mermaid-validator/AIMermaidValidatorService";
import { markdownDiagramEnhancerService } from "./markdown-diagram-enhancer/MarkdownDiagramEnhancerService";
import { MermaidDiagram, DiagramSuggestion } from "./schemas/diagram.schema";

export interface PipelineContext {
  userId?: string;
  markdown: string;
  options: {
    title?: string;
    enableImageEnhancement?: boolean;
    enableDiagrams?: boolean;
    maxDiagrams?: number;
    [key: string]: any;
  };
  warnings: string[];
  metadata: Record<string, any>;
}

export interface EnhancementPassResult {
  stepName: string;
  enhancedMarkdown: string;
  warnings: string[];
  metadata: {
    insertedDiagrams: MermaidDiagram[];
    skippedDiagrams: DiagramSuggestion[];
    diagramStatistics: {
      planned: number;
      generated: number;
      inserted: number;
      skipped: number;
    };
  };
}

export class MermaidDiagramEnhancementPass {
  public readonly passName = "MermaidDiagramEnhancementPass";

  public async execute(context: PipelineContext): Promise<EnhancementPassResult> {
    const warnings: string[] = [];
    const insertedDiagrams: MermaidDiagram[] = [];
    const skippedDiagrams: DiagramSuggestion[] = [];

    // Step 0: Check if diagram pass is enabled
    if (context.options.enableDiagrams === false) {
      return {
        stepName: this.passName,
        enhancedMarkdown: context.markdown,
        warnings: ["Diagram enhancement pass disabled by options."],
        metadata: {
          insertedDiagrams: [],
          skippedDiagrams: [],
          diagramStatistics: { planned: 0, generated: 0, inserted: 0, skipped: 0 },
        },
      };
    }

    // Step 1: Mermaid Planning
    let plan;
    try {
      plan = await aiMermaidPlannerService.plan({
        title: context.options.title || "Technical Article",
        markdownContent: context.markdown,
        userId: context.userId,
        maxDiagrams: context.options.maxDiagrams || 3,
      });
    } catch (err: any) {
      warnings.push(`Mermaid Planner failed: ${err.message}`);
      return {
        stepName: this.passName,
        enhancedMarkdown: context.markdown,
        warnings,
        metadata: {
          insertedDiagrams: [],
          skippedDiagrams: [],
          diagramStatistics: { planned: 0, generated: 0, inserted: 0, skipped: 0 },
        },
      };
    }

    if (!plan.suggestions || plan.suggestions.length === 0) {
      warnings.push("Mermaid Planner identified 0 technical sections suitable for diagrams.");
      return {
        stepName: this.passName,
        enhancedMarkdown: context.markdown,
        warnings,
        metadata: {
          insertedDiagrams: [],
          skippedDiagrams: [],
          diagramStatistics: { planned: 0, generated: 0, inserted: 0, skipped: 0 },
        },
      };
    }

    const plannedCount = plan.suggestions.length;
    let generatedCount = 0;

    // Step 2: Mermaid Generation & Step 3: Validation
    const validDiagrams: MermaidDiagram[] = [];

    for (const suggestion of plan.suggestions) {
      try {
        const diagram = await aiMermaidGeneratorService.generate({
          sectionHeading: suggestion.heading,
          sectionContent: suggestion.purpose,
          selectedDiagramType: suggestion.diagramType,
          articleContext: context.markdown.slice(0, 1000),
          userId: context.userId,
        });

        generatedCount++;

        // Validate generated diagram
        const validation = mermaidValidatorService.validate(diagram.code);
        if (validation.valid && validation.sanitizedCode) {
          diagram.code = validation.sanitizedCode;
          validDiagrams.push(diagram);
        } else {
          warnings.push(
            `Diagram for '${suggestion.heading}' failed validation: ${validation.errors.join("; ")}`
          );
          skippedDiagrams.push(suggestion);
        }
      } catch (err: any) {
        warnings.push(`Diagram generation failed for '${suggestion.heading}': ${err.message}`);
        skippedDiagrams.push(suggestion);
      }
    }

    // Step 4: Markdown Diagram Enhancement
    const enhancement = markdownDiagramEnhancerService.enhance(
      context.markdown,
      validDiagrams
    );

    const insertedCount = enhancement.insertedCount;
    const skippedCount = skippedDiagrams.length + enhancement.skippedCount;

    return {
      stepName: this.passName,
      enhancedMarkdown: enhancement.markdown,
      warnings,
      metadata: {
        insertedDiagrams: validDiagrams,
        skippedDiagrams,
        diagramStatistics: {
          planned: plannedCount,
          generated: generatedCount,
          inserted: insertedCount,
          skipped: skippedCount,
        },
      },
    };
  }
}

export const mermaidDiagramEnhancementPass = new MermaidDiagramEnhancementPass();
