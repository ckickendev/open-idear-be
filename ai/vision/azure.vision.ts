import axios from "axios";
import type { ImageAIProvider, ImageAnalysisResult } from "./types";
import { AIError } from "../provider/types";

export class AzureVisionProvider implements ImageAIProvider {
  readonly id = "azure-vision";
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(endpoint?: string, apiKey?: string) {
    this.endpoint = endpoint || process.env.AZURE_VISION_ENDPOINT || "";
    this.apiKey = apiKey || process.env.AZURE_VISION_KEY || "";
  }

  async analyzeImage(imageUrl: string, options?: { signal?: AbortSignal }): Promise<ImageAnalysisResult> {
    if (!this.endpoint || !this.apiKey) {
      throw new Error("AzureVisionProvider requires endpoint and API key settings.");
    }

    try {
      // Azure Computer Vision Image Analysis API
      const response = await axios.post(
        `${this.endpoint}/computervision/imageanalysis:analyze?api-version=2023-02-01-preview&features=caption,tags`,
        { url: imageUrl },
        {
          headers: {
            "Content-Type": "application/json",
            "Ocp-Apim-Subscription-Key": this.apiKey,
          },
          signal: options?.signal,
        }
      );

      // Extract results from Azure schema
      const captionResult = response.data?.captionResult;
      const tagsResult = response.data?.tagsResult?.values || [];

      const alt = captionResult?.text || "Uploaded image";
      const description = captionResult?.text ? `An image showing ${captionResult.text} with confidence ${captionResult.confidence.toFixed(2)}.` : "Uploaded media asset.";
      const tags = tagsResult.map((t: any) => String(t.name).trim().toLowerCase()).slice(0, 10);

      return {
        alt,
        description,
        tags,
      };
    } catch (err: any) {
      throw new AIError(
        `Azure Vision execution failure: ${err.message}`,
        "model_error",
        false,
        err
      );
    }
  }
}
