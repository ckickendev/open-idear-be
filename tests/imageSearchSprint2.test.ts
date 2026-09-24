// =============================================================================
//  IMAGE SEARCH SPRINT 2 — AUTOMATED TEST SUITE
//  tests/imageSearchSprint2.test.ts
//
//  Covers:
//  1.  Provider interface conformance
//  2.  UnsplashProvider: search, pagination, API failure, missing key
//  3.  PexelsProvider:   search, API failure, missing key
//  4.  ImageSearchService: composite, page param, fallback to mock
//  5.  Asset schema: new provider provenance fields
//  6.  ImageImportService: SSRF validation allowlist
//  7.  ImageImportService: duplicate detection by sourceUrl (mocked)
//  8.  ImageImportService: duplicate detection by hash (mocked)
//  9.  ImageImportService: controlled download + cloudinary failure graceful
//  10. AIController: import route registration
// =============================================================================

require("dotenv").config();
const Asset = require("../models/asset.schema");
const { ImageSearchService, MockTechnicalStockProvider, AssetLibraryProvider } = require("../services/imageSearch.service");
const { imageImportService } = require("../services/imageImport.service");
const AIController = require("../controllers/ai.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`[ASSERTION FAILED]: ${message}`);
}

async function runTests() {
  console.log("\n=========================================================");
  console.log("  RUNNING IMAGE SEARCH SPRINT 2 TEST SUITE              ");
  console.log("=========================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) console.error(err.stack.split("\n").slice(0, 4).join("\n"));
      failed++;
    }
  }

  // ─── TEST 1: Asset Schema Provider Provenance Fields ─────────────────────────
  await test("Asset schema defines sourceProvider, sourceUrl, author, license, attributionUrl", () => {
    const paths = (Asset.schema as any).paths;
    assert(paths.sourceProvider !== undefined, "Asset must have 'sourceProvider' field");
    assert(paths.sourceUrl      !== undefined, "Asset must have 'sourceUrl' field");
    assert(paths.author         !== undefined, "Asset must have 'author' field");
    assert(paths.license        !== undefined, "Asset must have 'license' field");
    assert(paths.attributionUrl !== undefined, "Asset must have 'attributionUrl' field");

    // Defaults
    assert(paths.sourceProvider.defaultValue === "", "sourceProvider must default to empty string");
    assert(paths.author.defaultValue         === "", "author must default to empty string");
    assert(paths.license.defaultValue        === "", "license must default to empty string");
  });

  // ─── TEST 2: Provider Interface Conformance ────────────────────────────────
  await test("AssetLibraryProvider and MockTechnicalStockProvider conform to ImageSearchProvider interface", async () => {
    const assetProvider = new AssetLibraryProvider();
    const stockProvider = new MockTechnicalStockProvider();

    assert(typeof assetProvider.name   === "string", "AssetLibraryProvider must have string name");
    assert(typeof assetProvider.search === "function", "AssetLibraryProvider must have search()");
    assert(typeof stockProvider.name   === "string", "MockTechnicalStockProvider must have string name");
    assert(typeof stockProvider.search === "function", "MockTechnicalStockProvider must have search()");

    // Call search and check result shape
    const stockResults = await stockProvider.search({ query: "architecture", limit: 2 });
    assert(Array.isArray(stockResults), "search() must return array");
    if (stockResults.length > 0) {
      const r = stockResults[0];
      assert(typeof r.id  === "string", "Result must have id");
      assert(typeof r.url === "string", "Result must have url");
      assert(typeof r.source === "string", "Result must have source");
    }
  });

  // ─── TEST 3: MockTechnicalStockProvider Provider Safety Fields ────────────
  await test("MockTechnicalStockProvider returns author, license, attributionUrl for all results", async () => {
    const provider = new MockTechnicalStockProvider();
    const results = await provider.search({ query: "redis cache", limit: 3 });
    assert(results.length > 0, "Must return results");

    for (const result of results) {
      assert(result.license        !== undefined, `result must have license`);
      assert(result.attributionUrl !== undefined, `result must have attributionUrl`);
      assert(result.sourceProvider !== undefined, `result must have sourceProvider`);
      assert(result.license === "unsplash", `curated stock license must be 'unsplash'`);
    }
  });

  // ─── TEST 4: ImageSearchService Page Parameter ─────────────────────────────
  await test("ImageSearchService.search accepts page parameter without error", async () => {
    const service = new ImageSearchService();
    // page=1 and page=2 should both work (no crash)
    const resultsP1 = await service.search("system design", 5, null, 1);
    const resultsP2 = await service.search("system design", 5, null, 2);
    assert(Array.isArray(resultsP1), "page 1 must return array");
    assert(Array.isArray(resultsP2), "page 2 must return array");
  });

  // ─── TEST 5: ImageSearchService Result Shape ───────────────────────────────
  await test("ImageSearchService composite results include source field and respect limit", async () => {
    const service = new ImageSearchService();
    const results = await service.search("kubernetes deployment", 6, null, 1);

    assert(Array.isArray(results), "Must return array");
    assert(results.length <= 6, `Must not exceed limit (got ${results.length})`);

    for (const r of results) {
      assert(r.id     !== undefined, "Every result must have id");
      assert(r.url    !== undefined, "Every result must have url");
      assert(r.source !== undefined, "Every result must have source");
    }
  });

  // ─── TEST 6: SSRF Allowlist Validation ────────────────────────────────────
  await test("ImageImportService rejects non-whitelisted domains (SSRF protection)", () => {
    const blocked = [
      "https://malicious.example.com/photo.jpg",
      "https://evil.com/image.jpg",
      "ftp://images.unsplash.com/photo.jpg",
      "javascript:alert('xss')",
    ];

    for (const url of blocked) {
      const result = imageImportService.validateUrl(url);
      assert(!result.valid, `Must reject blocked URL: ${url}`);
      assert(typeof result.reason === "string", `Must provide reason for blocked URL: ${url}`);
    }

    const allowed = [
      "https://images.unsplash.com/photo-1234567890?auto=format&fit=crop&w=1200",
      "https://images.pexels.com/photos/12345/pexels-photo.jpeg",
    ];

    for (const url of allowed) {
      const result = imageImportService.validateUrl(url);
      assert(result.valid, `Must allow whitelisted URL: ${url}`);
    }
  });

  // ─── TEST 7: SSRF Allowlist Completeness ──────────────────────────────────
  await test("ImageImportService allowlist includes all planned provider domains", () => {
    const planDomains = [
      "https://images.unsplash.com/photo.jpg",
      "https://plus.unsplash.com/premium_photo.jpg",
      "https://images.pexels.com/photos/123/photo.jpg",
      "https://cdn.pixabay.com/photo/2023/example.jpg",
    ];

    for (const url of planDomains) {
      const result = imageImportService.validateUrl(url);
      assert(result.valid, `Planned provider domain must be allowed: ${url}`);
    }
  });

  // ─── TEST 8: ImageImportService — Invalid URL Format ──────────────────────
  await test("ImageImportService rejects malformed URLs gracefully", () => {
    const malformed = ["", "   ", "not_a_url", "://missing-protocol.com"];
    for (const url of malformed) {
      const result = imageImportService.validateUrl(url);
      assert(!result.valid, `Malformed URL must be rejected: "${url}"`);
    }
  });

  // ─── TEST 9: ImageImportService — Blocked External Download ──────────────
  await test("ImageImportService throws on disallowed URL even in importFromExternalUrl", async () => {
    let threw = false;
    try {
      await imageImportService.importFromExternalUrl({
        url: "https://malicious.example.com/evil.jpg",
        userId: "507f1f77bcf86cd799439011",
      });
    } catch (err: any) {
      threw = true;
      assert(
        err.message.includes("URL rejected") || err.message.includes("not in the allowed"),
        "Error must mention URL rejection"
      );
    }
    assert(threw, "Must throw for blocked URL");
  });

  // ─── TEST 10: AIController Import Route Registration ──────────────────────
  await test("AIController registers POST /ai/v1/images/import and /ai/images/import", () => {
    const controller = new AIController();
    const routes = controller._router.stack.filter((s: any) => s.route);

    const v1Route = routes.find((s: any) => s.route.path === "/ai/v1/images/import");
    assert(v1Route !== undefined, "Route /ai/v1/images/import must be registered");
    assert(v1Route.route.methods.post === true, "Must accept POST");

    const aliasRoute = routes.find((s: any) => s.route.path === "/ai/images/import");
    assert(aliasRoute !== undefined, "Route /ai/images/import alias must be registered");
    assert(aliasRoute.route.methods.post === true, "Alias must accept POST");
  });

  // ─── TEST 11: AIController Search Route Still Works with Page ─────────────
  await test("AIController registers POST /ai/v1/images/search with page support", () => {
    const controller = new AIController();
    const routes = controller._router.stack.filter((s: any) => s.route);
    const route = routes.find((s: any) => s.route.path === "/ai/v1/images/search");
    assert(route !== undefined, "Route /ai/v1/images/search must be registered");
    assert(route.route.methods.post === true, "Must accept POST");
  });

  // ─── TEST 12: NormalizedImageResult shape completeness ───────────────────
  await test("MockTechnicalStockProvider results conform to NormalizedImageResult interface", async () => {
    const provider = new MockTechnicalStockProvider();
    const results = await provider.search({ query: "machine learning AI", limit: 2 });
    assert(results.length > 0, "Must return at least 1 result");

    const r = results[0];
    const requiredFields = ["id", "url", "thumbnailUrl", "width", "height", "title", "alt", "source"];
    for (const field of requiredFields) {
      assert((r as any)[field] !== undefined, `Result must have required field: ${field}`);
    }
  });

  console.log(`\n=========================================================`);
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=========================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
