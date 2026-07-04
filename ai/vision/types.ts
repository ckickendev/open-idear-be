/**
 * =============================================================================
 *  AI VISION LAYER — TYPES & CONTRACTS
 *  ai/vision/types.ts
 * =============================================================================
 */

export interface ImageAnalysisResult {
  /** Short, descriptive alt text for accessibility (1-2 sentences) */
  readonly alt: string;
  /** Detailed description summarizing contents, layout, colors, and themes (2-4 sentences) */
  readonly description: string;
  /** Array of relevant lowercase single-word tags for search indexing */
  readonly tags: string[];
}

export interface ImageAIProvider {
  /** Unique provider identifier (e.g. "gemini-vision", "openai-vision") */
  readonly id: string;
  
  /**
   * Performs vision analysis on the given public image URL.
   * Downloads the image context and calls the provider endpoints.
   */
  analyzeImage(imageUrl: string, options?: { signal?: AbortSignal }): Promise<ImageAnalysisResult>;
}
