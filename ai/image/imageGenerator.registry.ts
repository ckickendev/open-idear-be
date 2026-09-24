// =============================================================================
//  IMAGE GENERATOR REGISTRY
//  ai/image/imageGenerator.registry.ts
//
//  Design Decisions:
//  - Manages all registered ImageGenerator implementations.
//  - Strictly enforces that only one active generator is used by the application.
//  - Decoupled from editor and controllers.
// =============================================================================

import type { ImageGenerator } from "./imageGenerator.interface";
import { GeminiImageGenerator } from "./providers/gemini.generator";
import { OpenAIImageGenerator, IdeogramImageGenerator } from "./providers/stubs.generator";

export class ImageGeneratorRegistry {
  private readonly providers = new Map<string, ImageGenerator>();
  private activeId: string = "gemini-imagen";

  constructor() {
    this.register(new GeminiImageGenerator());
    this.register(new OpenAIImageGenerator());
    this.register(new IdeogramImageGenerator());
  }

  register(provider: ImageGenerator): void {
    this.providers.set(provider.id, provider);
  }

  setActive(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(
        `Image generator "${id}" is not registered. Available: [${this.list().join(", ")}]`
      );
    }
    this.activeId = id;
  }

  getActive(): ImageGenerator {
    const provider = this.providers.get(this.activeId);
    if (!provider) {
      throw new Error(`Active image generator "${this.activeId}" not found in registry.`);
    }
    return provider;
  }

  get(id: string): ImageGenerator {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Image generator "${id}" not found.`);
    }
    return provider;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const imageGeneratorRegistry = new ImageGeneratorRegistry();
