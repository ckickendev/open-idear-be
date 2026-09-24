// =============================================================================
//  PUBLISHER PIPELINE WORKFLOW
//  ai/workflow/publisherPipeline.workflow.ts
//
//  One-call server-side pipeline for the "Publish by AI" feature:
//    1. PlannerAgent     → structured outline (title, keywords, sections)
//    2. WriterAgent      → full Markdown article (non-streaming)
//    3. ContentStructure → ArticleBlock[] structured content
//    4. SEO derivation   → slug, description, tags from plan data
//
//  Design Decisions:
//  - Single synchronous execute() — no client-side orchestration needed.
//  - Reuses existing agents/services without duplicating AI logic.
//  - Returns a fully typed PublisherPipelineResult ready for the editor.
// =============================================================================

import { PlannerAgent, type PlannerInput, type PlannerOutline } from "../agent/planner.agent";
import { WriterAgent } from "../agent/writer.agent";
import type { ImageSuggestion, VisualSuggestion } from "../agent/writer.schema";
import { ContentStructureService, type ArticleBlock } from "../content/contentStructure.service";

// ─── Input / Output Types ─────────────────────────────────────────────────────

export interface PublisherPipelineInput {
  /** The user-supplied article topic. Required. */
  readonly topic: string;
  /** Target audience for the article. Defaults to "developers". */
  readonly audience?: string;
  /** Goal / purpose of the article. Defaults to "educate". */
  readonly goal?: string;
  /** Writing tone. Defaults to "informative". */
  readonly tone?: string;
  /** Article length target. Defaults to "medium". */
  readonly length?: string;
  /** Content category. Defaults to "general". */
  readonly category?: string;
  /** Optional extra instructions for the writer. */
  readonly additionalInstructions?: string;
}

export interface PublisherPipelineResult {
  /** Generated article title from the planner. */
  readonly title: string;
  /** URL-safe slug derived from the title. */
  readonly slug: string;
  /** Short SEO meta description (≤160 chars) from the start of the article. */
  readonly description: string;
  /** Suggested content category. */
  readonly category: string;
  /** Keyword tags from the planner. */
  readonly tags: string[];
  /** Structured ArticleBlock[] array ready for the editor. */
  readonly blocks: ArticleBlock[];
  /** Raw Markdown from the WriterAgent (kept for autosave and editor context). */
  readonly markdown: string;
  /** All keywords from the planner (superset of tags). */
  readonly keywords: string[];
  /** Estimated reading time in minutes. */
  readonly estimatedReadingTime: number;
  /** Optional AI section visual suggestions */
  readonly imageSuggestions?: ImageSuggestion[];
  /** Structured visual suggestions with classification, rationale and confidence */
  readonly visualSuggestions?: VisualSuggestion[];
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export class PublisherPipelineWorkflow {
  private readonly plannerAgent: PlannerAgent;
  private readonly writerAgent: WriterAgent;

  constructor(plannerAgent?: PlannerAgent, writerAgent?: WriterAgent) {
    this.plannerAgent = plannerAgent ?? new PlannerAgent();
    this.writerAgent = writerAgent ?? new WriterAgent();
  }

  /**
   * Executes the full publisher pipeline sequentially.
   * Throws on any stage failure — the controller handles error responses.
   */
  public async execute(
    input: PublisherPipelineInput,
    signal?: AbortSignal
  ): Promise<PublisherPipelineResult> {
    const options = { signal };

    // ── Stage 1: Planner ──────────────────────────────────────────────────────
    const plannerInput: PlannerInput = {
      topic: input.topic,
      audience: input.audience ?? "developers",
      goal: input.goal ?? "educate",
      tone: input.tone ?? "informative",
      length: input.length ?? "medium",
      category: input.category ?? "general",
    };

    const plannerResult = await this.plannerAgent.execute(plannerInput, options);
    if (!plannerResult.success || !plannerResult.data) {
      throw new Error("PublisherPipeline: Planner stage failed. Check server logs for details.");
    }
    const plan: PlannerOutline = plannerResult.data;

    // ── Stage 2: Writer (non-streaming) ───────────────────────────────────────
    const writerResult = await this.writerAgent.execute(
      {
        plan,
        additionalInstructions: input.additionalInstructions ?? "",
      },
      {
        ...options,
      }
    );

    if (!writerResult.success || !writerResult.data) {
      throw new Error("PublisherPipeline: Writer stage failed. Check server logs for details.");
    }
    const { markdown, estimatedReadingTime, imageSuggestions, visualSuggestions } = writerResult.data;

    // ── Stage 3: Content Structure ────────────────────────────────────────────
    const structureResult = ContentStructureService.buildArticleStructure({ markdown });
    const blocks = structureResult.blocks as ArticleBlock[];

    // ── Stage 4: SEO Derivation ───────────────────────────────────────────────
    const slug = plan.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Strip markdown syntax and cap at 160 chars for the meta description
    const description = markdown
      .replace(/#{1,6}\s+/g, "")   // remove headings
      .replace(/[*_`~]/g, "")       // remove inline markup
      .replace(/\n+/g, " ")         // flatten newlines
      .trim()
      .slice(0, 160);

    // Use up to 8 keywords as tags
    const tags = (plan.keywords ?? []).slice(0, 8);

    return {
      title: plan.title,
      slug,
      description,
      category: input.category ?? "general",
      tags,
      blocks,
      markdown,
      keywords: plan.keywords ?? [],
      estimatedReadingTime: estimatedReadingTime ?? Math.max(1, Math.ceil(markdown.split(/\s+/).length / 225)),
      imageSuggestions: imageSuggestions ?? [],
      visualSuggestions: visualSuggestions ?? [],
    };
  }
}
