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
  ImageSearchOptions,
  NormalizedImageResult,
} from "./imageSearchProvider.interface";

export class WikimediaProvider implements ImageSearchProvider {
  readonly name = "wikimedia";

  async search(options: ImageSearchOptions): Promise<NormalizedImageResult[]> {
    const { query, limit = 12 } = options;
    if (!query || !query.trim()) return [];

    try {
      const cleanQ = query.trim();
      const safeLimit = Math.min(24, Math.max(1, limit));
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

      const results: NormalizedImageResult[] = [];

      for (const key of Object.keys(pages)) {
        const page = pages[key];
        const info = page?.imageinfo?.[0];
        if (!info?.url) continue;

        // Skip non-image files (e.g. .ogg, .pdf, .djvu)
        const lowerUrl = info.url.toLowerCase();
        if (
          !lowerUrl.endsWith(".jpg") &&
          !lowerUrl.endsWith(".jpeg") &&
          !lowerUrl.endsWith(".png") &&
          !lowerUrl.endsWith(".webp") &&
          !lowerUrl.endsWith(".svg")
        ) {
          continue;
        }

        const ext = info.extmetadata || {};
        const rawArtist = ext.Artist?.value || "";
        // strip HTML tags from artist/credit
        const cleanAuthor = rawArtist.replace(/<[^>]*>?/gm, "").trim() || "Wikimedia Commons Contributor";
        const license = ext.LicenseShortName?.value || "CC BY-SA";
        const description = (ext.ImageDescription?.value || "").replace(/<[^>]*>?/gm, "").trim();
        const title = page.title ? page.title.replace(/^File:/, "").replace(/\.[^/.]+$/, "") : cleanQ;

        results.push({
          id: `wiki_${page.pageid || Math.random().toString(36).substring(2, 9)}`,
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
          sourceProvider: "wikimedia",
          sourceUrl: info.url,
          tags: [cleanQ, "wikimedia"],
        });

        if (results.length >= safeLimit) break;
      }

      return results;
    } catch {
      // Graceful fallback if offline or timeout
      return [];
    }
  }
}

export const wikimediaProvider = new WikimediaProvider();
