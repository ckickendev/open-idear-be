import axios from "axios";
import type { MediaSearchProvider, ExternalPhoto, ProviderSearchResponse } from "./types";

export class UnsplashProvider implements MediaSearchProvider {
  readonly id = "unsplash";
  readonly name = "Unsplash";
  private readonly accessKey: string;

  constructor(accessKey?: string) {
    this.accessKey = accessKey || process.env.UNSPLASH_ACCESS_KEY || "";
  }

  private getHeaders() {
    if (!this.accessKey) {
      throw new Error("Unsplash access key is not configured.");
    }
    return {
      Authorization: `Client-ID ${this.accessKey}`,
    };
  }

  async search(query: string, page = 1, perPage = 20): Promise<ProviderSearchResponse> {
    try {
      const response = await axios.get("https://api.unsplash.com/search/photos", {
        headers: this.getHeaders(),
        params: {
          query,
          page,
          per_page: perPage,
        },
      });

      const results = response.data?.results || [];
      const total = response.data?.total || 0;

      const photos: ExternalPhoto[] = results.map((item: any) => this.mapToPhoto(item));

      return { photos, total };
    } catch (err: any) {
      throw new Error(`Unsplash search failure: ${err.response?.data?.errors?.[0] || err.message}`);
    }
  }

  async getPhoto(photoId: string): Promise<ExternalPhoto> {
    try {
      const response = await axios.get(`https://api.unsplash.com/photos/${photoId}`, {
        headers: this.getHeaders(),
      });
      return this.mapToPhoto(response.data);
    } catch (err: any) {
      throw new Error(`Unsplash getPhoto failure: ${err.message}`);
    }
  }

  async download(photoId: string): Promise<Buffer> {
    try {
      // 1. Unsplash API requires triggering download tracking endpoint first
      const trackResponse = await axios.get(`https://api.unsplash.com/photos/${photoId}/download`, {
        headers: this.getHeaders(),
      });

      // The tracking endpoint returns a redirect URL to download the raw image stream
      const downloadUrl = trackResponse.data?.url;
      if (!downloadUrl) {
        throw new Error("Download tracking endpoint did not return redirect URL");
      }

      // 2. Fetch the image array buffer stream
      const imageResponse = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
      });

      return Buffer.from(imageResponse.data, "binary");
    } catch (err: any) {
      throw new Error(`Unsplash download failure: ${err.message}`);
    }
  }

  private mapToPhoto(item: any): ExternalPhoto {
    return {
      id: item.id,
      provider: this.id,
      url: item.urls?.regular || item.urls?.small,
      previewUrl: item.urls?.thumb || item.urls?.small,
      downloadUrl: item.links?.download_location || item.urls?.raw,
      alt: item.alt_description || item.description || "Unsplash Photo",
      description: item.description || "",
      tags: Array.isArray(item.tags) ? item.tags.map((t: any) => String(t.title || t).toLowerCase()) : [],
      author: {
        name: item.user?.name || "Unknown Author",
        profileUrl: item.user?.links?.html || "",
      },
      width: item.width || 0,
      height: item.height || 0,
    };
  }
}
