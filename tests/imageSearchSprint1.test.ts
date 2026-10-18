// =============================================================================
//  SMART VISUAL SEARCH — SPRINT 1 AUTOMATED TEST SUITE
//  tests/imageSearchSprint1.test.ts
//
//  Tests:
//  1. Provider result normalization (all required fields present)
//  2. Invalid search input (empty query, invalid orientation, non-string)
//  3. Empty results (graceful empty array handling)
//  4. Provider timeout and failure (resilience, no unhandled rejection)
//  5. Missing API credentials (graceful fallback without crashing)
//  6. Authentication and rate limiting (AuthMiddleware & mediaSearchLimiter)
//  7. Pagination and result limits (page support, limit clamped to 30)
//  8. Search query construction (RTX 4060 photography, Redis cache architecture)
//  9. Existing AI image generation compatibility (intact workflows)
// =============================================================================

require("dotenv").config();
const { UnsplashProvider } = require("../services/imageSearch/unsplash.provider");
const { MockTechnicalStockProvider, ImageSearchService } = require("../services/imageSearch.service");
const { buildSearchQuery, cleanSectionHeading, cleanSearchText } = require("../services/imageSearch/searchQueryBuilder");
const AIController = require("../controllers/ai.controller");
const { imageGenerationService } = require("../services/imageGeneration.service");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`[ASSERTION FAILED]: ${message}`);
}

async function runSprint1Tests() {
  console.log("\n=========================================================");
  console.log("  RUNNING SPRINT 1: IMAGE SEARCH FOUNDATION TEST SUITE   ");
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

  // ─── TEST 1: Provider Result Normalization ────────────────────────────────
  await test("Provider results normalize to ImageSearchResult contract with all required fields", async () => {
    const provider = new MockTechnicalStockProvider();
    const results = await provider.searchImages({ query: "cloud architecture", limit: 3 });

    assert(Array.isArray(results), "Results must be an array");
    assert(results.length > 0, "Must return mock technical stock results");

    for (const item of results) {
      assert(typeof item.id === "string" && item.id.length > 0, "Item must have id");
      assert(typeof item.provider === "string" && item.provider.length > 0, "Item must have provider");
      assert(typeof item.imageUrl === "string" && item.imageUrl.startsWith("http"), "Item must have valid imageUrl");
      assert(typeof item.url === "string", "Item must have backward-compatible url alias");
      assert(typeof item.thumbnailUrl === "string", "Item must have thumbnailUrl");
      assert(typeof item.width === "number" && item.width > 0, "Item must have positive width");
      assert(typeof item.height === "number" && item.height > 0, "Item must have positive height");
      assert(typeof item.author === "string", "Item must have author");
      assert(typeof item.sourceUrl === "string", "Item must have sourceUrl");
      assert(typeof item.license === "string", "Item must have license");
      assert(typeof item.attributionUrl === "string", "Item must have attributionUrl");
      assert(Array.isArray(item.usageRestrictions) && item.usageRestrictions.length > 0, "Item must have usageRestrictions array");
    }
  });

  // ─── TEST 2: Invalid Search Input Handling ─────────────────────────────────
  await test("searchImages endpoint rejects empty queries and invalid orientations with 400", async () => {
    const controller = new AIController();

    // Mock Express Request & Response for empty query
    let statusSent = 0;
    let jsonSent: any = null;

    const mockReqEmpty: any = {
      body: { query: "   " },
      userInfo: { _id: "user_test_123" },
    };

    await new Promise<void>((resolve, reject) => {
      const mockResEmpty: any = {
        status(code: number) {
          statusSent = code;
          return this;
        },
        json(data: any) {
          jsonSent = data;
          resolve();
          return this;
        },
      };
      controller.searchImages(mockReqEmpty, mockResEmpty, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    assert(statusSent === 400, `Expected 400 for empty query, got ${statusSent}`);
    assert(Boolean(jsonSent?.error), "Response must contain error property");

    // Test invalid orientation
    const mockReqBadOrientation: any = {
      body: { query: "nvidia", orientation: "diagonal" },
      userInfo: { _id: "user_test_123" },
    };

    await new Promise<void>((resolve, reject) => {
      const mockRes: any = {
        status(code: number) {
          statusSent = code;
          return this;
        },
        json(data: any) {
          jsonSent = data;
          resolve();
          return this;
        },
      };
      controller.searchImages(mockReqBadOrientation, mockRes, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    assert(statusSent === 400, `Expected 400 for invalid orientation, got ${statusSent}`);
    assert(jsonSent?.error.includes("orientation"), "Error message must mention orientation");
  });

  // ─── TEST 3: Empty Results Graceful Handling ───────────────────────────────
  await test("Empty search results return a success status with empty data array without throwing", async () => {
    const controller = new AIController();
    let statusSent = 200;
    let jsonSent: any = null;

    const mockReq: any = {
      body: { query: "xyznonexistentquery9876543210" },
      userInfo: { _id: "user_test_123" },
    };

    await new Promise<void>((resolve, reject) => {
      const mockRes: any = {
        status(code: number) {
          statusSent = code;
          return this;
        },
        json(data: any) {
          jsonSent = data;
          resolve();
          return this;
        },
      };
      controller.searchImages(mockReq, mockRes, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    assert(statusSent === 200, `Expected status 200, got ${statusSent}`);
    assert(jsonSent?.status === "success", "Response status must be 'success'");
    assert(Array.isArray(jsonSent?.data), "data must be an array");
    assert(jsonSent?.data.length === 0, "data must be empty for nonexistent query");
    assert(jsonSent?.total === 0, "total must be 0");
  });

  // ─── TEST 4: Provider Timeout and Failure Resilience ───────────────────────
  await test("UnsplashProvider handles network/timeout failure gracefully without unhandled rejection", async () => {
    const provider = new UnsplashProvider();

    const originalFetch = global.fetch;
    try {
      global.fetch = (async () => {
        const err: any = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      }) as any;

      const oldKey = process.env.UNSPLASH_ACCESS_KEY;
      process.env.UNSPLASH_ACCESS_KEY = "dummy_key_for_test";

      const results = await provider.searchImages({ query: "server infrastructure" });
      assert(Array.isArray(results), "Should return array on timeout");
      assert(results.length === 0, "Should return empty array on timeout");

      process.env.UNSPLASH_ACCESS_KEY = oldKey;
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ─── TEST 5: Missing API Credentials Handling ─────────────────────────────
  await test("UnsplashProvider returns empty array when UNSPLASH_ACCESS_KEY is missing without throwing", async () => {
    const provider = new UnsplashProvider();
    const oldKey = process.env.UNSPLASH_ACCESS_KEY;
    delete process.env.UNSPLASH_ACCESS_KEY;

    try {
      const results = await provider.searchImages({ query: "redis cache", limit: 5 });
      assert(Array.isArray(results), "Must return array when key is missing");
      assert(results.length === 0, "Must return empty array when key is missing");
    } finally {
      process.env.UNSPLASH_ACCESS_KEY = oldKey;
    }
  });

  // ─── TEST 6: Authentication and Rate Limiting ─────────────────────────────
  await test("AIController registers mediaSearchLimiter and AuthMiddleware on search endpoints", () => {
    const controller = new AIController();
    const stack = (controller._router as any).stack;

    // Look for routes: POST /ai/v1/images/search and /ai/images/search
    const searchLayers = stack.filter((layer: any) => {
      const path = layer.route?.path;
      return path === "/ai/v1/images/search" || path === "/ai/images/search";
    });

    assert(searchLayers.length >= 2, "Both search endpoints must be registered");

    for (const layer of searchLayers) {
      assert(layer.route.methods.post === true, "Route method must be POST");
      // Check that multiple middleware handlers exist (Auth + RateLimiter + Controller)
      assert(layer.route.stack.length >= 3, "Route must have AuthMiddleware, mediaSearchLimiter, and handler");
    }
  });

  // ─── TEST 7: Pagination and Result Limits ─────────────────────────────────
  await test("Pagination parameters are respected and limit is capped at 30", async () => {
    const service = new ImageSearchService();

    // Limit above 30 should be clamped to 30
    const clampedResults = await service.searchImages({ query: "architecture", limit: 100, page: 2 });
    assert(clampedResults.length <= 30, `Limit must be clamped <= 30, got ${clampedResults.length}`);

    // Limit <= 0 should be normalized to at least 1
    const minResults = await service.searchImages({ query: "architecture", limit: 0, page: -1 });
    assert(Array.isArray(minResults), "Must handle negative/zero gracefully");
  });

  // ─── TEST 8: Search Query Construction ───────────────────────────────────
  await test("Deterministic query builder synthesizes accurate queries from visual suggestions", () => {
    // Example 1: Hardware product review
    const gpuQuery = buildSearchQuery({
      articleTitle: "RTX 3060 vs RTX 4060",
      heading: "RTX 4060 physical design",
      visualType: "product",
    });
    assert(
      gpuQuery === "NVIDIA GeForce RTX 4060 graphics card product photography",
      `Expected NVIDIA GeForce RTX 4060 product photography, got: "${gpuQuery}"`
    );

    // Example 2: Architecture diagram
    const redisQuery = buildSearchQuery({
      articleTitle: "How Redis caching works",
      heading: "Architecture Overview",
      visualType: "diagram",
    });
    assert(
      redisQuery === "Redis cache architecture application database diagram",
      `Expected Redis cache architecture diagram, got: "${redisQuery}"`
    );

    // Prioritizes existing specific searchQuery if available
    const existingQuery = buildSearchQuery({
      articleTitle: "Custom Title",
      searchQuery: "PostgreSQL B-Tree Index Visualization",
    });
    assert(
      existingQuery === "PostgreSQL B-Tree Index Visualization",
      `Expected existing searchQuery to be preserved, got: "${existingQuery}"`
    );

    // Cleans editorial noise from headings
    assert(cleanSectionHeading("1.2: RTX 4060 Overview") === "RTX 4060 Overview", "Should clean leading numbers");
    assert(cleanSectionHeading("Phần 3: Benchmark Test") === "Benchmark Test", "Should clean section prefixes");
  });

  // ─── TEST 9: Existing AI Image Generation Compatibility ──────────────────
  await test("Existing AI Image Generation orchestrator and services remain untouched and intact", async () => {
    assert(typeof imageGenerationService.generateTechnicalIllustration === "function", "generateTechnicalIllustration must exist");
    assert(typeof imageGenerationService.calculatePromptSimilarity === "function", "calculatePromptSimilarity must exist");
    assert(typeof imageGenerationService.findFuzzyDuplicate === "function", "findFuzzyDuplicate must exist");

    const controller = new AIController();
    const stack = (controller._router as any).stack;

    const generateLayers = stack.filter((layer: any) => {
      const path = layer.route?.path;
      return path === "/ai/v1/images/generate" || path === "/ai/images/generate";
    });

    assert(generateLayers.length >= 2, "AI image generation routes must remain registered and active");
  });

  console.log("\n=========================================================");
  console.log(`  SPRINT 1 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSprint1Tests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
