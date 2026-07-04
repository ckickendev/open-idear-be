/**
 * =============================================================================
 *  EXTERNAL MEDIA PROVIDERS — CONVERT CONTRACTS
 *  external-media/types.ts
 * =============================================================================
 */

export interface ExternalPhoto {
  readonly id: string;
  readonly provider: string;
  readonly url: string;          // Medium web preview image URL
  readonly previewUrl: string;    // Low-resolution thumbnail preview URL
  readonly downloadUrl: string;   // Image download URL for buffer import
  readonly alt: string;
  readonly description: string;
  readonly tags: string[];
  readonly author: {
    readonly name: string;
    readonly profileUrl?: string; // Back-link profile URL required by API licenses
  };
  readonly width: number;
  readonly height: number;
}

export interface ProviderSearchResponse {
  readonly photos: ExternalPhoto[];
  readonly total: number;
}

export interface MediaSearchProvider {
  /** Unique provider key identifier (e.g. "unsplash") */
  readonly id: string;
  
  /** Human-readable provider name (e.g. "Unsplash") */
  readonly name: string;

  /** Search photos using provider API queries */
  search(query: string, page?: number, perPage?: number): Promise<ProviderSearchResponse>;

  /** Retrieves metadata details for a specific photo ID */
  getPhoto(photoId: string): Promise<ExternalPhoto>;

  /** Downloads photo buffer stream by photo ID or direct downloadUrl */
  download(photoId: string): Promise<Buffer>;
}
