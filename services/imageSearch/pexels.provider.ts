// =============================================================================
//  PEXELS IMAGE SEARCH PROVIDER
//  services/imageSearch/pexels.provider.ts
//
//  Design Decisions:
//  - Uses official Pexels API (https://api.pexels.com/v1/search).
//  - Requires PEXELS_API_KEY environment variable.
//  - Falls back gracefully (returns []) when key is absent or API fails.
//  - Always populates license="pexels", photographer, and attributionUrl.
//  - License: Pexels License — free for commercial use; attribution encouraged.
//    See https://www.pexels.com/license/
// =============================================================================

import type {
  ImageSearchProvider,
  ImageSearchOptions,
  NormalizedImageResult,
} from "./imageSearchProvider.interface";

const PEXELS_API_BASE = "https://api.pexels.com/v1";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: {
    original: string;
    large: string;
    large2x: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
  page: number;
  per_page: number;
  next_page?: string;
}

export class PexelsProvider implements ImageSearchProvider {
  readonly name = "pexels";

  async search(options: ImageSearchOptions): Promise<NormalizedImageResult[]> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      return [];
    }

    const { query, limit = 12, page = 1 } = options;
    if (!query || !query.trim()) return [];

    try {
      const url = `${PEXELS_API_BASE}/search?query=${encodeURIComponent(
        query.trim()
      )}&per_page=${Math.min(30, limit)}&page=${page}&orientation=landscape`;

      const resp = await fetch(url, {
        headers: {
          Authorization: apiKey,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        console.warn(
          `[PexelsProvider] API responded ${resp.status}: ${resp.statusText}`
        );
        return [];
      }

      const data: PexelsSearchResponse = await resp.json();

      return (data.photos || []).map((photo): NormalizedImageResult => ({
        id: `pexels_${photo.id}`,
        url: photo.src.large,
        thumbnailUrl: photo.src.small,
        width: photo.width,
        height: photo.height,
        title: photo.alt || `Photo by ${photo.photographer}`,
        alt: photo.alt || `Photo by ${photo.photographer} on Pexels`,
        source: "stock",
        author: photo.photographer,
        license: "pexels",
        attributionUrl: photo.url,
        sourceProvider: "pexels",
        sourceUrl: photo.url,
        tags: [],
      }));
    } catch (err: any) {
      console.warn("[PexelsProvider] search failed:", err?.message);
      return [];
    }
  }
}

export const pexelsProvider = new PexelsProvider();
