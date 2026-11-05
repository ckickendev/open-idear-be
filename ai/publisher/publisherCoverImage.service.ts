import mongoose from "mongoose";
import { PublisherImageAgent } from "../agent/publisher/publisherImage.agent";
import cloudinary from "../../utils/cloudinary";
import { imageSearchService } from "../../services/imageSearch.service";
const MediaModel = require("../../models/media.schema");

export interface CoverImageResult {
  _id?: string;
  url: string;
  alt: string;
  prompt: string;
  width: number;
  height: number;
  createdByAI: boolean;
  source?: string;
  author?: string;
  attributionUrl?: string;
}

export class PublisherCoverImageService {
  private readonly imageAgent: PublisherImageAgent;

  constructor(imageAgent?: PublisherImageAgent) {
    this.imageAgent = imageAgent ?? new PublisherImageAgent();
  }

  /**
   * Complete cover image pipeline:
   * 1. If source === "internet", search high-resolution Unsplash/stock photography
   * 2. Else ImageAgent creates prompt -> Generate AI image -> Upload Cloudinary
   */
  public async generateAndSaveCoverImage(
    params: {
      title: string;
      keywords?: string[];
      customPrompt?: string;
      userId?: string;
      source?: "internet" | "ai";
    },
    signal?: AbortSignal
  ): Promise<CoverImageResult> {
    const { title, keywords = [], customPrompt, userId, source = "internet" } = params;

    // 1. Try finding high-resolution real stock photo on Internet/Unsplash first if source === "internet"
    if (source === "internet") {
      try {
        const stockResults = await imageSearchService.search({
          query: title,
          limit: 4,
          orientation: "landscape",
          userId,
        });

        if (stockResults && stockResults.length > 0) {
          const best = stockResults[0];
          return {
            _id: best.id,
            url: best.imageUrl || best.url,
            alt: best.alt || best.title || `Cover photo for ${title}`,
            prompt: "",
            width: best.width || 1200,
            height: best.height || 630,
            createdByAI: false,
            source: best.sourceProvider || "unsplash",
            author: best.author,
            attributionUrl: best.attributionUrl,
          };
        }
      } catch (searchErr: any) {
        console.warn(`[PublisherCoverImageService] Stock photo search warning: ${searchErr.message}`);
      }
    }

    // 2. Fallback or explicit AI generation flow
    let finalPrompt = customPrompt || "";
    let altText = `Cover image for ${title}`;

    if (!finalPrompt) {
      try {
        const agentResult = await this.imageAgent.execute(
          { title, keywords },
          signal ? { signal } : {}
        );
        if (agentResult.success && agentResult.data) {
          finalPrompt = agentResult.data.prompt;
          altText = agentResult.data.altText || altText;
        }
      } catch (e: any) {
        console.warn(`[PublisherCoverImageService] ImageAgent prompt creation fallback: ${e.message}`);
        finalPrompt = `Modern 16:9 banner digital art style illustration representing ${title}, high resolution, vibrant tech concept`;
      }
    }

    // 2. Generate Image URL
    // We construct a high quality 1200x630 AI banner prompt URL using Pollinations
    // Note: Pollinations requires seed to be a 32-bit signed int (<= 2147483647).
    // Using Date.now() caused seed overflow validation failure (HTTP 500).
    const safeSeed = Math.floor(Math.random() * 2147483647);
    const trimmedPrompt = finalPrompt.trim().slice(0, 350);
    const encodedPrompt = encodeURIComponent(trimmedPrompt);
    const rawImageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1200&height=630&seed=${safeSeed}&nologo=true`;

    // 3. Upload to Cloudinary if credentials configured, otherwise use high-availability CDN URL
    let cdnUrl = rawImageUrl;
    let cloudinaryPublicId = "";

    try {
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
        const uploadRes: any = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(
            rawImageUrl,
            {
              folder: "open-idear/ai-covers",
              public_id: `cover_${Date.now()}`,
              resource_type: "image",
              width: 1200,
              height: 630,
              crop: "fill",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
        });
        if (uploadRes?.secure_url) {
          cdnUrl = uploadRes.secure_url;
          cloudinaryPublicId = uploadRes.public_id || "";
        }
      }
    } catch (err: any) {
      console.warn(`[PublisherCoverImageService] Cloudinary upload fallback to CDN URL: ${err.message}`);
      // If Cloudinary couldn't fetch from the AI generator, use high-resolution Unsplash fallback banner
      cdnUrl = `https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&h=630&q=80`;
    }

    // 4. Save to Media Library Database (MongoDB)
    const mediaId = new mongoose.Types.ObjectId();
    const ownerUserId = userId ? new mongoose.Types.ObjectId(userId) : new mongoose.Types.ObjectId();

    try {
      const mediaDoc = await MediaModel.create({
        _id: mediaId,
        user: ownerUserId,
        url: cdnUrl,
        alt: altText,
        prompt: finalPrompt,
        width: 1200,
        height: 630,
        createdByAI: true,
        description: `AI generated cover image for "${title}"`,
        type: "image",
      });

      return {
        _id: mediaDoc._id.toString(),
        url: mediaDoc.url,
        alt: mediaDoc.alt,
        prompt: mediaDoc.prompt,
        width: mediaDoc.width,
        height: mediaDoc.height,
        createdByAI: mediaDoc.createdByAI,
      };
    } catch (dbErr: any) {
      console.warn(`[PublisherCoverImageService] DB save warning: ${dbErr.message}`);
      // Fallback return object if DB save encounters non-critical error
      return {
        _id: mediaId.toString(),
        url: cdnUrl,
        alt: altText,
        prompt: finalPrompt,
        width: 1200,
        height: 630,
        createdByAI: true,
      };
    }
  }
}
