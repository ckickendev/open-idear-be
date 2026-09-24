// =============================================================================
//  UNSPLASH IMAGE SEARCH PROVIDER
//  services/imageSearch/unsplash.provider.ts
//
//  Design Decisions:
//  - Uses official Unsplash API (https://api.unsplash.com/search/photos).
//  - Requires UNSPLASH_ACCESS_KEY environment variable.
//  - Falls back gracefully (returns []) when key is absent or API fails.
//  - Always populates license="unsplash", author, and attributionUrl.
//  - License: Unsplash License — free for commercial use; attribution encouraged.
//    See https://unsplash.com/license
// =============================================================================

import type {
  ImageSearchProvider,
  ImageSearchOptions,
  NormalizedImageResult,
} from "./imageSearchProvider.interface";

const UNSPLASH_API_BASE = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  width: number;
  height: number;
  urls: {
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: {
    html: string;
  };
  user: {
    name: string;
    links: { html: string };
  };
}

interface UnsplashSearchResponse {
  results: UnsplashPhoto[];
  total: number;
  total_pages: number;
}

export class UnsplashProvider implements ImageSearchProvider {
  readonly name = "unsplash";

  async search(options: ImageSearchOptions): Promise<NormalizedImageResult[]> {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!apiKey) {
      return [];
    }

    const { query, limit = 12, page = 1 } = options;
    if (!query || !query.trim()) return [];

    try {
      const url = `${UNSPLASH_API_BASE}/search/photos?query=${encodeURIComponent(
        query.trim()
      )}&per_page=${Math.min(30, limit)}&page=${page}&orientation=landscape`;

      const resp = await fetch(url, {
        headers: {
          Authorization: `Client-ID ${apiKey}`,
          "Accept-Version": "v1",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        console.warn(
          `[UnsplashProvider] API responded ${resp.status}: ${resp.statusText}`
        );
        return [];
      }

      const data: UnsplashSearchResponse = await resp.json();

      return (data.results || []).map((photo): NormalizedImageResult => ({
        id: `unsplash_${photo.id}`,
        url: photo.urls.regular,
        thumbnailUrl: photo.urls.small,
        width: photo.width,
        height: photo.height,
        title: photo.description || photo.alt_description || `Photo by ${photo.user.name}`,
        alt: photo.alt_description || photo.description || `Photo by ${photo.user.name} on Unsplash`,
        source: "stock",
        author: photo.user.name,
        license: "unsplash",
        attributionUrl: photo.links.html,
        sourceProvider: "unsplash",
        sourceUrl: photo.links.html,
        tags: [],
      }));
    } catch (err: any) {
      console.warn("[UnsplashProvider] search failed:", err?.message);
      return [];
    }
  }
}

export const unsplashProvider = new UnsplashProvider();
