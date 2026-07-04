/**
 * =============================================================================
 *  AI VISION MODULE — PUBLIC ENTRY POINT
 *  ai/vision/index.ts
 * =============================================================================
 */

import type { ImageAIProvider, ImageAnalysisResult } from "./types";
import { GeminiVisionProvider } from "./gemini.vision";
import { OpenAIVisionProvider } from "./openai.vision";
import { ClaudeVisionProvider } from "./claude.vision";
import { AzureVisionProvider } from "./azure.vision";

export * from "./types";
export { GeminiVisionProvider } from "./gemini.vision";
export { OpenAIVisionProvider } from "./openai.vision";
export { ClaudeVisionProvider } from "./claude.vision";
export { AzureVisionProvider } from "./azure.vision";

class AIVisionService {
  private activeProvider!: ImageAIProvider;
  private readonly providers = new Map<string, ImageAIProvider>();

  constructor() {
    // 1. Instantiate and register default providers
    const gemini = new GeminiVisionProvider();
    this.registerProvider(gemini);
    
    // Register optional fallback configurations
    this.registerProvider(new OpenAIVisionProvider());
    this.registerProvider(new ClaudeVisionProvider());
    this.registerProvider(new AzureVisionProvider());

    // 2. Set default active provider
    this.activeProvider = gemini;
  }

  /**
   * Register a new vision provider.
   */
  registerProvider(provider: ImageAIProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Hot-swaps the active provider at runtime.
   */
  setProvider(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`AI Vision Provider '${providerId}' is not registered in this system.`);
    }
    this.activeProvider = provider;
    console.log(`[AIVisionService] Active vision provider switched to: ${providerId}`);
  }

  /**
   * Retrieves the active vision provider.
   */
  getActiveProvider(): ImageAIProvider {
    return this.activeProvider;
  }

  /**
   * Analyzes an image URL using the currently active provider.
   */
  async analyze(imageUrl: string, options?: { signal?: AbortSignal }): Promise<ImageAnalysisResult> {
    const provider = this.activeProvider;
    
    try {
      const result = await provider.analyzeImage(imageUrl, options);

      // Perform cross-provider schema conformance and validation checks
      if (!result.alt || result.alt.trim() === "") {
        throw new Error(`Vision provider '${provider.id}' returned empty alt text.`);
      }
      if (!result.description || result.description.trim() === "") {
        throw new Error(`Vision provider '${provider.id}' returned empty description.`);
      }
      if (!Array.isArray(result.tags)) {
        throw new Error(`Vision provider '${provider.id}' returned invalid tags schema.`);
      }

      return result;
    } catch (err: any) {
      console.error(`[AIVisionService] Execution failure using active provider '${provider.id}':`, err.message);
      throw err;
    }
  }
}

export const aiVisionService = new AIVisionService();
