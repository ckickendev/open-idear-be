/**
 * ai/pipeline/pipelines/article.pipeline.js
 *
 * Responsibility:
 *   Defines the full article generation pipeline.
 *   This is the primary multi-agent workflow — the one behind "Generate Article".
 *
 *   Stages (in order):
 *   1. PlannerAgent   → ArticleOutline
 *   2. WriterAgent    → Draft HTML (streamed section-by-section)
 *   3. ReviewerAgent  → QualityReport (score, suggestions)
 *   4. SEOAgent       → SEOData (meta, slug, keywords, score)
 *   5. ImageAgent     → ImageSuggestions (per section)
 *
 *   Each stage includes a mapInput function that extracts what the next
 *   agent needs from the previous agent's output.
 *
 * Why it exists:
 *   The pipeline definition is data — it describes the composition, not
 *   the logic. Separating it from the runner means you can read this file
 *   and immediately understand the full article generation flow without
 *   tracing through any agent code.
 */
