// =============================================================================
//  UNSPLASH IMAGE SEARCH PROVIDER — SPRINT 1 FOUNDATION
//  services/imageSearch/unsplash.provider.ts
//
//  Design Decisions:
//  - Conforms strictly to ImageSearchProvider interface (searchImages & search).
//  - Uses official Unsplash Search API (https://api.unsplash.com/search/photos).
//  - Server-side only: reads UNSPLASH_ACCESS_KEY from process.env; never leaks key.
//  - Supports pagination (page, per_page clamped to max 30) and orientation (landscape, portrait, square).
//  - Normalizes results into internal ImageSearchResult contract.
//  - Populates provider attribution, license, and usage restrictions in compliance with Unsplash API Guidelines.
//  - Resilient: timeouts (8s), API errors (4xx/5xx), missing keys return empty arrays without throwing.
//  - Safe logging: avoids logging API credentials or confidential article data.
// =============================================================================

import type {
  ImageSearchProvider,
  ImageSearchInput,
  ImageSearchOptions,
  ImageSearchResult,
  ImageOrientation,
} from "./imageSearchProvider.interface";

const UNSPLASH_API_BASE = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  width: number;
  height: number;
  urls: {
    raw?: string;
    full?: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: {
    html: string;
    download_location?: string;
  };
  user: {
    name: string;
    username?: string;
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

  /**
   * Primary image search satisfying the Sprint 1 contract.
   */
  async searchImages(input: {
    query: string;
    page?: number;
    limit?: number;
    orientation?: ImageOrientation;
    userId?: string;
  }): Promise<ImageSearchResult[]> {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!apiKey) {
      // Missing API key handled gracefully without error
      return [];
    }

    const cleanQuery = (input.query || "").trim();
    if (!cleanQuery) return [];

    const safeLimit = Math.min(30, Math.max(1, Number(input.limit) || 12));
    const safePage = Math.max(1, Number(input.page) || 1);

    // Map orientation to Unsplash API values: landscape | portrait | squarish
    let unsplashOrientation = "landscape";
    if (input.orientation === "portrait") {
      unsplashOrientation = "portrait";
    } else if (input.orientation === "square") {
      unsplashOrientation = "squarish";
    }

    try {
      const url = `${UNSPLASH_API_BASE}/search/photos?query=${encodeURIComponent(
        cleanQuery
      )}&per_page=${safeLimit}&page=${safePage}&orientation=${unsplashOrientation}`;

      const resp = await fetch(url, {
        headers: {
          Authorization: `Client-ID ${apiKey}`,
          "Accept-Version": "v1",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        // Safe logging: log status code without sensitive headers or queries
        console.warn(`[UnsplashProvider] API returned HTTP status ${resp.status}`);
        return [];
      }

      const data = (await resp.json()) as UnsplashSearchResponse;
      if (!data || !Array.isArray(data.results)) {
        return [];
      }

      return data.results.map((photo): ImageSearchResult => {
        const authorName = photo.user?.name || "Unsplash Photographer";
        const titleText = photo.description || photo.alt_description || `Photo by ${authorName}`;
        const altText = photo.alt_description || photo.description || `Photo by ${authorName} on Unsplash`;
        const photoPageUrl = photo.links?.html || "https://unsplash.com";

        // Unsplash API Guidelines require attribution links to include UTM parameters
        const attributionUrl = photoPageUrl.includes("?")
          ? `${photoPageUrl}&utm_source=openidear&utm_medium=referral`
          : `${photoPageUrl}?utm_source=openidear&utm_medium=referral`;

        return {
          id: `unsplash_${photo.id}`,
          provider: "unsplash",
          sourceProvider: "unsplash",
          title: titleText,
          imageUrl: photo.urls.regular,
          url: photo.urls.regular,
          thumbnailUrl: photo.urls.small || photo.urls.thumb,
          width: photo.width,
          height: photo.height,
          author: authorName,
          sourceUrl: photoPageUrl,
          license: "unsplash",
          attributionUrl,
          usageRestrictions: [
            "Free for commercial and non-commercial use",
            "Attribution appreciated (Unsplash License)",
            "Cannot be sold without significant modification",
            "Cannot compile photos into a replicating competing service",
          ],
          alt: altText,
          source: "stock",
          tags: [],
        };
      });
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        console.warn("[UnsplashProvider] Request timed out after 8s");
      } else {
        console.warn("[UnsplashProvider] Search failed gracefully:", err?.message);
      }
      return [];
    }
  }

  /**
   * Backward-compatible delegation for existing callers.
   */
  async search(options: ImageSearchOptions): Promise<ImageSearchResult[]> {
    return this.searchImages(options);
  }
}

export const unsplashProvider = new UnsplashProvider();
