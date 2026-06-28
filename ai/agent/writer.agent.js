/**
 * ai/agent/writer.agent.js
 *
 * Responsibility:
 *   WriterAgent — converts an ArticleOutline into a fully written draft.
 *   Streams the draft section-by-section so the editor can populate
 *   progressively without waiting for the full article.
 *
 *   Input:  { outline: ArticleOutline, tone, style, existingContent? }
 *   Output: { draft: string (HTML), sectionsWritten: number }
 *
 *   plan() returns one generateText.step per outline section, plus
 *   WRITE_INTRO and WRITE_CONCLUSION steps framing the content.
 *   Steps are yielded sequentially; each section is streamed individually.
 *
 * Why it exists:
 *   Writing is the most expensive agent in terms of tokens and latency.
 *   Making it stream section-by-section (rather than returning all at once)
 *   is critical for perceived performance at long-form article length.
 */
