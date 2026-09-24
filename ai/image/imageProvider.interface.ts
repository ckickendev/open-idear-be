// =============================================================================
//  IMAGE PROVIDER INTERFACE & SEARCH TYPES
//  ai/image/imageProvider.interface.ts
//
//  Design Decisions:
//  - Establishes a clean provider abstraction for image search providers.
//  - Enables swapping between local Asset Library, stock photo APIs (Unsplash/Pexels),
//    and future AI Image Generation providers without touching consumer code.
// =============================================================================

export interface ImageSearchResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  alt: string;
  source: "asset_library" | "unsplash" | "mock";
  width?: number;
  height?: number;
  tags?: string[];
}

export interface ImageProvider {
  readonly name: string;
  search(query: string, limit?: number, userId?: string): Promise<ImageSearchResult[]>;
}
