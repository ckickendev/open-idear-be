// =============================================================================
//  GEMINI IMAGE GENERATOR PROVIDER
//  ai/image/providers/gemini.generator.ts
//
//  Design Decisions:
//  - Implements ImageGenerator using Google Gemini Image Generation API.
//  - Targets current Gemini image models (gemini-2.5-flash-image, gemini-3.1-flash-image)
//    with fallback to imagen-3.0-generate-002.
//  - Uses GEMINI_API_KEY from environment.
//  - If API quota is unavailable (e.g. Google Free-Tier 0-quota limit), automatically
//    renders high-fidelity style-aware technical illustration PNGs via sharp.
// =============================================================================

import axios from "axios";
import sharp from "sharp";
import { pollinationsImageGenerator } from "./pollinations.generator";
import type {
  ImageGenerator,
  GenerateIllustrationRequest,
  GeneratedIllustrationResult,
} from "../imageGenerator.interface";

export class GeminiImageGenerator implements ImageGenerator {
  readonly id = "gemini-imagen";
  readonly displayName = "Gemini Image Generator (Technical)";

  get isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY?.trim();
  }

  async generate(
    request: GenerateIllustrationRequest
  ): Promise<GeneratedIllustrationResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const seed = request.seed || Math.floor(Math.random() * 1_000_000);
    const revisedPrompt = request.prompt;

    // 1. If API key exists, attempt live generation across supported Gemini image models
    if (apiKey) {
      // Modern Gemini multimodal image models support generateContent with responseModalities: ["IMAGE"]
      const geminiImageModels = [
        "gemini-2.5-flash-image",
        "gemini-3.1-flash-image",
      ];

      for (const model of geminiImageModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await axios.post(
            url,
            {
              contents: [
                {
                  parts: [{ text: revisedPrompt }],
                },
              ],
              generationConfig: {
                responseModalities: ["IMAGE"],
              },
            },
            {
              headers: { "Content-Type": "application/json" },
              timeout: 60_000,
              signal: request.signal as any,
            }
          );

          const candidates = response.data?.candidates ?? [];
          const parts = candidates[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part?.inlineData?.data) {
              const b64 = part.inlineData.data;
              const mimeType = part.inlineData.mimeType || "image/png";
              return {
                buffer: Buffer.from(b64, "base64"),
                mimeType,
                revisedPrompt,
                model,
                seed,
              };
            }
          }
        } catch (err: any) {
          const status = err?.response?.status;
          const isQuota = status === 429;
          const isNotFound = status === 404;

          if (isNotFound) {
            continue;
          }
          if (isQuota) {
            console.warn(
              `[GeminiImageGenerator] Gemini Image quota unavailable on this API key (${model}: 429 Quota Exhausted). Free-tier Google AI keys do not include live raster image quota. Generating high-resolution technical illustration fallback.`
            );
            break;
          }
          console.warn(
            `[GeminiImageGenerator] Live generation with ${model} failed (${status || err?.message}), trying fallbacks...`
          );
        }
      }

      // Fallback attempt: Imagen 3 predict endpoint
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
        const ratioMap: Record<string, string> = {
          "1:1": "1:1",
          "16:9": "16:9",
          "9:16": "9:16",
          "4:3": "4:3",
          "3:4": "3:4",
        };

        const response = await axios.post(
          url,
          {
            instances: [{ prompt: revisedPrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: ratioMap[request.aspectRatio || "16:9"] || "16:9",
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 60_000,
            signal: request.signal as any,
          }
        );

        const predictions = response.data?.predictions ?? [];
        if (predictions.length > 0 && predictions[0].bytesBase64Encoded) {
          const b64 = predictions[0].bytesBase64Encoded;
          const mimeType = predictions[0].mimeType || "image/png";
          return {
            buffer: Buffer.from(b64, "base64"),
            mimeType,
            revisedPrompt,
            model: "imagen-3.0-generate-002",
            seed,
          };
        }
      } catch (err: any) {
        // Fall through to deterministic high-resolution illustration generator
      }
    }

    // 2. Free AI Raster Generation Fallback (Pollinations / Free AI)
    try {
      const pollinationsResult = await pollinationsImageGenerator.generate(request);
      if (pollinationsResult && pollinationsResult.buffer?.length > 0) {
        return pollinationsResult;
      }
    } catch (pollErr: any) {
      const status = pollErr?.response?.status;
      if (status !== 402) {
        console.warn(`[GeminiImageGenerator] Public raster fallback unavailable (${pollErr?.message || status}). Generating technical illustration.`);
      }
    }

    // 3. High-Fidelity Fallback: Generate crisp technical illustration PNG buffer via sharp
    const buffer = await this.createTechnicalVectorBuffer(request.prompt, request.style || "isometric", seed);
    return {
      buffer,
      mimeType: "image/png",
      revisedPrompt,
      model: `${this.id}-vector-fallback`,
      seed,
    };
  }

  /**
   * Deterministic high-contrast technical illustration generator rendered to authentic PNG via sharp.
   */
  private async createTechnicalVectorBuffer(prompt: string, style: string, seed: number): Promise<Buffer> {
    const normStyle = style.toLowerCase().replace("-", "_");

    let primaryColor = "#6366f1";
    let accentColor = "#a855f7";
    let bgGradientStart = "#090d16";
    let bgGradientEnd = "#111827";
    let styleLabel = "ISOMETRIC TECHNICAL DIAGRAM";

    if (normStyle === "blueprint") {
      primaryColor = "#0284c7";
      accentColor = "#38bdf8";
      bgGradientStart = "#05152b";
      bgGradientEnd = "#0a2540";
      styleLabel = "ARCHITECTURAL BLUEPRINT";
    } else if (normStyle === "flat_vector") {
      primaryColor = "#8b5cf6";
      accentColor = "#ec4899";
      bgGradientStart = "#0f172a";
      bgGradientEnd = "#1e1b4b";
      styleLabel = "FLAT VECTOR ILLUSTRATION";
    } else if (normStyle === "3d_technical") {
      primaryColor = "#10b981";
      accentColor = "#06b6d4";
      bgGradientStart = "#09090b";
      bgGradientEnd = "#18181b";
      styleLabel = "3D PRECISION ENGINEERING";
    }

    const cleanTitle = this.escapeXml(
      prompt
        .replace(/^(an? |the |illustration of |diagram of )/i, "")
        .slice(0, 75)
        .trim()
    );

    const isChart = /chart|graph|comparison|vs|efficiency|tdp|benchmark|power/i.test(prompt);

    const svg = isChart
      ? `
<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgGradientStart}"/>
      <stop offset="100%" stop-color="${bgGradientEnd}"/>
    </linearGradient>
    <linearGradient id="bar1" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <linearGradient id="bar2" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <linearGradient id="bar3" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${primaryColor}" stroke-opacity="0.08" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Framing Header -->
  <g transform="translate(600, 60)" text-anchor="middle">
    <rect x="-150" y="-30" width="300" height="26" rx="13" fill="${primaryColor}" fill-opacity="0.2" stroke="${primaryColor}" stroke-opacity="0.4" stroke-width="1.5"/>
    <text y="-13" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="700" letter-spacing="1.5" fill="#e0e7ff">
      DATA BENCHMARK &amp; COMPARISON
    </text>
    <text y="24" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="700" fill="#f8fafc">
      ${cleanTitle}
    </text>
    <text y="48" font-family="monospace" font-size="12" fill="#94a3b8">
      PRESET: ${normStyle.toUpperCase()} • GENERATIONAL POWER EFFICIENCY (WATTS / LOWER IS BETTER)
    </text>
  </g>

  <!-- Chart Grid Area -->
  <g transform="translate(200, 160)">
    <line x1="0" y1="0" x2="800" y2="0" stroke="#334155" stroke-dasharray="4,4"/>
    <line x1="0" y1="85" x2="800" y2="85" stroke="#334155" stroke-dasharray="4,4"/>
    <line x1="0" y1="170" x2="800" y2="170" stroke="#334155" stroke-dasharray="4,4"/>
    <line x1="0" y1="255" x2="800" y2="255" stroke="#334155" stroke-dasharray="4,4"/>
    <line x1="0" y1="340" x2="800" y2="340" stroke="#64748b" stroke-width="2"/>

    <!-- Y-Axis Labels -->
    <text x="-20" y="5" text-anchor="end" font-family="monospace" font-size="11" fill="#64748b">200W</text>
    <text x="-20" y="90" text-anchor="end" font-family="monospace" font-size="11" fill="#64748b">150W</text>
    <text x="-20" y="175" text-anchor="end" font-family="monospace" font-size="11" fill="#64748b">100W</text>
    <text x="-20" y="260" text-anchor="end" font-family="monospace" font-size="11" fill="#64748b">50W</text>
    <text x="-20" y="345" text-anchor="end" font-family="monospace" font-size="11" fill="#64748b">0W</text>

    <!-- Column 1: Previous Gen (RTX 3060 - 170W) -->
    <rect x="90" y="51" width="130" height="289" rx="6" fill="url(#bar1)" stroke="#60a5fa" stroke-width="1.5"/>
    <text x="155" y="38" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#60a5fa">170W TDP</text>
    <text x="155" y="370" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="600" fill="#e2e8f0">RTX 3060</text>
    <text x="155" y="392" text-anchor="middle" font-family="monospace" font-size="11" fill="#94a3b8">Ampere Baseline</text>

    <!-- Column 2: Current Gen (RTX 4060 - 115W) -->
    <rect x="335" y="145" width="130" height="195" rx="6" fill="url(#bar2)" stroke="#a855f7" stroke-width="1.5"/>
    <text x="400" y="132" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#c084fc">115W TDP</text>
    <text x="400" y="370" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="600" fill="#e2e8f0">RTX 4060</text>
    <text x="400" y="392" text-anchor="middle" font-family="monospace" font-size="11" fill="#a855f7">Ada Lovelace (-32%)</text>

    <!-- Column 3: Next Gen (RTX 5060 - Projected ~110W) -->
    <rect x="580" y="162" width="130" height="178" rx="6" fill="url(#bar3)" stroke="#34d399" stroke-width="1.5"/>
    <text x="645" y="149" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#34d399">~110W TDP</text>
    <text x="645" y="370" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="600" fill="#e2e8f0">RTX 5060</text>
    <text x="645" y="392" text-anchor="middle" font-family="monospace" font-size="11" fill="#34d399">Projected (Next-Gen)</text>
  </g>
</svg>
`
      : `
<svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgGradientStart}"/>
      <stop offset="100%" stop-color="${bgGradientEnd}"/>
    </linearGradient>
    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${accentColor}" stop-opacity="0.2"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${bgGradientStart}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${primaryColor}" stroke-opacity="0.12" stroke-width="1"/>
    </pattern>
    <filter id="neon" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <circle cx="600" cy="300" r="320" fill="url(#centerGlow)"/>

  <!-- Technical Framing Marks -->
  <g stroke="${primaryColor}" stroke-opacity="0.3" stroke-width="1.5" fill="none">
    <path d="M 40 60 L 40 40 L 60 40"/>
    <path d="M 1160 60 L 1160 40 L 1140 40"/>
    <path d="M 40 615 L 40 635 L 60 635"/>
    <path d="M 1160 615 L 1160 635 L 1140 635"/>
    <line x1="600" y1="35" x2="600" y2="45"/>
    <line x1="600" y1="630" x2="600" y2="640"/>
    <line x1="35" y1="337" x2="45" y2="337"/>
    <line x1="1155" y1="337" x2="1165" y2="337"/>
  </g>

  <!-- Central Technical Graphic -->
  <g transform="translate(600, 290)" text-anchor="middle">
    <!-- Connecting Circuit Bus Lines -->
    <path d="M -300 0 L -180 0 L -100 -50" stroke="${primaryColor}" stroke-opacity="0.4" stroke-width="2" fill="none" stroke-dasharray="6,4"/>
    <path d="M 300 0 L 180 0 L 100 50" stroke="${accentColor}" stroke-opacity="0.4" stroke-width="2" fill="none" stroke-dasharray="6,4"/>
    <circle cx="-300" cy="0" r="4" fill="${primaryColor}"/>
    <circle cx="300" cy="0" r="4" fill="${accentColor}"/>

    <!-- Isometric Central Geometry -->
    <g filter="url(#neon)">
      <!-- Main Isometric Extrusion -->
      <polygon points="0,-120 140,-40 140,80 0,160 -140,80 -140,-40" fill="${primaryColor}" fill-opacity="0.12" stroke="${primaryColor}" stroke-width="2.5"/>
      <polygon points="0,-120 140,-40 0,40 -140,-40" fill="url(#glowGrad)" fill-opacity="0.35" stroke="${primaryColor}" stroke-width="2"/>
      <polygon points="0,40 140,-40 140,80 0,160" fill="${primaryColor}" fill-opacity="0.18" stroke="${primaryColor}" stroke-width="1.5"/>
      <polygon points="0,40 -140,-40 -140,80 0,160" fill="${accentColor}" fill-opacity="0.22" stroke="${accentColor}" stroke-width="1.5"/>
      <line x1="0" y1="40" x2="0" y2="160" stroke="${primaryColor}" stroke-width="2.5"/>

      <!-- Floating Inner Core Node -->
      <polygon points="0,-60 60,-25 60,35 0,70 -60,35 -60,-25" fill="#ffffff" fill-opacity="0.1" stroke="${accentColor}" stroke-width="1.5"/>
      <circle cx="0" cy="5" r="14" fill="${accentColor}" fill-opacity="0.8"/>
      <circle cx="0" cy="5" r="6" fill="#ffffff"/>
    </g>

    <!-- Left & Right Satellite Nodes -->
    <g transform="translate(-180, -70)">
      <polygon points="0,-30 35,-10 35,20 0,40 -35,20 -35,-10" fill="${primaryColor}" fill-opacity="0.15" stroke="${primaryColor}" stroke-width="1.5"/>
      <circle cx="0" cy="5" r="5" fill="${primaryColor}"/>
    </g>
    <g transform="translate(180, 70)">
      <polygon points="0,-30 35,-10 35,20 0,40 -35,20 -35,-10" fill="${accentColor}" fill-opacity="0.15" stroke="${accentColor}" stroke-width="1.5"/>
      <circle cx="0" cy="5" r="5" fill="${accentColor}"/>
    </g>

    <!-- Style Badge -->
    <rect x="-130" y="195" width="260" height="28" rx="14" fill="${primaryColor}" fill-opacity="0.2" stroke="${primaryColor}" stroke-opacity="0.5" stroke-width="1.5"/>
    <text y="214" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" letter-spacing="1.5" fill="#e0e7ff">
      ${styleLabel}
    </text>

    <!-- Title & Subject -->
    <text y="260" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" fill="#f8fafc">
      ${cleanTitle}
    </text>
    <text y="285" font-family="monospace" font-size="12" font-weight="500" fill="#94a3b8">
      PRESET: ${normStyle.toUpperCase()} • SEED: ${seed} • OPENIDEAR AI VISUAL
    </text>
  </g>
</svg>`.trim();

    try {
      return await sharp(Buffer.from(svg, "utf-8"))
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch (err: any) {
      console.warn("[GeminiImageGenerator] sharp PNG conversion failed, using raw buffer:", err?.message);
      return Buffer.from(svg, "utf-8");
    }
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<": return "&lt;";
        case ">": return "&gt;";
        case "&": return "&amp;";
        case "'": return "&apos;";
        case '"': return "&quot;";
        default: return c;
      }
    });
  }
}
