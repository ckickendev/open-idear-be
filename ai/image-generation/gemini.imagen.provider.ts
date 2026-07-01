// =============================================================================
//  GEMINI IMAGEN PROVIDER
//  ai/image-generation/gemini.imagen.provider.ts
//
//  Implements ImageGenerationProvider using Google's Imagen 3 model via the
//  @google/generative-ai SDK's ImageGenerationModel API.
//
//  Design decisions:
//  - Uses GEMINI_API_KEY env variable; never instantiates another client.
//  - aspectRatio maps directly to Imagen 3's supported ratios.
//  - Style is appended to the prompt as suffix descriptors (Imagen has no
//    native style param yet), keeping prompt engineering in one place.
//  - Returns raw Buffer so the service layer handles CDN upload.
// =============================================================================

import axios from "axios";
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ImageGenerationResult,
  GeneratedImage,
} from "./types";
import { ImageGenerationError } from "./types";

// ─── Aspect Ratio Map ─────────────────────────────────────────────────────────

const ASPECT_RATIO_MAP: Record<string, string> = {
  "1:1":  "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3":  "4:3",
  "3:4":  "3:4",
};

// ─── Style Suffix Map ─────────────────────────────────────────────────────────

const STYLE_SUFFIXES: Record<string, string> = {
  "photorealistic": "photorealistic, high-resolution, sharp detail, professional photography",
  "digital-art":    "digital art style, vibrant colors, sharp lines, concept art",
  "illustration":   "illustration style, hand-drawn, artistic, detailed linework",
  "sketch":         "pencil sketch, black and white, detailed shading, hand-drawn",
  "cinematic":      "cinematic lighting, dramatic atmosphere, movie still, film grain",
  "minimalist":     "minimalist, clean, simple composition, limited color palette",
};

// ─── GeminiImagenProvider ────────────────────────────────────────────────────

export class GeminiImagenProvider implements ImageGenerationProvider {
  readonly id = "gemini-imagen";
  readonly displayName = "Gemini Imagen 3";

  get available(): boolean {
    return !!(process.env.GEMINI_API_KEY?.trim());
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new ImageGenerationError(
        "GEMINI_API_KEY is not configured.",
        this.id,
        false
      );
    }

    const {
      prompt,
      negativePrompt,
      aspectRatio = "1:1",
      style = "photorealistic",
      count = 1,
      signal,
    } = request;

    // Build the enriched prompt
    const styleSuffix = STYLE_SUFFIXES[style] ?? "";
    const enrichedPrompt = styleSuffix
      ? `${prompt.trim()}, ${styleSuffix}`
      : prompt.trim();

    const mappedRatio = ASPECT_RATIO_MAP[aspectRatio] ?? "1:1";
    const safeCount = Math.min(Math.max(1, count), 4);

    // Call Imagen 3 via REST API (imagen-3.0-generate-001)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`;

    const body: Record<string, any> = {
      instances: [{ prompt: enrichedPrompt }],
      parameters: {
        sampleCount: safeCount,
        aspectRatio: mappedRatio,
        ...(negativePrompt ? { negativePrompt } : {}),
      },
    };

    let responseData: any;
    try {
      const response = await axios.post(url, body, {
        headers: { "Content-Type": "application/json" },
        timeout: 120_000,
        signal: signal as any,
      });
      responseData = response.data;
    } catch (err: any) {
      if (err.name === "AbortError" || err.code === "ERR_CANCELED") {
        throw new ImageGenerationError("Image generation cancelled.", this.id, false, err);
      }
      const status = err.response?.status ?? 0;
      const message = err.response?.data?.error?.message || err.message;
      const retryable = status === 429 || status >= 500;
      throw new ImageGenerationError(
        `Gemini Imagen API error (${status}): ${message}`,
        this.id,
        retryable,
        err
      );
    }

    // Parse predictions — each contains a base64 PNG
    const predictions: any[] = responseData?.predictions ?? [];
    if (!predictions.length) {
      throw new ImageGenerationError(
        "Gemini Imagen returned zero predictions. The prompt may have been blocked by safety filters.",
        this.id,
        false
      );
    }

    const images: GeneratedImage[] = predictions.map((pred) => {
      const b64 = pred.bytesBase64Encoded as string;
      const mimeType = pred.mimeType ?? "image/png";
      return {
        buffer: Buffer.from(b64, "base64"),
        mimeType,
        revisedPrompt: enrichedPrompt,
      };
    });

    return { images };
  }
}
