// =============================================================================
//  AI IMAGE GENERATION SERVICE
//  ai/image-generation/index.ts
//
//  Central orchestration:
//  1. ImageGenerationRegistry — maps provider IDs → ImageGenerationProvider.
//  2. AIImageGenerationService — selects provider, generates, exports barrel.
//
//  Pattern mirrors ai/vision/index.ts for architectural consistency.
// =============================================================================

import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "./types";

export * from "./types";
export { GeminiImagenProvider } from "./gemini.imagen.provider";
export {
  OpenAIImageProvider,
  IdeogramProvider,
  FluxProvider,
  StableDiffusionProvider,
} from "./stubs";

// ─── Registry ────────────────────────────────────────────────────────────────

export class ImageGenerationRegistry {
  private readonly providers = new Map<string, ImageGenerationProvider>();
  private activeId: string | null = null;

  register(provider: ImageGenerationProvider): void {
    this.providers.set(provider.id, provider);
  }

  setActive(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(
        `Image generation provider "${id}" is not registered. ` +
        `Available: [${this.list().join(", ")}]`
      );
    }
    this.activeId = id;
  }

  getActive(): ImageGenerationProvider {
    const id = this.activeId;
    if (!id) throw new Error("No active image generation provider set.");
    return this.providers.get(id)!;
  }

  get(id: string): ImageGenerationProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Image generation provider "${id}" not found.`);
    return p;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): string[] {
    return [...this.providers.keys()];
  }

  /** Returns all providers that are available (have credentials configured). */
  listAvailable(): ImageGenerationProvider[] {
    return [...this.providers.values()].filter((p) => p.available);
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

class AIImageGenerationService {
  readonly registry: ImageGenerationRegistry;

  constructor() {
    this.registry = new ImageGenerationRegistry();
    this._bootstrap();
  }

  private _bootstrap(): void {
    const { GeminiImagenProvider } = require("./gemini.imagen.provider");
    const {
      OpenAIImageProvider,
      IdeogramProvider,
      FluxProvider,
      StableDiffusionProvider,
    } = require("./stubs");

    const gemini = new GeminiImagenProvider();
    this.registry.register(gemini);
    this.registry.register(new OpenAIImageProvider());
    this.registry.register(new IdeogramProvider());
    this.registry.register(new FluxProvider());
    this.registry.register(new StableDiffusionProvider());

    // Default to Gemini Imagen
    if (gemini.available) {
      this.registry.setActive("gemini-imagen");
    } else {
      // Fall back to first available
      const available = this.registry.listAvailable();
      if (available.length > 0) {
        this.registry.setActive(available[0].id);
        console.warn(
          `[AIImageGenerationService] GEMINI_API_KEY not set; falling back to "${available[0].id}".`
        );
      } else {
        console.error(
          "[AIImageGenerationService] No image generation providers available. Configure at least one API key."
        );
      }
    }
  }

  /**
   * Generate images with the currently active provider.
   */
  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const provider = this.registry.getActive();
    console.log(`[AIImageGenerationService] Generating via "${provider.id}" — prompt: "${request.prompt.slice(0, 80)}..."`);
    return provider.generate(request);
  }

  /**
   * Generate images with a specific provider by ID.
   */
  async generateWith(providerId: string, request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const provider = this.registry.get(providerId);
    return provider.generate(request);
  }

  /**
   * Returns metadata about all registered providers (for API capabilities endpoint).
   */
  getProviderMetadata(): Array<{ id: string; displayName: string; available: boolean; active: boolean }> {
    const activeId = this.registry.listAvailable()[0]?.id ?? null;
    return this.registry.list().map((id) => {
      const p = this.registry.get(id);
      return {
        id: p.id,
        displayName: p.displayName,
        available: p.available,
        active: p.id === (this.registry.listAvailable().length > 0 ? this.registry.getActive().id : null),
      };
    });
  }
}

export const aiImageGenerationService = new AIImageGenerationService();
