// =============================================================================
//  AI IMAGE EDITING — SERVICE & REGISTRY
//  ai/image-editing/index.ts
//
//  Routes each operation to the correct provider:
//    crop, upscale          →  SharpEditProvider   (deterministic, local)
//    remove-bg, expand,
//    replace-object,
//    change-style           →  GeminiImageEditProvider  (AI, network)
//
//  Pattern mirrors ai/vision/index.ts — an internal registry + a singleton
//  service exported for use by the orchestration service.
// =============================================================================

import type { ImageEditProvider, ImageEditRequest, ImageEditResult, EditOperation } from "./types";

export * from "./types";
export { SharpEditProvider } from "./sharp.editor";
export { GeminiImageEditProvider } from "./gemini.imagen.editor";

// ─── Registry ─────────────────────────────────────────────────────────────────

class ImageEditRegistry {
  private readonly providers = new Map<string, ImageEditProvider>();

  register(provider: ImageEditProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** Find the best provider for a given operation. First registered wins. */
  resolve(operation: EditOperation): ImageEditProvider {
    for (const provider of this.providers.values()) {
      if ((provider.supportedOperations as string[]).includes(operation)) {
        return provider;
      }
    }
    throw new Error(
      `No image edit provider registered for operation "${operation}". ` +
      `Available providers: [${[...this.providers.keys()].join(", ")}]`
    );
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

class AIImageEditService {
  private readonly registry: ImageEditRegistry;

  constructor() {
    this.registry = new ImageEditRegistry();
    this._bootstrap();
  }

  private _bootstrap(): void {
    const { SharpEditProvider } = require("./sharp.editor");
    const { GeminiImageEditProvider } = require("./gemini.imagen.editor");

    // Sharp must be registered FIRST so it handles crop/upscale before Gemini
    this.registry.register(new SharpEditProvider());
    this.registry.register(new GeminiImageEditProvider());
  }

  async edit(request: ImageEditRequest): Promise<ImageEditResult> {
    const operation = request.params.operation;
    const provider = this.registry.resolve(operation);

    console.log(
      `[AIImageEditService] Editing via "${provider.id}" — operation: "${operation}"`
    );

    return provider.edit(request);
  }
}

export const aiImageEditService = new AIImageEditService();
