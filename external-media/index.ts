import type { MediaSearchProvider, ExternalPhoto, ProviderSearchResponse } from "./types";
import { UnsplashProvider } from "./unsplash.provider";
import { PexelsProvider } from "./pexels.provider";
import { PixabayProvider } from "./pixabay.provider";

export * from "./types";
export { UnsplashProvider } from "./unsplash.provider";
export { PexelsProvider } from "./pexels.provider";
export { PixabayProvider } from "./pixabay.provider";

export class ExternalMediaService {
  private readonly providers = new Map<string, MediaSearchProvider>();

  constructor() {
    // 1. Register default API driver instances
    this.registerProvider(new UnsplashProvider());
    this.registerProvider(new PexelsProvider());
    this.registerProvider(new PixabayProvider());
  }

  /**
   * Register a new MediaSearchProvider (Plug-and-Play)
   */
  registerProvider(provider: MediaSearchProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[ExternalMediaService] Registered provider: ${provider.name} (${provider.id})`);
  }

  /**
   * Unregisters a provider from search routines
   */
  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
    console.log(`[ExternalMediaService] Unregistered provider: ${providerId}`);
  }

  /**
   * Retrieves a registered search provider by ID
   */
  getProvider(providerId: string): MediaSearchProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Media search provider '${providerId}' is not registered in this system.`);
    }
    return provider;
  }

  /**
   * Returns a list of all active search provider instances
   */
  getActiveProviders(): MediaSearchProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Searches for images. If a providerId is specified, queries only that endpoint.
   * Otherwise, executes parallel requests across all active drivers and merges/interleaves results.
   */
  async search(query: string, providerId?: string, page = 1, perPage = 20): Promise<ProviderSearchResponse> {
    const externalMediaCacheService = require("../services/externalMediaCache.services");

    // 1. Check search cache first
    const cached = await externalMediaCacheService.getSearch(query, providerId || "all", page, perPage);
    if (cached) {
      console.log(`[ExternalMediaService] Search Cache hit for query: "${query}" (Provider: ${providerId || "all"})`);
      return cached;
    }

    if (providerId) {
      const provider = this.getProvider(providerId);
      if (externalMediaCacheService.isProviderLocked(provider.id)) {
        throw new Error(`Provider '${provider.id}' is currently rate-limited.`);
      }
      const res = await provider.search(query, page, perPage);
      await externalMediaCacheService.setSearch(query, providerId, page, perPage, res);
      return res;
    }

    const active = this.getActiveProviders();
    if (active.length === 0) {
      return { photos: [], total: 0 };
    }

    // Executed parallel search requests with error boundaries
    const tasks = active.map(async (provider) => {
      // Respect Rate Limit locks
      if (externalMediaCacheService.isProviderLocked(provider.id)) {
        console.warn(`[ExternalMediaService] Search skipped for locked provider: ${provider.id}`);
        return [];
      }

      try {
        const response = await provider.search(query, page, perPage);
        return response.photos;
      } catch (err: any) {
        console.error(`[ExternalMediaService] Provider '${provider.id}' search request failed:`, err.message);
        // Lock provider if we hit 429
        if (err.response?.status === 429) {
          externalMediaCacheService.lockProvider(provider.id);
        }
        return []; // Graceful degradation
      }
    });

    const lists = await Promise.all(tasks);

    // Merge strategy: Interleave results from each provider to ensure balanced presentation
    const photos: ExternalPhoto[] = [];
    const maxLength = Math.max(...lists.map((list) => list.length));

    for (let index = 0; index < maxLength; index++) {
      for (let pIndex = 0; pIndex < lists.length; pIndex++) {
        const item = lists[pIndex][index];
        if (item) {
          photos.push(item);
        }
      }
    }

    const result = {
      photos: photos.slice(0, perPage),
      total: photos.length,
    };

    // Cache the merged results
    await externalMediaCacheService.setSearch(query, "all", page, perPage, result);

    return result;
  }

  /**
   * Retrieves the raw photo details from the provider
   */
  async getPhoto(providerId: string, photoId: string): Promise<ExternalPhoto> {
    const provider = this.getProvider(providerId);
    return await provider.getPhoto(photoId);
  }

  /**
   * Downloads the raw binary image stream as a Buffer
   */
  async download(providerId: string, photoId: string): Promise<Buffer> {
    const provider = this.getProvider(providerId);
    return await provider.download(photoId);
  }
}

export const externalMediaService = new ExternalMediaService();
