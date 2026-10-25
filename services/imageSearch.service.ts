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
    // ─── Cloud & Infrastructure ─────────────────────────────────────────────
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
      keywords: ["server", "data center", "rack", "hosting", "colocation", "datacenter"],
      url: "https://images.unsplash.com/photo-1597852074816-d933c7d2b988?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1597852074816-d933c7d2b988?auto=format&fit=crop&w=400&q=80",
      title: "Enterprise Server Room Infrastructure",
      alt: "Row of servers in a secure data center colocation facility",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1597852074816-d933c7d2b988",
      sourceProvider: "unsplash",
    },
    // ─── Database & Caching ──────────────────────────────────────────────────
    {
      keywords: ["redis", "cache", "database", "sql", "nosql", "persistence", "storage"],
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
      keywords: ["disk", "storage", "file system", "read", "write", "hard drive", "hdd"],
      url: "https://images.unsplash.com/photo-1531492898478-3a1d5e7f12fb?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1531492898478-3a1d5e7f12fb?auto=format&fit=crop&w=400&q=80",
      title: "Hard Disk Drive Storage Technology",
      alt: "Close-up of a hard disk drive platter and read/write head mechanism",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1531492898478-3a1d5e7f12fb",
      sourceProvider: "unsplash",
    },
    // ─── Software & Code ────────────────────────────────────────────────────
    {
      keywords: ["code", "typescript", "javascript", "backend", "api", "software", "development", "programming"],
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
      keywords: ["terminal", "cli", "command line", "shell", "bash", "linux", "console"],
      url: "https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=400&q=80",
      title: "Linux Terminal & Command Line Interface",
      alt: "Dark terminal window with green command line output on a Linux system",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1629654297299-c8506221ca97",
      sourceProvider: "unsplash",
    },
    // ─── AI & Machine Learning ──────────────────────────────────────────────
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
    // ─── Security & Networking ──────────────────────────────────────────────
    {
      keywords: ["network", "security", "firewall", "cyber", "encryption", "auth", "token", "vpn"],
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
      keywords: ["ethernet", "cable", "lan", "fiber", "networking", "switch", "router", "wifi"],
      url: "https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=400&q=80",
      title: "Network Ethernet Cables & Patch Panel",
      alt: "Multiple colorful ethernet patch cables connected to a network switch",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1588508065123-287b28e013da",
      sourceProvider: "unsplash",
    },
    // ─── Monitoring & Analytics ─────────────────────────────────────────────
    {
      keywords: ["microservices", "scale", "performance", "metric", "monitoring", "analytics", "dashboard"],
      url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80",
      title: "Telemetry & Performance Metrics Dashboard",
      alt: "Technical graphs and observability telemetry charts displaying low latency throughput",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1551288049-bebda4e38f71",
      sourceProvider: "unsplash",
    },
    // ─── GPU & Graphics ─────────────────────────────────────────────────────
    {
      keywords: ["gpu", "graphics", "rtx", "nvidia", "geforce", "vram", "cuda", "gaming", "video card"],
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
      keywords: ["amd", "radeon", "rx", "rx 7800", "rx 7900", "gpu amd"],
      url: "https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?auto=format&fit=crop&w=400&q=80",
      title: "AMD Graphics Processing Unit",
      alt: "AMD Radeon graphics card on a dark surface showing PCB and cooling fins",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1612198188060-c7c2a3b66eae",
      sourceProvider: "unsplash",
    },
    // ─── CPU & Processor ────────────────────────────────────────────────────
    {
      keywords: ["cpu", "processor", "intel", "core", "silicon", "chip", "semiconductor", "microprocessor", "socket"],
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
      keywords: ["ryzen", "amd cpu", "zen", "threadripper", "ryzen 5", "ryzen 7", "ryzen 9"],
      url: "https://images.unsplash.com/photo-1592664474496-8f2ec5b9b3d7?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1592664474496-8f2ec5b9b3d7?auto=format&fit=crop&w=400&q=80",
      title: "AMD Ryzen Processor",
      alt: "AMD Ryzen processor placed on a black surface showing PGA socket pins",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1592664474496-8f2ec5b9b3d7",
      sourceProvider: "unsplash",
    },
    // ─── Motherboard & PCB ──────────────────────────────────────────────────
    {
      keywords: ["motherboard", "circuit", "pcb", "bus", "electronics", "components", "desktop", "mainboard"],
      url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80",
      title: "Desktop Motherboard Architecture & Component Bus",
      alt: "Computer motherboard printed circuit board with chipset, capacitors and traces",
      author: "Alexandre Debiève",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/FO7JIlwjOtU",
      sourceProvider: "unsplash",
    },
    // ─── RAM & Memory ────────────────────────────────────────────────────────
    {
      keywords: ["ram", "memory", "ddr4", "ddr5", "dimm", "bandwidth", "frequency"],
      url: "https://images.unsplash.com/photo-1562976540-1502c2145186?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1562976540-1502c2145186?auto=format&fit=crop&w=400&q=80",
      title: "High-Speed Memory (RAM) Modules",
      alt: "High performance dual-channel desktop RAM memory sticks mounted in motherboard slots",
      author: "Harrison Broadbent",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/lzjl4K8CD28",
      sourceProvider: "unsplash",
    },
    // ─── SSD & NVMe ─────────────────────────────────────────────────────────
    {
      keywords: ["ssd", "nvme", "m.2", "solid state", "flash storage", "pcie ssd", "lifespan", "endurance", "tlc", "mlc"],
      url: "https://images.unsplash.com/photo-1600348759986-c5cd9a78f057?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1600348759986-c5cd9a78f057?auto=format&fit=crop&w=400&q=80",
      title: "NVMe M.2 Solid State Drive",
      alt: "NVMe M.2 solid state drive module showing controller and NAND flash chips",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1600348759986-c5cd9a78f057",
      sourceProvider: "unsplash",
    },
    // ─── Power Supply & Cooling ─────────────────────────────────────────────
    {
      keywords: ["psu", "power supply", "watt", "tdp", "power consumption", "electricity", "voltage"],
      url: "https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&w=400&q=80",
      title: "PC Power Supply Unit",
      alt: "Modular PC power supply unit with cables and fan visible from the side",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1555664424-778a1e5e1b48",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["cooling", "fan", "heatsink", "thermal", "temperature", "heat", "cooler", "airflow", "lifespan", "degradation"],
      url: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&w=400&q=80",
      title: "PC Case Cooling Fan & Airflow",
      alt: "RGB case fan spinning inside a PC tower providing CPU and GPU cooling airflow",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1593642632559-0c6d3fc62b89",
      sourceProvider: "unsplash",
    },
    // ─── Laptop & PC Build ──────────────────────────────────────────────────
    {
      keywords: ["laptop", "notebook", "portable", "mobile workstation", "thin light"],
      url: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&q=80",
      title: "Modern Laptop Computer Workstation",
      alt: "Open laptop on a desk showing a code editor on screen",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1496181133206-80ce9b88a853",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["pc build", "build", "case", "tower", "rgb", "gaming pc", "mid-tower", "atx"],
      url: "https://images.unsplash.com/photo-1587202372616-b43abea06c2a?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1587202372616-b43abea06c2a?auto=format&fit=crop&w=400&q=80",
      title: "Custom RGB Gaming PC Build",
      alt: "Custom gaming PC tower with tempered glass side panel showing RGB components",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1587202372616-b43abea06c2a",
      sourceProvider: "unsplash",
    },
    // ─── Benchmarks & Lifespan Topics ───────────────────────────────────────
    {
      keywords: ["benchmark", "fps", "game performance", "frame rate", "test", "compare", "vs"],
      url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80",
      title: "Gaming Performance Benchmark Test",
      alt: "Gaming monitor showing high FPS counter during a benchmark test run",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1542751371-adc38448a05e",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["lifespan", "lifecycle", "aging", "longevity", "wear", "factor", "usable", "durability", "years"],
      url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=400&q=80",
      title: "Technology Longevity & Lifecycle",
      alt: "Close-up of electronic components showing aging and wear on printed circuit board",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1516321318423-f06f85e504b3",
      sourceProvider: "unsplash",
    },
    {
      keywords: ["upgrade", "replace", "new", "old", "obsolete", "generation", "future", "next gen"],
      url: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=400&q=80",
      title: "Technology Upgrade & Evolution",
      alt: "Team of people working with laptops and tablets on a modern tech project",
      author: "Unsplash Photographer",
      license: "unsplash",
      attributionUrl: "https://unsplash.com/photos/1519389950473-47ba0277781c",
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

    // 5. URL-level deduplication — remove any image that shares a URL with an earlier result
    const seenUrls = new Set<string>();
    const deduped: ImageSearchResult[] = [];
    for (const r of [...libraryResults, ...externalResults, ...stockResults]) {
      const key = r.url || r.imageUrl || r.sourceUrl || "";
      if (!key || seenUrls.has(key)) continue;
      seenUrls.add(key);
      deduped.push(r);
    }

    // 6. Apply Relevance Ranking if context is provided
    if (input.context) {
      const ranked = rankCandidates(deduped, {
        heading: input.context.heading,
        articleTitle: input.context.articleTitle,
        sectionContent: input.context.sectionContent,
        visualType: input.context.visualType,
        searchQuery: effectiveQuery,
        previouslySelectedUrls: (input.context as any)?.previouslySelectedUrls,
      });
      return ranked.slice(0, safeLimit);
    }

    return deduped.slice(0, safeLimit);
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

    // Cross-section duplicate tracking: accumulates URLs shown in prior sections
    // so the -50pt duplicate penalty in rankCandidates() is properly exercised.
    const globalUsedUrls: string[] = [];

    // Request deduplication cache: normalized query string -> Promise<ImageSearchResult[]>
    // Keyed by (query + sectionIndex) so different sections get different page offsets
    // even when they resolve to the same query string.
    const queryCache = new Map<string, Promise<ImageSearchResult[]>>();

    // Sequential processing mutex per-worker to preserve globalUsedUrls ordering
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

      // Include index in cache key so identical queries on different sections
      // can request different pages from external providers.
      const pageOffset = Math.floor(index / 2) + 1; // sections 0-1 → page 1, 2-3 → page 2, …
      const cacheKey = `${effectiveQuery.toLowerCase().trim()}_${orientation}_pg${pageOffset}`;

      // Snapshot currently-used URLs before this search so the ranking penalty fires
      const snapshotUsedUrls = [...globalUsedUrls];

      try {
        let fetchPromise = queryCache.get(cacheKey);
        if (!fetchPromise) {
          fetchPromise = this.searchImages({
            query: effectiveQuery,
            limit: limitPerSuggestion,
            page: pageOffset,
            orientation,
            userId,
            visualSuggestionId: sec.id,
            context: {
              heading: sec.heading,
              visualType: sec.visualType,
              searchQuery: effectiveQuery,
              // ✅ Wire the cross-section duplicate penalty
              previouslySelectedUrls: snapshotUsedUrls,
              ...sec.context,
            },
          });
          queryCache.set(cacheKey, fetchPromise);
        }

        const candidates = await fetchPromise;

        // Record URLs from top candidates so subsequent sections penalise them
        for (const c of candidates.slice(0, 3)) {
          const u = c.url || c.imageUrl || "";
          if (u && !globalUsedUrls.includes(u)) {
            globalUsedUrls.push(u);
          }
        }

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
    // NOTE: globalUsedUrls accumulation is safe at concurrency=2 (slight race is acceptable;
    // the worst case is two concurrent sections share one batch of URLs before writing back).
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
