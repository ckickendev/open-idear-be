// =============================================================================
//  SHARP IMAGE EDIT PROVIDER
//  ai/image-editing/sharp.editor.ts
//
//  Handles deterministic, non-AI editing operations:
//    - crop    (exact region extraction)
//    - upscale (Lanczos3 resampling for sharpness)
//
//  Design decisions:
//  - No external API calls, no network, no API key required.
//  - Uses the same Sharp version already installed for the upload pipeline.
//  - Always returns a new buffer — never mutates the source.
//  - Upscale uses `.resize()` with `kernel: "lanczos3"` — best quality for
//    photos; can be swapped to a super-resolution AI model (ESRGAN via
//    Replicate) by replacing this provider with an AIUpscaleProvider.
// =============================================================================

import sharp from "sharp";
import type {
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  EditOperation,
} from "./types";
import { ImageEditError } from "./types";

export class SharpEditProvider implements ImageEditProvider {
  readonly id = "sharp";
  readonly displayName = "Sharp (local)";
  readonly supportedOperations: ReadonlyArray<EditOperation> = ["crop", "upscale"];

  async edit(request: ImageEditRequest): Promise<ImageEditResult> {
    const { sourceBuffer, params, signal } = request;

    signal?.throwIfAborted?.();

    try {
      switch (params.operation) {
        case "crop":
          return await this._crop(sourceBuffer, params);
        case "upscale":
          return await this._upscale(sourceBuffer, params.factor);
        default:
          throw new ImageEditError(
            `SharpEditProvider does not handle operation "${(params as any).operation}".`,
            (params as any).operation,
            this.id,
            false
          );
      }
    } catch (err: any) {
      if (err instanceof ImageEditError) throw err;
      throw new ImageEditError(err.message, params.operation, this.id, false, err);
    }
  }

  // ── Crop ──────────────────────────────────────────────────────────────────

  private async _crop(
    buffer: Buffer,
    params: { left: number; top: number; width: number; height: number }
  ): Promise<ImageEditResult> {
    const meta = await sharp(buffer).metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;

    // Clamp to image bounds
    const left   = Math.max(0, Math.min(params.left,  imgW - 1));
    const top    = Math.max(0, Math.min(params.top,   imgH - 1));
    const width  = Math.min(params.width,  imgW - left);
    const height = Math.min(params.height, imgH - top);

    if (width <= 0 || height <= 0) {
      throw new ImageEditError(
        "Crop region is outside the image bounds.",
        "crop",
        this.id,
        false
      );
    }

    const resultBuffer = await sharp(buffer)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();

    return {
      resultBuffer,
      resultMimeType: "image/png",
      summary: `Cropped to ${width}×${height}px from (${left}, ${top}).`,
    };
  }

  // ── Upscale ───────────────────────────────────────────────────────────────

  private async _upscale(buffer: Buffer, factor: 2 | 4): Promise<ImageEditResult> {
    const meta = await sharp(buffer).metadata();
    const newW = (meta.width  ?? 512) * factor;
    const newH = (meta.height ?? 512) * factor;

    const resultBuffer = await sharp(buffer)
      .resize(newW, newH, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();

    return {
      resultBuffer,
      resultMimeType: "image/png",
      summary: `Upscaled ${factor}× to ${newW}×${newH}px using Lanczos3.`,
    };
  }
}
