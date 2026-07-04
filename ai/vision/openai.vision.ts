import axios from "axios";
import type { ImageAIProvider, ImageAnalysisResult } from "./types";
import { AIError } from "../provider/types";

export class OpenAIVisionProvider implements ImageAIProvider {
  readonly id = "openai-vision";
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
  }

  async analyzeImage(imageUrl: string, options?: { signal?: AbortSignal }): Promise<ImageAnalysisResult> {
    if (!this.apiKey) {
      throw new Error("OpenAIVisionProvider requires an OpenAI API key.");
    }

    try {
      // OpenAI Vision accepts image URLs directly, so no base64 download is required on our end
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini", // Cost-effective multimodal model
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an expert SEO and accessibility coordinator.
Analyze the image and return a JSON object with:
{
  "alt": "1-2 accessibility alt text sentences",
  "description": "2-4 sentences detailed content summary",
  "tags": ["array", "of", "lowercase", "tags"]
}
Only return valid JSON.`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyze this image."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          temperature: 0.2
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: options?.signal,
        }
      );

      const choice = response.data?.choices?.[0]?.message?.content;
      if (!choice) {
        throw new Error("Empty response from OpenAI API.");
      }

      const data = JSON.parse(choice);
      
      // Validation
      if (!data.alt || !data.description || !Array.isArray(data.tags)) {
        throw new Error("Malformed JSON schema response from OpenAI.");
      }

      return {
        alt: String(data.alt).trim(),
        description: String(data.description).trim(),
        tags: data.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean),
      };
    } catch (err: any) {
      throw new AIError(
        `OpenAI Vision execution failure: ${err.message}`,
        "model_error",
        false,
        err
      );
    }
  }
}
