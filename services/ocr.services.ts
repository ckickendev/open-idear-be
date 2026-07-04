import axios from "axios";
import { Service } from "../core";
import { providerRegistry } from "../ai";

export interface OCRBlock {
  text: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface OCRResult {
  ocrText: string;
  language: string;
  confidence: number;
  ocrBlocks: OCRBlock[];
}

export class OCRService extends Service {
  /**
   * Run OCR on the specified image URL using the default registered multimodal provider (Gemini).
   */
  async performOCR(imageUrl: string, mimeType: string): Promise<OCRResult> {
    if (!imageUrl) {
      throw new Error("imageUrl is required for OCR analysis.");
    }

    try {
      // 1. Fetch the default registered provider instance
      const provider = providerRegistry.getDefault();

      // 2. Download the image and parse as base64 binary buffer
      const imageResponse = await axios.get(imageUrl, { responseType: "arraybuffer" });
      const base64Image = Buffer.from(imageResponse.data).toString("base64");

      const prompt = `You are an advanced Optical Character Recognition (OCR) analyzer. Your goal is to analyze the provided image and extract all text content in a structured JSON layout.

Rules:
- Identify all visible text in screenshots, document pages, and code snippets.
- Return ONLY a valid JSON object matching the schema below. No markdown wrappers, no introductory text, no explanations.
- If no text is found, return an empty text property.

Required JSON Schema:
{
  "ocrText": "string containing all raw text extracted, preserving line breaks",
  "language": "ISO language code, e.g. 'en', 'es', or 'un' if mixed",
  "confidence": 0.95,
  "ocrBlocks": [
    {
      "text": "isolated block or paragraph of text",
      "x": 10,
      "y": 20,
      "w": 50,
      "h": 15
    }
  ]
}`;

      // 3. Send prompt and base64 payload to Gemini
      const response = await provider.generate([
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              image: {
                mimeType: mimeType || "image/jpeg",
                data: base64Image,
              },
            },
          ] as any,
        },
      ], {
        temperature: 0.1,
      });

      // 4. Parse response JSON block
      const cleanedText = response.text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanedText) as OCRResult;

      return {
        ocrText: parsed.ocrText || "",
        language: parsed.language || "en",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 1.0,
        ocrBlocks: Array.isArray(parsed.ocrBlocks) ? parsed.ocrBlocks : [],
      };
    } catch (err: any) {
      console.error("[OCRService] OCR analysis failed:", err.message);
      return {
        ocrText: "",
        language: "en",
        confidence: 0.0,
        ocrBlocks: [],
      };
    }
  }

  /**
   * Processes OCR on a MediaAsset ID and updates the database records.
   */
  async processAssetOCR(mediaId: string): Promise<OCRResult> {
    const { MediaAsset } = require("../models");
    
    const asset = await MediaAsset.findOne({ _id: mediaId, del_flag: 0 });
    if (!asset) {
      throw new Error(`Media asset ${mediaId} not found.`);
    }

    const imageUrl = asset.urls.thumbnail_md || asset.urls.webp || asset.urls.original;
    const result = await this.performOCR(imageUrl, asset.mimeType);

    await MediaAsset.updateOne(
      { _id: mediaId },
      {
        $set: {
          ocrText: result.ocrText,
          ocrBlocks: result.ocrBlocks,
          ocrLanguage: result.language,
          ocrConfidence: result.confidence,
        },
      }
    );

    return result;
  }
}

export const ocrService = new OCRService();
