import axios from "axios";
import type { MediaSearchProvider, ExternalPhoto, ProviderSearchResponse } from "./types";

export class PexelsProvider implements MediaSearchProvider {
  readonly id = "pexels";
  readonly name = "Pexels";
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.PEXELS_API_KEY || "";
  }

  private getHeaders() {
    if (!this.apiKey) {
      throw new Error("Pexels API key is not configured.");
    }
    return {
      Authorization: this.apiKey,
    };
  }

  async search(query: string, page = 1, perPage = 20): Promise<ProviderSearchResponse> {
    try {
      const response = await axios.get("https://api.pexels.com/v1/search", {
        headers: this.getHeaders(),
        params: {
          query,
          page,
          per_page: perPage,
        },
      });

      const results = response.data?.photos || [];
      const total = response.data?.total_results || 0;

      const photos: ExternalPhoto[] = results.map((item: any) => this.mapToPhoto(item));

      return { photos, total };
    } catch (err: any) {
      throw new Error(`Pexels search failure: ${err.response?.data?.error || err.message}`);
    }
  }

  async getPhoto(photoId: string): Promise<ExternalPhoto> {
    try {
      const response = await axios.get(`https://api.pexels.com/v1/photos/${photoId}`, {
        headers: this.getHeaders(),
      });
      return this.mapToPhoto(response.data);
    } catch (err: any) {
      throw new Error(`Pexels getPhoto failure: ${err.message}`);
    }
  }

  async download(photoId: string): Promise<Buffer> {
    try {
      // 1. Fetch photo details to get the raw download URL
      const photo = await this.getPhoto(photoId);

      // 2. Fetch the image array buffer stream from the Pexels original URL
      const imageResponse = await axios.get(photo.downloadUrl, {
        responseType: "arraybuffer",
      });

      return Buffer.from(imageResponse.data, "binary");
    } catch (err: any) {
      throw new Error(`Pexels download failure: ${err.message}`);
    }
  }

  private mapToPhoto(item: any): ExternalPhoto {
    return {
      id: String(item.id),
      provider: this.id,
      url: item.src?.large || item.src?.medium,
      previewUrl: item.src?.tiny || item.src?.small,
      downloadUrl: item.src?.original,
      alt: item.alt || "Pexels Photo",
      description: item.alt || "",
      tags: [], // Pexels search API doesn't return tags directly on photo list responses
      author: {
        name: item.photographer || "Unknown Photographer",
        profileUrl: item.photographer_url || "",
      },
      width: item.width || 0,
      height: item.height || 0,
    };
  }
}
