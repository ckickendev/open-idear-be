/**
 * ai/prompt/templates/image.prompts.js
 *
 * Responsibility:
 *   All prompts owned by the ImageAgent.
 *
 *   Exports:
 *   GENERATE_ALT_TEXT   — given image URL + surrounding content, produce alt text
 *   GENERATE_CAPTION    — given image + article context, produce a display caption
 *   GENERATE_IMG_PROMPT — given article section, produce an image search/gen prompt
 *   ANALYZE_IMAGE       — given image URL, describe its content for metadata
 *
 * Why it exists:
 *   Image prompts are multimodal — they include image data, not just text.
 *   Keeping them separate signals to developers that these prompts require
 *   a different provider call path (vision-capable model).
 */
