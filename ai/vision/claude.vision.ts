import axios from "axios";
import type { ImageAIProvider, ImageAnalysisResult } from "./types";
import { AIError } from "../provider/types";

export class ClaudeVisionProvider implements ImageAIProvider {
  readonly id = "claude-vision";
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
  }

  async analyzeImage(imageUrl: string, options?: { signal?: AbortSignal }): Promise<ImageAnalysisResult> {
    if (!this.apiKey) {
      throw new Error("ClaudeVisionProvider requires an Anthropic API key.");
    }

    try {
      // Claude accepts base64 parts directly. We download the image.
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        signal: options?.signal,
      });

      const buffer = Buffer.from(imageResponse.data, "binary");
      const base64Data = buffer.toString("base64");
      let mediaType = imageResponse.headers["content-type"] || "image/jpeg";
      
      // Anthropic API supports: image/jpeg, image/png, image/gif, image/webp
      if (mediaType === "image/svg+xml") {
        mediaType = "image/jpeg"; // fallback or convert
      }

      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: "Analyze the image and return a JSON object with keys 'alt' (string), 'description' (string), and 'tags' (string array). Print ONLY the JSON block. Do not include markdown wraps.",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: base64Data
                  }
                },
                {
                  type: "text",
                  text: "Describe this image."
                }
              ]
            }
          ],
          temperature: 0.2
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01"
          },
          signal: options?.signal,
        }
      );

      const choice = response.data?.content?.[0]?.text;
      if (!choice) {
        throw new Error("Empty response from Claude API.");
      }

      // Parse JSON from text blocks
      const cleaned = choice.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const data = JSON.parse(cleaned);

      return {
        alt: String(data.alt).trim(),
        description: String(data.description).trim(),
        tags: Array.isArray(data.tags) ? data.tags.map((t: string) => String(t).trim().toLowerCase()) : []
      };
    } catch (err: any) {
      throw new AIError(
        `Claude Vision execution failure: ${err.message}`,
        "model_error",
        false,
        err
      );
    }
  }
}
