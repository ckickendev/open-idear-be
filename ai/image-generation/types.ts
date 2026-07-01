// =============================================================================
//  AI IMAGE GENERATION — TYPES & CONTRACTS
//  ai/image-generation/types.ts
//
//  Provider-agnostic interface for AI image generation.
//  Mirrors the vision/types.ts pattern for consistency.
//
//  Design decisions:
//  - ImageGenerationRequest is provider-independent: no model IDs, no API keys.
//  - ImageGenerationResult returns a base64-encoded image so the caller can
//    save it to any storage backend without knowing which provider was used.
//  - aspectRatio uses semantic strings ("16:9", "1:1", "9:16") that each
//    provider maps to its own internal format.
//  - style is an optional hint; providers that don't support it ignore it.
//  - Future: streaming preview, prompt weighting, inpainting mask.
// =============================================================================

// ─── Request ──────────────────────────────────────────────────────────────────

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export type ImageStyle =
  | "photorealistic"
  | "digital-art"
  | "illustration"
  | "sketch"
  | "cinematic"
  | "minimalist";

export interface ImageGenerationRequest {
  /** The main image description prompt. */
  readonly prompt: string;

  /**
   * Optional negative prompt — describe what to exclude.
   * Not all providers support this; they will silently ignore it.
   */
  readonly negativePrompt?: string;

  /** Target output aspect ratio. Defaults to "1:1". */
  readonly aspectRatio?: AspectRatio;

  /** Aesthetic style hint. Defaults to "photorealistic". */
  readonly style?: ImageStyle;

  /** Number of images to generate in one call. Defaults to 1. Max 4. */
  readonly count?: number;

  /** AbortSignal for cooperative cancellation. */
  readonly signal?: AbortSignal;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface GeneratedImage {
  /**
   * Raw image binary as a Node.js Buffer.
   * The caller converts this to base64 for preview and uploads to CDN.
   */
  readonly buffer: Buffer;

  /** MIME type of the output image, e.g. "image/png", "image/jpeg". */
  readonly mimeType: string;

  /**
   * The finalized prompt that was actually sent to the provider,
   * including any style or quality enhancements the provider added.
   */
  readonly revisedPrompt?: string;
}

export interface ImageGenerationResult {
  /** Array of generated images (length 1–4). */
  readonly images: GeneratedImage[];

  /** How many generation credits / tokens were consumed (provider-specific). */
  readonly creditsUsed?: number;
}

// ─── Provider Interface ───────────────────────────────────────────────────────

/**
 * The single interface all AI image generation providers must implement.
 * No concrete provider type ever leaks out of ai/image-generation/.
 */
export interface ImageGenerationProvider {
  /** Stable identifier, e.g. "gemini-imagen", "openai-dalle3". */
  readonly id: string;

  /** Human-readable name shown in the UI. */
  readonly displayName: string;

  /** Whether this provider is available in the current environment. */
  readonly available: boolean;

  /**
   * Generate one or more images from a text prompt.
   * @throws {Error} on provider failure, quota exhaustion, or safety block.
   */
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ImageGenerationError extends Error {
  override readonly name = "ImageGenerationError";

  constructor(
    message: string,
    public readonly providerId: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
