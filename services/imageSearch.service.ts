// =============================================================================
//  IMAGE SEARCH SERVICE — SPRINT 1 FOUNDATION
//  services/imageSearch.service.ts
//
//  Design Decisions:
//  - All providers conform to the ImageSearchProvider interface (searchImages & search).
//  - Multi-provider search orchestration:
//      1. User's Asset Library
//      2. Real external providers (Unsplash, Pexels, Wikimedia)
//      3. Curated technical stock (offline / fallback when keys absent)
//  - Implements searchImages() conforming to Sprint 1 contract.
//  - Preserves search() signature for 100% backward compatibility.
//  - Supports pagination (page, limit) and orientation (landscape, portrait, square).
//  - Results normalized to ImageSearchResult contract with provider safety fields.
// =============================================================================

const mongoose = require("mongoose");
const { Asset } = require("../models");

import type {
  ImageSearchProvider,
  ImageSearchInput,
  ImageSearchOptions,
  ImageSearchResult,
  ImageOrientation,
} from "./imageSearch/imageSearchProvider.interface";
import { buildSearchQuery } from "./imageSearch/searchQueryBuilder";
import { rankCandidates } from "./imageSearch/relevanceRanker";

// ─── Asset Library Provider ────────────────────────────────────────────────────

class AssetLibraryProvider implements ImageSearchProvider {
  readonly name = "asset_library";

  async searchImages(input: {
    query: string;
    page?: number;
    limit?: number;
    orientation?: ImageOrientation;
    userId?: string;
  }): Promise<ImageSearchResult[]> {
    const { query, limit = 8, userId = null } = input;
    if (!query || !query.trim()) return [];
    if (mongoose.connection.readyState !== 1) return [];

    try {
      const filter: any = { del_flag: 0 };
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        filter.ownerId = userId;
      }

      const regex = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { alt: regex },
        { tags: regex },
        { description: regex },
        { originalName: regex },
        { searchQuery: regex },
      ];

      const docs = await Asset.find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(30, Math.max(1, limit)))
        .lean();

      return docs.map((doc: any): ImageSearchResult => ({
        id: doc._id.toString(),
        provider: "asset_library",
        sourceProvider: doc.sourceProvider || "asset_library",
        imageUrl: doc.url,
        url: doc.url,
        thumbnailUrl: doc.thumbnailUrl || doc.url,
        title: doc.originalName || doc.alt || "Library Asset",
        alt: doc.alt || doc.description || query,
        source: (doc.source === "ai_generated" || doc.type === "ai") ? "ai_generated" : "asset_library",
        prompt: doc.prompt || "",
        width: doc.width || 1200,
        height: doc.height || 630,
        tags: doc.tags || [],
        author: doc.author || undefined,
        license: doc.license || "User Asset",
        attributionUrl: doc.attributionUrl || undefined,
        sourceUrl: doc.sourceUrl || doc.url,
        usageRestrictions: ["Owned by user in OpenIdear Asset Library"],
      }));
    } catch (err: any) {
      console.warn("[AssetLibraryProvider] Search fallback:", err?.message);
      return [];
    }
  }

  async search(options: ImageSearchOptions): Promise<ImageSearchResult[]> {
    return this.searchImages(options);
  }
}

// ─── Curated Technical Stock Provider (Fallback) ───────────────────────────────

/**
 * Local curated technical stock provider. Used as a fallback when external
 * providers are unavailable or return insufficient results.
 * License: All URLs are from Unsplash (Unsplash License — free with attribution encouraged).
 */
class MockTechnicalStockProvider implements ImageSearchProvider {
  readonly name = "technical_stock";

  static CURATED_STOCK = [
    {
      keywords: ["architecture", "system", "diagram", "infra", "cloud", "aws", "docker", "kubernetes", "introduction", "overview", "concept", "intro"],
      url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&q=80",
      title: "Cloud Infrastructure Server Racks",
      alt: "Data center server racks with blue LED networking status lights",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1558494949-ef010cbdcc31",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["redis", "cache", "memory", "database", "sql", "nosql", "persistence"],
      url: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=400&q=80",
      title: "High Performance Data Storage System",
      alt: "Abstract visualization of fast in-memory key-value database caching nodes",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1544383835-bda2bc66a55d",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["code", "typescript", "javascript", "backend", "api", "software", "development"],
      url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=400&q=80",
      title: "Modern Technical Source Code Editor",
      alt: "Source code editor with dark syntax highlighting displaying backend business logic",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1555066931-4365d14bab8c",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["ai", "machine learning", "neural", "llm", "intelligence", "model", "vector"],
      url: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=400&q=80",
      title: "Neural Network & AI Topology",
      alt: "Geometric neural network digital representation with luminous connecting nodes",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1620712943543-bcc4688e7485",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["network", "security", "firewall", "cyber", "encryption", "auth", "token"],
      url: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=400&q=80",
      title: "Network Security & Cryptography",
      alt: "Secure digital communication network interface with cryptographic elements",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1563986768609-322da13575f3",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["microservices", "scale", "performance", "metric", "monitoring", "analytics"],
      url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80",
      title: "Telemetry & Performance Metrics Dashboard",
      alt: "Technical graphs and observability telemetry charts displaying low latency throughput",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1551288049-bebda4e38f71",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["gpu", "graphics", "rtx", "nvidia", "amd", "geforce", "bottleneck", "vram", "pcb", "cuda", "gaming", "hardware", "video card"],
      url: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=400&q=80",
      title: "High Performance Dedicated GPU (Graphics Card)",
      alt: "Modern dedicated graphics card PCIe unit with twin cooling fans and heatsink",
      author: "Christian Wiediger",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/WkfDrhxDMC8",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["cpu", "processor", "intel", "amd", "ryzen", "core", "silicon", "chip", "semiconductor", "microprocessor", "socket", "bottleneck"],
      url: "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=400&q=80",
      title: "Multi-Core CPU Processor & Silicon Die",
      alt: "High-speed multi-core computer processor chip on motherboard circuit board",
      author: "Sajjad Zabihi",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/I-lAeb_6t2E",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["motherboard", "circuit", "pc", "pcb", "hardware", "ram", "bus", "electronics", "components", "desktop"],
      url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80",
      title: "Desktop Motherboard Architecture & Component Bus",
      alt: "Computer motherboard printed circuit board with chipset, capacitors and traces",
      author: "Alexandre Debiève",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/FO7JIlwjOtU",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["ram", "memory", "ddr4", "ddr5", "vram", "dimm", "speed", "frequency", "bandwidth"],
      url: "https://images.unsplash.com/photo-1562976540-1502c2145186?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1562976540-1502c2145186?auto=format&fit=crop&w=400&q=80",
      title: "High-Speed Memory (RAM) Modules",
      alt: "High performance dual-channel desktop RAM memory sticks mounted in motherboard slots",
      author: "Harrison Broadbent",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/lzjl4K8CD28",
      sourceProvider: "unsplash",
    },
  ];

  async searchImages(input: {
    query: string;
    page?: number;
    limit?: number;
    orientation?: ImageOrientation;
    userId?: string;
  }): Promise<ImageSearchResult[]> {
    const { query, limit = 8 } = input;
    const q = (query || "").toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);

    const scored = MockTechnicalStockProvider.CURATED_STOCK.map((item, index) => {
      let score = 0;
      for (const word of words) {
        if (item.keywords.some((k) => k.includes(word) || word.includes(k))) score += 10;
        if (item.title.toLowerCase().includes(word)) score += 5;
        if (item.alt.toLowerCase().includes(word)) score += 3;
      }
      return { item, score, index };
    });

    const matches = scored.filter((s) => s.score > 0);
    matches.sort((a, b) => b.score - a.score || a.index - b.index);

    return matches.slice(0, Math.min(30, Math.max(1, limit))).map(({ item, index }): ImageSearchResult => ({
      id: `stock_${index}_${Date.now()}`,
      provider: "technical_stock",
      sourceProvider: item.sourceProvider || "unsplash",
      imageUrl: item.url,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      title: item.title,
      alt: item.alt,
      source: "stock",
      width: 1200,
      height: 800,
      tags: item.keywords,
      author: item.author,
      license: item.license,
      attributionUrl: item.attributionUrl,
      sourceUrl: item.url,
      usageRestrictions: [
        "Unsplash License — free for commercial & personal use",
        "Attribution encouraged",
      ],
    }));
  }

  async search(optionsOrQuery: ImageSearchOptions | string, legacyLimit?: number): Promise<ImageSearchResult[]> {
    const opts: ImageSearchOptions = typeof optionsOrQuery === "string"
      ? { query: optionsOrQuery, limit: legacyLimit ?? 8 }
      : optionsOrQuery;
    return this.searchImages(opts);
  }
}

// ─── Composite Image Search Service ───────────────────────────────────────────

export class ImageSearchService {
  private assetProvider: ImageSearchProvider;
  private stockProvider: ImageSearchProvider;
  private externalProviders: ImageSearchProvider[];

  constructor() {
    this.assetProvider = new AssetLibraryProvider();
    this.stockProvider = new MockTechnicalStockProvider();
    this.externalProviders = this._buildExternalProviders();
  }

  private _buildExternalProviders(): ImageSearchProvider[] {
    const providers: ImageSearchProvider[] = [];
    try {
      const { unsplashProvider } = require("./imageSearch/unsplash.provider");
      providers.push(unsplashProvider);
    } catch {}
    try {
      const { pexelsProvider } = require("./imageSearch/pexels.provider");
      providers.push(pexelsProvider);
    } catch {}
    try {
      const { wikimediaProvider } = require("./imageSearch/wikimedia.provider");
      providers.push(wikimediaProvider);
    } catch {}
    return providers;
  }

  /**
   * Primary unified search method conforming to the Sprint 1 requirements.
   */
  async searchImages(input: ImageSearchInput): Promise<ImageSearchResult[]> {
    // 1. Build or normalize the search query using deterministic rules if needed
    let effectiveQuery = (input.query || "").trim();
    const isGenericQuery = /^(?:introduction|overview|summary|conclusion|background|getting\s*started|guide|intro|mục\s*lục|lời\s*mở\s*đầu|kết\s*luận)$/i.test(effectiveQuery);
    if (!effectiveQuery || effectiveQuery.length < 3 || (isGenericQuery && (input.context?.articleTitle || input.context?.heading))) {
      if (input.context || input.visualSuggestionId) {
        const enriched = buildSearchQuery({
          query: input.query,
          searchQuery: input.context?.searchQuery,
          imagePrompt: input.context?.imagePrompt,
          heading: input.context?.heading,
          articleTitle: input.context?.articleTitle,
          sectionContent: input.context?.sectionContent,
          visualType: input.context?.visualType,
          visualSuggestionId: input.visualSuggestionId,
        });
        if (enriched && enriched.trim()) {
          effectiveQuery = enriched;
        }
      }
    }

    if (!effectiveQuery) {
      return [];
    }

    const safeLimit = Math.min(30, Math.max(1, Number(input.limit) || 12));
    const safePage = Math.max(1, Number(input.page) || 1);
    const orientation = input.orientation || "landscape";

    // 2. Query User's Asset Library (always first — private to current user)
    const libraryResults = await this.assetProvider.searchImages({
      query: effectiveQuery,
      limit: safeLimit,
      userId: input.userId,
      orientation,
    });

    // 3. Query External Providers (Unsplash, Pexels, Wikimedia)
    const externalResults: ImageSearchResult[] = [];
    const externalSlots = Math.max(4, safeLimit - libraryResults.length);

    for (const provider of this.externalProviders) {
      const remainingNeeded = externalSlots - externalResults.length;
      if (remainingNeeded <= 0) break;
      try {
        const results = await provider.searchImages({
          query: effectiveQuery,
          limit: remainingNeeded,
          page: safePage,
          orientation,
          userId: input.userId,
        });
        externalResults.push(...results);
      } catch (err: any) {
        console.warn(`[ImageSearchService] Provider ${provider.name} failed:`, err?.message);
      }
    }

    // 4. Mock Technical Stock as Fallback if external providers return nothing
    const stockResults: ImageSearchResult[] = [];
    const totalSoFar = libraryResults.length + externalResults.length;
    if (totalSoFar < safeLimit) {
      const stockSlots = safeLimit - totalSoFar;
      const mock = await this.stockProvider.searchImages({
        query: effectiveQuery,
        limit: Math.max(4, stockSlots),
        orientation,
      });
      stockResults.push(...mock);
    }

    const combined = [...libraryResults, ...externalResults, ...stockResults];

    // 5. Apply Relevance Ranking if context is provided
    if (input.context) {
      const ranked = rankCandidates(combined, {
        heading: input.context.heading,
        articleTitle: input.context.articleTitle,
        sectionContent: input.context.sectionContent,
        visualType: input.context.visualType,
        searchQuery: effectiveQuery,
        previouslySelectedUrls: (input.context as any)?.previouslySelectedUrls,
      });
      return ranked.slice(0, safeLimit);
    }

    return combined.slice(0, safeLimit);
  }

  /**
   * Backward-compatible search method for existing controllers and callers.
   */
  async search(
    query: string,
    limit = 12,
    userId: string | null = null,
    page = 1,
    orientation?: ImageOrientation
  ): Promise<ImageSearchResult[]> {
    return this.searchImages({
      query,
      limit,
      userId: userId as string,
      page,
      orientation,
    });
  }

  /**
   * Batch search images for multiple visual suggestions with bounded concurrency
   * and request deduplication.
   */
  async batchSearchImages(
    suggestions: Array<{
      id?: string;
      heading: string;
      query?: string;
      visualType?: string;
      context?: Record<string, any>;
    }>,
    options: {
      userId?: string;
      limitPerSuggestion?: number;
      orientation?: ImageOrientation;
      concurrency?: number;
    } = {}
  ): Promise<{
    total: number;
    completed: number;
    withResults: number;
    empty: number;
    failed: number;
    results: Array<{
      id?: string;
      heading: string;
      query: string;
      success: boolean;
      count: number;
      candidates: ImageSearchResult[];
      error?: string;
    }>;
  }> {
    const {
      userId,
      limitPerSuggestion = 6,
      orientation = "landscape",
      concurrency = 2,
    } = options;

    const total = suggestions.length;
    if (total === 0) {
      return { total: 0, completed: 0, withResults: 0, empty: 0, failed: 0, results: [] };
    }

    const results = new Array(total);
    // Request deduplication cache: normalized query string -> Promise<ImageSearchResult[]>
    const queryCache = new Map<string, Promise<ImageSearchResult[]>>();

    const processSuggestion = async (
      sec: {
        id?: string;
        heading: string;
        query?: string;
        visualType?: string;
        context?: Record<string, any>;
      },
      index: number
    ) => {
      let effectiveQuery = (sec.query || "").trim();
      if (!effectiveQuery || effectiveQuery.length < 3) {
        effectiveQuery = buildSearchQuery({
          query: sec.query,
          searchQuery: sec.context?.searchQuery,
          imagePrompt: sec.context?.imagePrompt,
          heading: sec.heading || sec.context?.heading,
          articleTitle: sec.context?.articleTitle,
          sectionContent: sec.context?.sectionContent,
          visualType: sec.visualType || sec.context?.visualType,
          visualSuggestionId: sec.id,
        });
      }

      const cacheKey = `${effectiveQuery.toLowerCase().trim()}_${orientation}`;

      try {
        let fetchPromise = queryCache.get(cacheKey);
        if (!fetchPromise) {
          fetchPromise = this.searchImages({
            query: effectiveQuery,
            limit: limitPerSuggestion,
            page: 1,
            orientation,
            userId,
            visualSuggestionId: sec.id,
            context: {
              heading: sec.heading,
              visualType: sec.visualType,
              searchQuery: effectiveQuery,
              ...sec.context,
            },
          });
          queryCache.set(cacheKey, fetchPromise);
        }

        const candidates = await fetchPromise;
        results[index] = {
          id: sec.id,
          heading: sec.heading,
          query: effectiveQuery,
          success: true,
          count: candidates.length,
          candidates,
        };
      } catch (err: any) {
        console.warn(`[ImageSearchService] Batch item failed for "${sec.heading}":`, err?.message);
        results[index] = {
          id: sec.id,
          heading: sec.heading,
          query: effectiveQuery,
          success: false,
          count: 0,
          candidates: [],
          error: err?.message || "Search failed",
        };
      }
    };

    // Bounded concurrency pool execution
    let cursor = 0;
    const worker = async () => {
      while (cursor < total) {
        const index = cursor++;
        await processSuggestion(suggestions[index], index);
      }
    };

    const workerCount = Math.max(1, Math.min(concurrency, total));
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    const completed = results.filter((r) => r && r.success).length;
    const withResults = results.filter((r) => r && r.success && r.count > 0).length;
    const empty = results.filter((r) => r && r.success && r.count === 0).length;
    const failed = results.filter((r) => r && !r.success).length;

    return {
      total,
      completed,
      withResults,
      empty,
      failed,
      results,
    };
  }
}

export const imageSearchService = new ImageSearchService();

module.exports = {
  AssetLibraryProvider,
  MockTechnicalStockProvider,
  ImageSearchService,
  imageSearchService,
};
