// =============================================================================
//  AI IMAGE EDITING — TYPES & CONTRACTS
//  ai/image-editing/types.ts
//
//  Discriminated union approach: each operation carries exactly the fields it
//  needs, no optional-everything objects. The service dispatches on operation.
//
//  Provider-agnostic: GeminiImageEditor, SharpEditor, and future providers
//  (Photoshop API, Stability AI, Clipdrop) all implement ImageEditProvider.
//
//  IMMUTABILITY RULE: Editing operations NEVER receive a writable path to the
//  original asset. They receive a read-only Buffer and return a new Buffer.
//  The service layer persists the result as a NEW MediaAsset.
// =============================================================================

// ─── Operations ───────────────────────────────────────────────────────────────

export type EditOperation =
  | "remove-background"
  | "upscale"
  | "crop"
  | "expand"
  | "replace-object"
  | "change-style";

export type UpscaleFactor = 2 | 4;

export type ExpandDirection = "top" | "right" | "bottom" | "left" | "all";

export type ChangeStylePreset =
  | "oil-painting"
  | "watercolor"
  | "anime"
  | "sketch"
  | "pixel-art"
  | "3d-render"
  | "vintage-photo"
  | "neon-cyberpunk";

// ─── Per-operation params (discriminated union) ───────────────────────────────

export type ImageEditParams =
  | { operation: "remove-background" }
  | { operation: "upscale"; factor: UpscaleFactor }
  | {
      operation: "crop";
      left: number;   // pixels from left edge
      top: number;    // pixels from top edge
      width: number;
      height: number;
    }
  | {
      operation: "expand";
      direction: ExpandDirection;
      /** What to fill the expanded area with. Defaults to "continue the scene naturally." */
      fillPrompt?: string;
      /** px to add (default 256). */
      pixels?: number;
    }
  | {
      operation: "replace-object";
      /** Natural language: "replace the red car with a bicycle" */
      targetDescription: string;
      replacementDescription: string;
    }
  | {
      operation: "change-style";
      preset: ChangeStylePreset;
      /** Free-form additional style instruction. */
      customPrompt?: string;
    };

// ─── Request / Result ─────────────────────────────────────────────────────────

export interface ImageEditRequest {
  /** Raw binary of the source image. */
  readonly sourceBuffer: Buffer;
  readonly sourceMimeType: string;
  readonly params: ImageEditParams;
  /** Cooperative cancellation. */
  readonly signal?: AbortSignal;
}

export interface ImageEditResult {
  /** Raw binary of the edited image — always a NEW buffer. */
  readonly resultBuffer: Buffer;
  readonly resultMimeType: string;
  /**
   * Human-readable summary of what was done.
   * Used to seed the description of the new MediaAsset.
   */
  readonly summary: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ImageEditProvider {
  readonly id: string;
  readonly displayName: string;
  /** Which operations this provider can handle. */
  readonly supportedOperations: ReadonlyArray<EditOperation>;

  edit(request: ImageEditRequest): Promise<ImageEditResult>;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class ImageEditError extends Error {
  override readonly name = "ImageEditError";

  constructor(
    message: string,
    public readonly operation: EditOperation,
    public readonly providerId: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
