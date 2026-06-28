/**
 * ai/agent/image.agent.js
 *
 * Responsibility:
 *   ImageAgent — annotates an article with image-related AI outputs.
 *   Can analyze existing images or suggest new ones section-by-section.
 *
 *   Input:  { outline?: ArticleOutline, images?: ImageRef[], mode: "suggest" | "analyze" }
 *   Output: { suggestions: ImageSuggestion[], analyses: ImageAnalysis[] }
 *
 *   plan() returns (for "suggest" mode):
 *   One generateImagePrompt.step per outline section
 *
 *   plan() returns (for "analyze" mode):
 *   One analyzeImage.step per image in the images[] array
 *
 * Why it exists:
 *   Image intelligence is needed at two distinct points: during planning
 *   (suggest images for sections) and post-upload (generate alt text /
 *   captions). Same agent handles both modes via its dynamic plan().
 */
