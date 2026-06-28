/**
 * ai/workflow/steps/generateImagePrompt.step.js
 *
 * Responsibility:
 *   Given a section of article content, generates a descriptive prompt
 *   suitable for image search queries or AI image generation.
 *   Also suggests where in the section the image should be placed.
 *
 *   Input:  { sectionTitle, sectionContent, articleTone }
 *   Output: { imagePrompt: string, placementHint: string, searchTerms: string[] }
 *
 * Why it exists:
 *   Used by ImageAgent when annotating a full article with image
 *   suggestions per section. Isolated as a step so it can be called
 *   independently for single-section image suggestions in the editor.
 */
