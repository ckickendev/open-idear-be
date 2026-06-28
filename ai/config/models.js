/**
 * ai/config/models.js
 *
 * Responsibility:
 *   MODEL_ALIASES — maps semantic names to actual Gemini model identifiers.
 *
 *   Examples:
 *   fast    → "gemini-2.0-flash"      (default for most steps)
 *   quality → "gemini-2.5-pro"        (used for review/SEO scoring)
 *   vision  → "gemini-2.0-flash"      (required for analyzeImage.step)
 *
 * Why it exists:
 *   Model names change with every Gemini release. Using aliases means
 *   upgrading from flash-1 to flash-2 is a one-line change here rather
 *   than a grep across every step file.
 *   Aliases also make it obvious which model is used for which task —
 *   a comment next to "quality" explains the cost/latency tradeoff.
 */
