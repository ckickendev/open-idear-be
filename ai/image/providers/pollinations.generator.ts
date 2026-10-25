// =============================================================================
//  POLLINATIONS AI IMAGE GENERATOR PROVIDER (FREE RASTER AI)
//  ai/image/providers/pollinations.generator.ts
//
//  Design Decisions:
//  - Free, fast, unauthenticated image generation using Pollinations.ai.
//  - Acts as a high-quality zero-cost raster AI fallback when Google AI Studio
//    free tier lacks live image quota (429 RESOURCE_EXHAUSTED).
//  - Robust prompt sanitization to prevent URL encoding & 500 parser errors.
//  - Fully cooperative with AbortSignal cancellation and timeout protection.
// =============================================================================

import axios from "axios";
import type {
  ImageGenerator,
  GenerateIllustrationRequest,
  GeneratedIllustrationResult,
} from "../imageGenerator.interface";

export class PollinationsImageGenerator implements ImageGenerator {
  readonly id = "pollinations-flux";
  readonly displayName = "Pollinations AI (Free)";

  get isAvailable(): boolean {
    return true; // Free public inference service
  }

  async generate(
    request: GenerateIllustrationRequest
  ): Promise<GeneratedIllustrationResult> {
    const seed = request.seed || Math.floor(Math.random() * 1_000_000);

    // Clean and sanitize prompt for URL-based generation
    const sanitizedPrompt = this.sanitizePrompt(request.prompt, request.style);
    const encodedPrompt = encodeURIComponent(sanitizedPrompt);

    // Dimension mapping
    const ratioDimensions: Record<string, { width: number; height: number }> = {
      "16:9": { width: 1024, height: 576 },
      "1:1": { width: 1024, height: 1024 },
      "4:3": { width: 1024, height: 768 },
      "3:4": { width: 768, height: 1024 },
      "9:16": { width: 576, height: 1024 },
    };

    const targetDim = ratioDimensions[request.aspectRatio || "16:9"] || {
      width: 1024,
      height: 576,
    };

    // Try primary URL with dimensions & nologo
    const urlsToTry = [
      `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${targetDim.width}&height=${targetDim.height}&seed=${seed}&nologo=true`,
      `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true`,
    ];

    let lastError: any = null;
    for (const url of urlsToTry) {
      try {
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 25_000,
          signal: request.signal as any,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; OpenIdearStudio/1.0)",
          },
        });

        if (response.status === 200 && response.data && response.data.length > 1000) {
          const buffer = Buffer.from(response.data);
          const mimeType = response.headers["content-type"] || "image/jpeg";
          return {
            buffer,
            mimeType,
            revisedPrompt: sanitizedPrompt,
            model: this.id,
            seed,
          };
        }
      } catch (err: any) {
        lastError = err;
        if (err.name === "AbortError" || err.code === "ERR_CANCELED") {
          throw err;
        }
      }
    }

    throw lastError || new Error("Failed to generate image via Pollinations free service.");
  }

  /**
   * Sanitizes prompt by removing parentheses, complex brackets, and excessive length
   * that can cause Pollinations routing 500 errors.
   */
  private sanitizePrompt(rawPrompt: string, style?: string): string {
    const styleKeyword =
      style === "blueprint"
        ? "blueprint engineering drawing"
        : style === "flat_vector"
        ? "flat vector design"
        : style === "3d_technical"
        ? "3d technical render"
        : "isometric 3d illustration";

    // Extract core subject from prompt by stripping boilerplate prefixes
    let subject = rawPrompt
      .replace(/^(?:create|generate)\s+a\s+(?:clean\s+)?(?:technical\s+)?(?:isometric\s+)?(?:illustration|diagram|workflow|comparison|chart|blueprint|ui\s+dashboard\s+mockup)\s+(?:explaining|showing|illustrating|for)\s+/i, "")
      .replace(/^clean modern isometric technical illustration of\s+/i, "")
      .replace(/^an?\s+|^the\s+/i, "")
      .replace(/\s+hardware diagnostics:?.*$/is, "")
      .replace(/:\s*isometric 30-degree.*$/is, "")
      .replace(/:\s*displaying real-time.*$/is, "")
      .replace(/:\s*modern developer.*$/is, "")
      .trim();

    if (!subject || subject.length < 3) {
      subject = rawPrompt.slice(0, 80);
    }

    // Clean special chars but preserve unicode letters (including Vietnamese letters)
    const clean = subject
      .replace(/[()[\]{}"'`~@#$%^&*+=|\\/<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);

    return `${clean}, ${styleKeyword}, clean high-tech composition, dark background`;
  }
}

export const pollinationsImageGenerator = new PollinationsImageGenerator();
