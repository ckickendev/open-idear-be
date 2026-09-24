// =============================================================================
//  IMAGE SEARCH PROVIDER INTERFACE
//  services/imageSearch/imageSearchProvider.interface.ts
//
//  Design Decisions:
//  - Formal TypeScript contract that every image search provider must satisfy.
//  - Normalises results across Unsplash, Pexels, Asset Library, and future providers.
//  - Provider safety: author, license, and attributionUrl MUST be populated
//    from real provider metadata. Do NOT present a stock image as "free to use"
//    unless the provider explicitly supplies appropriate license information.
// =============================================================================

export type ImageSourceType =
  | "asset_library"
  | "stock"
  | "ai_generated"
  | "upload";

/**
 * Normalised result returned by any ImageSearchProvider.
 * All providers MUST map their API response to this shape.
 */
export interface NormalizedImageResult {
  /** Stable provider-scoped identifier (e.g. Unsplash photo ID). */
  readonly id: string;
  /** Full-resolution CDN URL. */
  readonly url: string;
  /** Thumbnail CDN URL (≤400 px wide). */
  readonly thumbnailUrl: string;
  readonly width: number;
  readonly height: number;
  /** Human-readable title or description. */
  readonly title: string;
  /** Accessible alt text. */
  readonly alt: string;
  readonly source: ImageSourceType;

  // ─── Provider Safety ───────────────────────────────────────────────────────
  /** Photographer or creator name. */
  readonly author?: string;
  /**
   * License identifier:
   *  - "unsplash"  → Unsplash License (free for commercial use w/ attribution encouraged)
   *  - "pexels"    → Pexels License  (free for commercial use w/ attribution encouraged)
   *  - "cc0"       → Public Domain / CC0
   */
  readonly license?: string;
  /** URL back to the original asset page for attribution purposes. */
  readonly attributionUrl?: string;
  /** Provider slug, e.g. "unsplash" | "pexels". */
  readonly sourceProvider?: string;
  /** Original provider asset page URL (for dedup & attribution). */
  readonly sourceUrl?: string;

  // ─── Optional Extras ───────────────────────────────────────────────────────
  readonly prompt?: string;
  readonly tags?: string[];
}

/**
 * Input options for a provider search call.
 */
export interface ImageSearchOptions {
  query: string;
  limit?: number;
  page?: number;
  userId?: string;
}

/**
 * Every image search provider MUST implement this interface.
 */
export interface ImageSearchProvider {
  readonly name: string;
  search(options: ImageSearchOptions): Promise<NormalizedImageResult[]>;
}
