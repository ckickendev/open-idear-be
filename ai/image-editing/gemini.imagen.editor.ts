// =============================================================================
//  GEMINI IMAGE EDIT PROVIDER
//  ai/image-editing/gemini.imagen.editor.ts
//
//  Handles AI-powered editing operations via the Gemini REST API:
//    - remove-background  →  gemini-2.0-flash-preview-image-generation
//    - expand             →  gemini-2.0-flash-preview-image-generation  (outpaint)
//    - replace-object     →  gemini-2.0-flash-preview-image-generation  (inpaint)
//    - change-style       →  gemini-2.0-flash-preview-image-generation
//
//  Design decisions:
//  - Uses the `gemini-2.0-flash-preview-image-generation` model which accepts
//    an image as input and can output a modified image as `inlineData`.
//  - The model is prompted with highly specific editing instructions to
//    constrain it to the requested operation only.
//  - All API calls go via axios (same as the Imagen generation provider) —
//    consistent error handling and timeout strategy.
//  - Change-style uses curated system prompts per preset instead of a
//    free-form style string, giving more predictable results.
//  - Returns a raw Buffer; the service layer handles CDN upload and DB save.
// =============================================================================

import axios from "axios";
import type {
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  EditOperation,
  ChangeStylePreset,
} from "./types";
import { ImageEditError } from "./types";

// ─── Gemini image-editing model ───────────────────────────────────────────────

const GEMINI_EDIT_MODEL = "gemini-2.0-flash-preview-image-generation";

// ─── Style prompt map ─────────────────────────────────────────────────────────

const STYLE_PROMPTS: Record<ChangeStylePreset, string> = {
  "oil-painting":    "Transform this image into a rich oil painting with visible brushstrokes, warm palette, and museum-quality depth. Preserve the composition exactly.",
  "watercolor":      "Convert this image to delicate watercolor art with soft edges, translucent washes, and gentle color bleeds. Keep the main subject recognizable.",
  "anime":           "Redraw this image in Japanese anime style: clean outlines, cel-shaded colors, large expressive eyes if faces present, vibrant palette.",
  "sketch":          "Transform into a detailed pencil sketch: precise linework, hatching for shadows, white background, monochrome, hand-drawn feel.",
  "pixel-art":       "Convert to 16-bit pixel art style with a limited color palette, visible pixel grid, and retro game aesthetic.",
  "3d-render":       "Re-render as a high-quality 3D CGI scene: subsurface scattering, global illumination, physically-based materials, cinematic render quality.",
  "vintage-photo":   "Apply vintage film photography effect: sepia tones, film grain, light leaks, faded highlights, vignette, 1970s Kodachrome look.",
  "neon-cyberpunk":  "Transform with cyberpunk neon aesthetic: dark environment, glowing neon signs (pink/cyan/purple), rain reflections, futuristic urban feel.",
};

// ─── GeminiImageEditProvider ──────────────────────────────────────────────────

export class GeminiImageEditProvider implements ImageEditProvider {
  readonly id = "gemini-imagen-edit";
  readonly displayName = "Gemini AI (image editing)";
  readonly supportedOperations: ReadonlyArray<EditOperation> = [
    "remove-background",
    "expand",
    "replace-object",
    "change-style",
  ];

  async edit(request: ImageEditRequest): Promise<ImageEditResult> {
    const { params, signal } = request;
    signal?.throwIfAborted?.();

    switch (params.operation) {
      case "remove-background":
        return this._callGemini(request, this._buildRemoveBgPrompt());
      case "expand":
        return this._callGemini(request, this._buildExpandPrompt(params.direction, params.fillPrompt, params.pixels));
      case "replace-object":
        return this._callGemini(request, this._buildReplacePrompt(params.targetDescription, params.replacementDescription));
      case "change-style":
        return this._callGemini(request, this._buildStylePrompt(params.preset, params.customPrompt));
      default:
        throw new ImageEditError(
          `GeminiImageEditProvider does not handle operation "${(params as any).operation}".`,
          (params as any).operation,
          this.id,
          false
        );
    }
  }

  // ── Core Gemini call ──────────────────────────────────────────────────────

  private async _callGemini(
    request: ImageEditRequest,
    editingPrompt: string
  ): Promise<ImageEditResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new ImageEditError(
        "GEMINI_API_KEY is not configured.",
        request.params.operation,
        this.id,
        false
      );
    }

    const base64Image = request.sourceBuffer.toString("base64");
    const mimeType = request.sourceMimeType || "image/jpeg";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EDIT_MODEL}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: editingPrompt },
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 1,
      },
    };

    let responseData: any;
    try {
      const response = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" },
        timeout: 120_000,
        signal: request.signal as any,
      });
      responseData = response.data;
    } catch (err: any) {
      if (err.name === "AbortError" || err.code === "ERR_CANCELED") {
        throw new ImageEditError("Image editing cancelled.", request.params.operation, this.id, false, err);
      }
      const status = err.response?.status ?? 0;
      const message = err.response?.data?.error?.message || err.message;
      const retryable = status === 429 || status >= 500;
      throw new ImageEditError(
        `Gemini editing API error (${status}): ${message}`,
        request.params.operation,
        this.id,
        retryable,
        err
      );
    }

    // Extract image from response parts
    const parts: any[] = responseData?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      // Log any text parts for debugging
      const textPart = parts.find((p: any) => p.text);
      throw new ImageEditError(
        `Gemini returned no image. Model message: ${textPart?.text ?? "No output — the prompt may have been blocked by safety filters."}`,
        request.params.operation,
        this.id,
        false
      );
    }

    const resultBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const resultMimeType: string = imagePart.inlineData.mimeType ?? "image/png";

    return {
      resultBuffer,
      resultMimeType,
      summary: this._buildSummary(request.params),
    };
  }

  // ── Prompt builders ───────────────────────────────────────────────────────

  private _buildRemoveBgPrompt(): string {
    return (
      "Remove the background from this image completely. " +
      "Keep the main subject perfectly intact with clean, sharp edges. " +
      "The background should become transparent (or white if transparency is not supported). " +
      "Do NOT change the subject in any way — same lighting, same colors, same details. " +
      "Output only the edited image."
    );
  }

  private _buildExpandPrompt(
    direction: string,
    fillPrompt?: string,
    pixels?: number
  ): string {
    const px = pixels ?? 256;
    const fill = fillPrompt?.trim() || "continue the scene naturally, matching the existing style, lighting, and environment";

    const directionMap: Record<string, string> = {
      top:    `extend the image upward by ~${px} pixels`,
      bottom: `extend the image downward by ~${px} pixels`,
      left:   `extend the image to the left by ~${px} pixels`,
      right:  `extend the image to the right by ~${px} pixels`,
      all:    `expand the image on all four sides by ~${px} pixels`,
    };

    return (
      `Expand this image by generating new content beyond its edges. Specifically: ${directionMap[direction] ?? directionMap.all}. ` +
      `Fill the new area with: ${fill}. ` +
      "Maintain perfect visual continuity — same perspective, lighting, color palette, and style as the original. " +
      "The seam between original and generated content must be invisible. " +
      "Output only the full expanded image."
    );
  }

  private _buildReplacePrompt(target: string, replacement: string): string {
    return (
      `In this image, find and replace "${target}" with "${replacement}". ` +
      "The replacement should look natural and match the scene's lighting, perspective, and style. " +
      "Keep everything else in the image exactly unchanged. " +
      "Output only the edited image."
    );
  }

  private _buildStylePrompt(preset: ChangeStylePreset, customPrompt?: string): string {
    const baseInstruction = STYLE_PROMPTS[preset] ??
      "Apply an artistic style transformation to this image while preserving the composition.";

    const extra = customPrompt?.trim()
      ? ` Additional requirement: ${customPrompt}.`
      : "";

    return `${baseInstruction}${extra} Output only the transformed image.`;
  }

  private _buildSummary(params: ImageEditRequest["params"]): string {
    switch (params.operation) {
      case "remove-background": return "Background removed, subject isolated.";
      case "expand":            return `Image expanded in direction "${params.direction}".`;
      case "replace-object":    return `Replaced "${params.targetDescription}" with "${params.replacementDescription}".`;
      case "change-style":      return `Style changed to "${params.preset}".`;
      default:                  return "AI image editing applied.";
    }
  }
}
