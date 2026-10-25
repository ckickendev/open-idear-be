// =============================================================================
//  IMAGE SEARCH PROVIDER INTERFACE — SPRINT 1 FOUNDATION
//  services/imageSearch/imageSearchProvider.interface.ts
//
//  Design Decisions:
//  - Formal TypeScript contract that every image search provider must satisfy.
//  - Normalizes results into a consistent internal contract (ImageSearchResult).
//  - Adapts to existing codebase by aliasing `url` <-> `imageUrl` and `sourceProvider` <-> `provider`.
//  - Provider safety: author, license, attributionUrl, and usageRestrictions
//    must be populated from provider metadata.
// =============================================================================

export type ImageSourceType =
  | "asset_library"
  | "stock"
  | "ai_generated"
  | "upload";

export type ImageOrientation = "landscape" | "portrait" | "square";

/**
 * Normalized internal contract for any image search result.
 * Satisfies both the Sprint 1 requirements and existing OpenIdear callers.
 */
export interface ImageSearchResult {
  /** Stable provider-scoped identifier */
  readonly id: string;

  /** Provider name/slug, e.g. "unsplash" | "pexels" | "asset_library" | "technical_stock" */
  readonly provider: string;

  /** Backward-compatible alias for provider */
  readonly sourceProvider?: string;

  /** Human-readable title or description */
  readonly title?: string;

  /** Canonical high-resolution / regular image URL */
  readonly imageUrl: string;

  /** Backward-compatible alias for imageUrl */
  readonly url: string;

  /** Thumbnail CDN URL (<= 400px wide) */
  readonly thumbnailUrl?: string;

  /** Pixel dimensions */
  readonly width?: number;
  readonly height?: number;

  /** Photographer or creator name */
  readonly author?: string;

  /** URL back to the original asset page for attribution */
  readonly sourceUrl: string;

  /**
   * License identifier:
   *  - "unsplash" -> Unsplash License (free commercial & editorial w/ attribution encouraged)
   *  - "pexels"   -> Pexels License (free commercial & editorial w/ attribution encouraged)
   *  - "cc0"      -> Public Domain / CC0
   */
  readonly license?: string;

  /** Attribution back-link URL (with UTM tags where required) */
  readonly attributionUrl?: string;

  /** Provider license conditions & restrictions */
  readonly usageRestrictions?: string[];

  // ─── OpenIdear UI & Search Additions ───────────────────────────────────────
  /** Accessible alt text */
  readonly alt?: string;
  readonly source?: ImageSourceType;
  readonly prompt?: string;
  readonly tags?: string[];
}

/**
 * Backward-compatible alias for existing codebase callers.
 */
export type NormalizedImageResult = ImageSearchResult;

/**
 * Standard input options for image search queries.
 */
export interface ImageSearchInput {
  query: string;
  page?: number;
  limit?: number;
  orientation?: ImageOrientation;
  userId?: string;
  visualSuggestionId?: string;
  context?: {
    articleTitle?: string;
    heading?: string;
    sectionContent?: string;
    visualType?: string;
    imagePrompt?: string;
    searchQuery?: string;
  };
}

/**
 * Backward-compatible alias for ImageSearchInput.
 */
export type ImageSearchOptions = ImageSearchInput;

/**
 * Interface that all image search providers must implement.
 */
export interface ImageSearchProvider {
  /** Provider identifier, e.g. "unsplash", "pexels", "asset_library" */
  readonly name: string;

  /**
   * Primary search method conforming to the Sprint 1 specification.
   */
  searchImages(input: {
    query: string;
    page?: number;
    limit?: number;
    orientation?: ImageOrientation;
    userId?: string;
  }): Promise<ImageSearchResult[]>;

  /**
   * Optional/backward-compatible search method for existing callers.
   */
  search?(options: ImageSearchOptions): Promise<ImageSearchResult[]>;
}
