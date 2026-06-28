/**
 * ai/workflow/steps/analyzeImage.step.js
 *
 * Responsibility:
 *   Vision step — sends an image (by URL) to the model along with an
 *   analysis prompt and returns structured metadata about the image.
 *
 *   Input:  { imageUrl, analysisType: "alt-text" | "caption" | "full" }
 *   Output: { altText, caption?, description?, tags?: string[] }
 *
 *   NOTE: This step requires a vision-capable model (Gemini Flash/Pro Vision).
 *   It must use ctx.provider with the "vision" model alias from config/models.js.
 *
 * Why it exists:
 *   Vision calls require different model parameters than text-only calls.
 *   Encapsulating that here prevents every image-related feature from
 *   having to handle multimodal message construction separately.
 */
