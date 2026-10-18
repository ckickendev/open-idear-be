// =============================================================================
//  WIKIMEDIA COMMONS IMAGE SEARCH PROVIDER
//  services/imageSearch/wikimedia.provider.ts
//
//  Design Decisions:
//  - Queries Wikimedia Commons MediaWiki API.
//  - 100% Free, Public, Open Access — No API key needed!
//  - Millions of hardware, technology, components, and computing imagery.
//  - Supplies real author, Creative Commons / Public Domain license info.
// =============================================================================

import type {
  ImageSearchProvider,
  ImageSearchInput,
  ImageSearchOptions,
  ImageSearchResult,
  ImageOrientation,
} from "./imageSearchProvider.interface";

const { buildSearchQuery } = require("./searchQueryBuilder");

function simplifySearchTerms(input: string): string {
  try {
    const built = buildSearchQuery({ query: input });
    if (built && built.trim().length >= 3 && built.toLowerCase() !== input.toLowerCase()) {
      return built.trim();
    }
  } catch {}

  const trimmed = input.trim();
  // Hardware specific entity mapping
  if (/(?:thermal\s*paste|keo\s*tản\s*nhiệt|thermal\s*compound)/i.test(trimmed)) return "thermal paste";
  if (/(?:liquid\s*cooler|aio(?:\s*cooler)?|all-in-one)/i.test(trimmed)) return "aio liquid cooler";
  if (/(?:air\s*cooler|cpu\s*cooler|heatsink)/i.test(trimmed)) return "cpu air cooler";
  if (/(?:case\s*airflow|fan|quạt)/i.test(trimmed)) return "computer cooling fan";
  if (/(?:core\s*i9|i9(?:\s+cpus?)?|i9-[0-9]+)/i.test(trimmed)) return "Intel Core i9";
  if (/(?:core\s*i7|i7(?:\s+cpus?)?|i7-[0-9]+)/i.test(trimmed)) return "Intel Core i7";
  if (/(?:core\s*i5|i5(?:\s+cpus?)?|i5-[0-9]+)/i.test(trimmed)) return "Intel Core i5";
  if (/(?:motherboard|mainboard)/i.test(trimmed)) return "computer motherboard";
  if (/(?:ddr5|ddr4|ram)/i.test(trimmed)) return "computer ram";
  if (/(?:rtx\s*[0-9]+|geforce|vga|graphics\s*card)/i.test(trimmed)) return "graphics card";

  // General filler removal
  let cleaned = trimmed
    .replace(/\s+(?:hardware photo|hardware photography|diagram architecture|architecture diagram)$/i, "")
    .replace(/^(?:importance of|common mistakes to avoid when|mistake\s+[0-9]+[:\-.]*|why\s+[a-z0-9\s]+\s+run\s+hot|recommending|underestimating|how to|guide to|best practices for|an introduction to|good|bad)\s+/i, "")
    .replace(/[#*`_~[\](){}<>!|\\^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // If still more than 3 words, take the first 2-3 significant words
  const words = cleaned.split(" ").filter((w) => w.length > 2 && !/^(?:and|the|for|your|with|from)$/i.test(w));
  if (words.length > 3) {
    return words.slice(0, 3).join(" ");
  }

  return cleaned || trimmed;
}

export class WikimediaProvider implements ImageSearchProvider {
  readonly name = "wikimedia";

  private async _fetchFromWikimedia(cleanQ: string, safeLimit: number): Promise<ImageSearchResult[]> {
    try {
      // generator=search with namespace 6 (File)
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        cleanQ
      )}&gsrnamespace=6&gsrlimit=${safeLimit}&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`;

      const resp = await fetch(url, {
        headers: {
          "User-Agent": "OpenIdearApp/1.0 (https://openidear.com; contact@openidear.com)",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!resp.ok) return [];

      const data = await resp.json();
      const pages = data?.query?.pages;
      if (!pages) return [];

      const results: ImageSearchResult[] = [];

      for (const key of Object.keys(pages)) {
        const page = pages[key];
        const info = page?.imageinfo?.[0];
        if (!info?.url) continue;

        // Skip non-image files (e.g. .ogg, .pdf, .djvu) - strip query parameters before checking extension
        const cleanPath = (info.url.split("?")[0] || "").toLowerCase();
        if (
          !cleanPath.endsWith(".jpg") &&
          !cleanPath.endsWith(".jpeg") &&
          !cleanPath.endsWith(".png") &&
          !cleanPath.endsWith(".webp") &&
          !cleanPath.endsWith(".svg")
        ) {
          continue;
        }

        const ext = info.extmetadata || {};
        const rawArtist = ext.Artist?.value || "";
        const cleanAuthor = rawArtist.replace(/<[^>]*>?/gm, "").trim() || "Wikimedia Commons Contributor";
        const license = ext.LicenseShortName?.value || "CC BY-SA";
        const description = (ext.ImageDescription?.value || "").replace(/<[^>]*>?/gm, "").trim();
        const title = page.title ? page.title.replace(/^File:/, "").replace(/\.[^/.]+$/, "") : cleanQ;

        results.push({
          id: `wiki_${page.pageid || Math.random().toString(36).substring(2, 9)}`,
          provider: "wikimedia",
          sourceProvider: "wikimedia",
          imageUrl: info.url,
          url: info.url,
          thumbnailUrl: info.thumburl || info.url,
          width: info.width || 1200,
          height: info.height || 800,
          title: title || cleanQ,
          alt: description || title || cleanQ,
          source: "stock",
          author: cleanAuthor,
          license: license,
          attributionUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || "")}`,
          sourceUrl: info.url,
          usageRestrictions: [
            "Creative Commons / Public Domain license",
            "Attribution required based on license",
            "ShareAlike conditions may apply to derivatives",
          ],
          tags: [cleanQ, "wikimedia"],
        });

        if (results.length >= safeLimit) break;
      }

      return results;
    } catch {
      return [];
    }
  }

  async searchImages(input: {
    query: string;
    page?: number;
    limit?: number;
    orientation?: ImageOrientation;
    userId?: string;
  }): Promise<ImageSearchResult[]> {
    const { query, limit = 12 } = input;
    if (!query || !query.trim()) return [];

    const cleanQ = query.trim();
    const safeLimit = Math.min(24, Math.max(1, limit));

    let results = await this._fetchFromWikimedia(cleanQ, safeLimit);

    // If initial query returned 0 results, retry with simplified/entity keywords
    if (results.length === 0) {
      const fallbackTerm = simplifySearchTerms(cleanQ);
      if (fallbackTerm.toLowerCase() !== cleanQ.toLowerCase()) {
        results = await this._fetchFromWikimedia(fallbackTerm, safeLimit);
      }
    }

    return results;
  }

  async search(options: ImageSearchOptions): Promise<ImageSearchResult[]> {
    return this.searchImages(options);
  }
}

export const wikimediaProvider = new WikimediaProvider();
