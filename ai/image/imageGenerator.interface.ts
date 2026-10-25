// =============================================================================
//  IMAGE GENERATOR — INTERFACE & CONTRACTS
//  ai/image/imageGenerator.interface.ts
//
//  Design Decisions:
//  - Strictly decoupled provider abstraction for AI technical illustrations.
//  - No provider-specific code leaks to the editor or controller layers.
//  - Supports presets: Isometric, Blueprint, Flat Vector, 3D Technical.
//  - Guaranteed output: raw Buffer + revisedPrompt + seed for reproducibility.
// =============================================================================

export type IllustrationPreset =
  | "isometric"
  | "blueprint"
  | "flat_vector"
  | "3d_technical"
  | "technical-isometric"
  | "flat-vector"
  | "3d-technical";

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface GenerateIllustrationRequest {
  /** Raw base prompt, e.g. "Redis cache cluster architecture" */
  readonly prompt: string;

  /** Style preset to apply */
  readonly style?: IllustrationPreset | string;

  /** Target aspect ratio. Defaults to "16:9" for section visuals */
  readonly aspectRatio?: AspectRatio | string;

  /** Optional seed for reproducible regeneration */
  readonly seed?: number;

  /** Optional user identifier */
  readonly userId?: string;

  /** Optional suggestion ID linking to AI visual suggestion */
  readonly suggestionId?: string;

  /** Cooperative cancellation signal */
  readonly signal?: AbortSignal;
}

export interface GeneratedIllustrationResult {
  /** Binary image data ready for CDN upload or local caching */
  readonly buffer: Buffer;

  /** Output mime type (e.g. "image/png", "image/webp") */
  readonly mimeType: string;

  /** The technical prompt after preset expansion */
  readonly revisedPrompt: string;

  /** Model ID that produced the image */
  readonly model: string;

  /** Concrete seed used for generation */
  readonly seed: number;
}

/**
 * Universal interface for all AI technical illustration generators.
 * Decoupled provider abstraction conforming to Sprint 3 specification.
 */
export interface ImageGenerator {
  /** Unique stable provider identifier, e.g. "gemini-imagen", "openai-dalle3" */
  readonly id: string;

  /** Human-readable provider name */
  readonly displayName: string;

  /** Whether this generator is configured and available in the runtime environment */
  readonly isAvailable: boolean;

  /**
   * Generates a technical illustration matching the given request.
   */
  generate(request: GenerateIllustrationRequest): Promise<GeneratedIllustrationResult>;
}

/**
 * Alias conforming to the Sprint 3 ImageGenerationProvider naming requirement.
 */
export type ImageGenerationProvider = ImageGenerator;

