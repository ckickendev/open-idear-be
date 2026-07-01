import axios from "axios";
import type { MediaSearchProvider, ExternalPhoto, ProviderSearchResponse } from "./types";

export class PixabayProvider implements MediaSearchProvider {
  readonly id = "pixabay";
  readonly name = "Pixabay";
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.PIXABAY_API_KEY || "";
  }

  private getQueryParams(params: Record<string, any>) {
    if (!this.apiKey) {
      throw new Error("Pixabay API key is not configured.");
    }
    return {
      key: this.apiKey,
      image_type: "photo",
      ...params,
    };
  }

  async search(query: string, page = 1, perPage = 20): Promise<ProviderSearchResponse> {
    try {
      const response = await axios.get("https://pixabay.com/api/", {
        params: this.getQueryParams({
          q: encodeURIComponent(query),
          page,
          per_page: perPage,
        }),
      });

      const results = response.data?.hits || [];
      const total = response.data?.totalHits || 0;

      const photos: ExternalPhoto[] = results.map((item: any) => this.mapToPhoto(item));

      return { photos, total };
    } catch (err: any) {
      throw new Error(`Pixabay search failure: ${err.message}`);
    }
  }

  async getPhoto(photoId: string): Promise<ExternalPhoto> {
    try {
      const response = await axios.get("https://pixabay.com/api/", {
        params: this.getQueryParams({
          id: photoId,
        }),
      });

      const hits = response.data?.hits || [];
      if (hits.length === 0) {
        throw new Error(`Photo with ID ${photoId} not found`);
      }

      return this.mapToPhoto(hits[0]);
    } catch (err: any) {
      throw new Error(`Pixabay getPhoto failure: ${err.message}`);
    }
  }

  async download(photoId: string): Promise<Buffer> {
    try {
      // 1. Fetch photo details to get the raw download URL
      const photo = await this.getPhoto(photoId);

      // 2. Fetch the image array buffer stream from the Pixabay original URL
      const imageResponse = await axios.get(photo.downloadUrl, {
        responseType: "arraybuffer",
      });

      return Buffer.from(imageResponse.data, "binary");
    } catch (err: any) {
      throw new Error(`Pixabay download failure: ${err.message}`);
    }
  }

  private mapToPhoto(item: any): ExternalPhoto {
    // Parse comma-separated tags
    const tags = item.tags ? item.tags.split(",").map((t: string) => t.trim().toLowerCase()) : [];

    return {
      id: String(item.id),
      provider: this.id,
      url: item.webformatURL || item.largeImageURL,
      previewUrl: item.previewURL || item.webformatURL,
      downloadUrl: item.largeImageURL || item.imageURL,
      alt: item.tags ? `${item.tags} photo` : "Pixabay Photo",
      description: item.tags ? `Pixabay photo containing: ${item.tags}` : "",
      tags,
      author: {
        name: item.user || "Unknown User",
        profileUrl: item.user_id ? `https://pixabay.com/users/${item.user}-${item.user_id}/` : "",
      },
      width: item.imageWidth || 0,
      height: item.imageHeight || 0,
    };
  }
}
