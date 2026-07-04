import axios from "axios";
import { providerRegistry, promptRegistry } from "../index";
import type { ImageAIProvider, ImageAnalysisResult } from "./types";
import { AIError } from "../provider/types";

export class GeminiVisionProvider implements ImageAIProvider {
  readonly id = "gemini-vision";

  /**
   * Analyzes an image URL using the default Gemini vision model configuration.
   */
  async analyzeImage(imageUrl: string, options?: { signal?: AbortSignal }): Promise<ImageAnalysisResult> {
    try {
      // 1. Fetch image binary buffer from the Cloudinary URL
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 15000, // 15 seconds network timeout
        signal: options?.signal,
      });

      const buffer = Buffer.from(response.data, "binary");
      const base64Data = buffer.toString("base64");
      const mimeType = response.headers["content-type"] || "image/jpeg";

      // 2. Resolve default provider registry client
      const provider = providerRegistry.getDefault();

      // 3. Resolve prompts from prompt registry
      const promptDef = await promptRegistry.get("image", "v1");
      const systemInstruction = promptDef.system || "You are an expert SEO and accessibility coordinator.";

      // 4. Assemble messages payload
      const messages = [
        { role: "system" as const, content: systemInstruction },
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: promptDef.user },
            {
              type: "image" as const,
              mimeType,
              base64Data,
            },
          ],
        },
      ];

      const providerOptions = {
        model: "vision",
        temperature: promptDef.metadata?.temperature ?? 0.2,
        maxOutputTokens: promptDef.metadata?.maxTokens ?? 500,
        signal: options?.signal,
      };

      // 5. Call Provider JSON endpoint
      const result = await provider.generateJSON<any>(messages, providerOptions);

      if (!result || !result.data) {
        throw new Error("Vision provider returned empty response.");
      }

      // 6. Support alternative schemas returned by the AI (altText vs alt)
      const altText = result.data.altText || result.data.alt;
      const description = result.data.description;
      const tags = result.data.tags;

      // 7. Strict schema shape validation
      if (typeof altText !== "string" || altText.trim() === "") {
        throw new Error("Validation error: AI response altText is invalid or missing.");
      }
      if (typeof description !== "string" || description.trim() === "") {
        throw new Error("Validation error: AI response description is invalid or missing.");
      }
      if (!Array.isArray(tags)) {
        throw new Error("Validation error: AI response tags must be an array of strings.");
      }

      // Normalize output results
      return {
        alt: altText.trim(),
        description: description.trim(),
        tags: tags.map((tag: string) => String(tag).trim().toLowerCase()).filter(Boolean),
      };
    } catch (err: any) {
      // Re-map raw errors to standard typed AIError if they aren't already
      if (err.name === "AIError") throw err;

      throw new AIError(
        `Gemini Vision execution failure: ${err.message}`,
        "model_error",
        false,
        err
      );
    }
  }
}
