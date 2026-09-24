// =============================================================================
//  IMAGE SEARCH SERVICE (SPRINT 2 UPGRADE)
//  services/imageSearch.service.ts
//
//  Sprint 2 Changes:
//  - Existing providers (AssetLibraryProvider, MockTechnicalStockProvider) now
//    conform to the formal ImageSearchProvider interface.
//  - Two real external providers added: UnsplashProvider, PexelsProvider.
//    Both are activated only when API keys are present in env variables.
//  - search() now supports a `page` parameter for pagination.
//  - NormalizedImageResult extended with provider safety fields.
//  - All external provider module imports use lazy require for test isolation.
//
//  IMPORTANT: Do NOT break existing callers — the exported singleton
//  `imageSearchService` and module.exports remain unchanged.
// =============================================================================

const mongoose = require("mongoose");
const { Asset } = require("../models");

import type {
  ImageSearchProvider,
  ImageSearchOptions,
  NormalizedImageResult,
} from "./imageSearch/imageSearchProvider.interface";

// ─── Asset Library Provider ────────────────────────────────────────────────────

class AssetLibraryProvider implements ImageSearchProvider {
  readonly name = "asset_library";

  async search(options: ImageSearchOptions): Promise<NormalizedImageResult[]> {
    const { query, limit = 8, userId = null } = options as any;
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
        .limit(limit)
        .lean();

      return docs.map((doc: any): NormalizedImageResult => ({
        id: doc._id.toString(),
        url: doc.url,
        thumbnailUrl: doc.thumbnailUrl || doc.url,
        title: doc.originalName || doc.alt || "Library Asset",
        alt: doc.alt || doc.description || query,
        source: (doc.source === "ai_generated" || doc.type === "ai") ? "ai_generated" : "asset_library",
        prompt: doc.prompt || "",
        width: doc.width || 1200,
        height: doc.height || 630,
        tags: doc.tags || [],
        // Provider provenance (populated if originally imported from a provider)
        author: doc.author || undefined,
        license: doc.license || undefined,
        attributionUrl: doc.attributionUrl || undefined,
        sourceProvider: doc.sourceProvider || undefined,
        sourceUrl: doc.sourceUrl || undefined,
      }));
    } catch (err: any) {
      console.warn("[AssetLibraryProvider] Search fallback:", err?.message);
      return [];
    }
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
      keywords: ["architecture", "system", "diagram", "infra", "cloud", "aws", "docker", "kubernetes"],
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
  ];

  async search(optionsOrQuery: ImageSearchOptions | string, legacyLimit?: number): Promise<NormalizedImageResult[]> {
    // Backward-compatible: accept both search(options) and search(query, limit)
    const opts: ImageSearchOptions = typeof optionsOrQuery === "string"
      ? { query: optionsOrQuery, limit: legacyLimit ?? 8 }
      : optionsOrQuery;
    const { query, limit = 8 } = opts;
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

    scored.sort((a, b) => b.score - a.score || a.index - b.index);

    return scored.slice(0, limit).map(({ item, index }): NormalizedImageResult => ({
      id: `stock_${index}_${Date.now()}`,
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
      sourceProvider: item.sourceProvider,
      sourceUrl: item.url,
    }));
  }
}

// ─── Composite Image Search Service ───────────────────────────────────────────

class ImageSearchService {
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
    return providers;
  }

  async search(
    query: string,
    limit = 12,
    userId: string | null = null,
    page = 1
  ): Promise<NormalizedImageResult[]> {
    const cleanQuery = (query || "").trim();
    const safeLimit = Math.min(30, Math.max(1, Number(limit) || 12));
    const safePage = Math.max(1, Number(page) || 1);

    // 1. User's Asset Library (always first — no pagination needed for own library)
    const libraryResults = await this.assetProvider.search({
      query: cleanQuery,
      limit: safeLimit,
      userId: userId as string,
    });

    // 2. External providers (Unsplash, Pexels) — only if API keys are configured
    const externalResults: NormalizedImageResult[] = [];
    const externalSlots = Math.max(4, safeLimit - libraryResults.length);
    const perProvider = Math.ceil(externalSlots / Math.max(1, this.externalProviders.length));

    for (const provider of this.externalProviders) {
      try {
        const results = await provider.search({
          query: cleanQuery,
          limit: perProvider,
          page: safePage,
        });
        externalResults.push(...results);
        if (externalResults.length >= externalSlots) break;
      } catch (err: any) {
        console.warn(`[ImageSearchService] Provider ${provider.name} failed:`, err?.message);
      }
    }

    // 3. Mock technical stock as fallback — only if external providers returned nothing
    const stockResults: NormalizedImageResult[] = [];
    const totalSoFar = libraryResults.length + externalResults.length;
    if (totalSoFar < safeLimit) {
      const stockSlots = safeLimit - totalSoFar;
      const mock = await this.stockProvider.search({ query: cleanQuery, limit: Math.max(4, stockSlots) });
      stockResults.push(...mock);
    }

    const combined = [...libraryResults, ...externalResults, ...stockResults];
    return combined.slice(0, safeLimit);
  }
}

const imageSearchService = new ImageSearchService();

module.exports = {
  AssetLibraryProvider,
  MockTechnicalStockProvider,
  ImageSearchService,
  imageSearchService,
};
