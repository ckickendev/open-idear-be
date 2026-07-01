// =============================================================================
//  STUB IMAGE GENERATION PROVIDERS
//  ai/image-generation/stubs.ts
//
//  Placeholder implementations for future providers.
//  Each stub is importable, registers in the service registry, and throws
//  a clear "not yet implemented" error at runtime — so the system starts
//  without errors and the providers appear in capability listings.
//
//  Add full implementation by replacing the generate() body.
// =============================================================================

import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
} from "./types";
import { ImageGenerationError } from "./types";

function notImplemented(id: string): never {
  throw new ImageGenerationError(
    `Provider "${id}" is not yet implemented. Configure the provider credentials and replace this stub.`,
    id,
    false
  );
}

// ─── OpenAI DALL-E 3 ─────────────────────────────────────────────────────────

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly id = "openai-dalle3";
  readonly displayName = "OpenAI DALL·E 3";

  get available(): boolean {
    return !!(process.env.OPENAI_API_KEY?.trim());
  }

  async generate(_request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    // TODO: implement using openai SDK
    // POST https://api.openai.com/v1/images/generations
    // model: "dall-e-3", response_format: "b64_json"
    notImplemented(this.id);
  }
}

// ─── Ideogram ─────────────────────────────────────────────────────────────────

export class IdeogramProvider implements ImageGenerationProvider {
  readonly id = "ideogram";
  readonly displayName = "Ideogram";

  get available(): boolean {
    return !!(process.env.IDEOGRAM_API_KEY?.trim());
  }

  async generate(_request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    // TODO: implement using Ideogram REST API
    // POST https://api.ideogram.ai/generate
    notImplemented(this.id);
  }
}

// ─── Flux (via Replicate) ────────────────────────────────────────────────────

export class FluxProvider implements ImageGenerationProvider {
  readonly id = "flux";
  readonly displayName = "Flux";

  get available(): boolean {
    return !!(process.env.REPLICATE_API_KEY?.trim());
  }

  async generate(_request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    // TODO: implement using Replicate API
    // Model: black-forest-labs/flux-schnell
    notImplemented(this.id);
  }
}

// ─── Stable Diffusion (via Stability AI) ─────────────────────────────────────

export class StableDiffusionProvider implements ImageGenerationProvider {
  readonly id = "stable-diffusion";
  readonly displayName = "Stable Diffusion";

  get available(): boolean {
    return !!(process.env.STABILITY_API_KEY?.trim());
  }

  async generate(_request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    // TODO: implement using Stability AI REST API
    // POST https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image
    notImplemented(this.id);
  }
}
