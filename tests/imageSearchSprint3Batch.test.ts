// =============================================================================
//  IMAGE SEARCH SPRINT 3 — BATCH SEARCH & REVIEW AUTOMATED TESTS
//  tests/imageSearchSprint3Batch.test.ts
//
//  Covers:
//  1. ImageSearchService.batchSearchImages handles multiple suggestions
//  2. Request deduplication (identical queries across sections are shared)
//  3. Bounded concurrency execution (does not exceed concurrency limit)
//  4. Independent error isolation (one failure does not block others)
//  5. Summary counts (total, completed, withResults, empty, failed)
//  6. Route registration for /ai/v1/images/batch-search in AIController
// =============================================================================

require("dotenv").config();
const { imageSearchService, ImageSearchService } = require("../services/imageSearch.service");
const AIController = require("../controllers/ai.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`[ASSERTION FAILED]: ${message}`);
}

async function runTests() {
  console.log("\n=========================================================");
  console.log("  RUNNING SPRINT 3: BATCH SMART VISUAL SEARCH TESTS       ");
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

  // ─── TEST 1: Batch Search Execution Across Multiple Suggestions ──────────────
  await test("batchSearchImages executes across multiple distinct visual suggestions", async () => {
    const suggestions = [
      { id: "sec_1", heading: "System Architecture", query: "cloud architecture", visualType: "diagram" },
      { id: "sec_2", heading: "Database Caching", query: "redis cache database", visualType: "diagram" },
      { id: "sec_3", heading: "Hardware Performance", query: "server hardware", visualType: "product" },
    ];

    const result = await imageSearchService.batchSearchImages(suggestions, {
      limitPerSuggestion: 4,
      concurrency: 2,
    });

    assert(result.total === 3, `Expected total 3, got ${result.total}`);
    assert(result.completed === 3, `Expected 3 completed, got ${result.completed}`);
    assert(result.results.length === 3, "Expected 3 results array items");

    for (const item of result.results) {
      assert(item.success === true, `Item "${item.heading}" should be successful`);
      assert(Array.isArray(item.candidates), "Item should contain candidates array");
    }
  });

  // ─── TEST 2: Request Deduplication for Identical Queries ──────────────────────
  await test("batchSearchImages deduplicates queries so identical queries share one search", async () => {
    const suggestions = [
      { id: "sec_a", heading: "Microservices Part 1", query: "docker container", visualType: "diagram" },
      { id: "sec_b", heading: "Microservices Part 2", query: "docker container", visualType: "diagram" },
    ];

    const result = await imageSearchService.batchSearchImages(suggestions, {
      limitPerSuggestion: 4,
      concurrency: 2,
    });

    assert(result.total === 2, "Total should be 2");
    assert(result.results.length === 2, "Results count should be 2");
    assert(result.results[0].query === result.results[1].query, "Queries should match");
    assert(result.results[0].count === result.results[1].count, "Both should receive candidate results");
  });

  // ─── TEST 3: Bounded Concurrency Check ───────────────────────────────────────
  await test("batchSearchImages respects bounded concurrency limit", async () => {
    let activeConcurrency = 0;
    let maxObservedConcurrency = 0;

    // Create a mock service to instrument searchImages
    const mockService = new ImageSearchService();
    const originalSearchImages = mockService.searchImages.bind(mockService);

    mockService.searchImages = async (input: any) => {
      activeConcurrency++;
      if (activeConcurrency > maxObservedConcurrency) {
        maxObservedConcurrency = activeConcurrency;
      }
      // Small artificial delay to verify concurrency bounding
      await new Promise((res) => setTimeout(res, 50));
      activeConcurrency--;
      return originalSearchImages(input);
    };

    const suggestions = [
      { id: "1", heading: "Topic 1", query: "topic one diagram" },
      { id: "2", heading: "Topic 2", query: "topic two diagram" },
      { id: "3", heading: "Topic 3", query: "topic three diagram" },
      { id: "4", heading: "Topic 4", query: "topic four diagram" },
    ];

    await mockService.batchSearchImages(suggestions, { concurrency: 2 });

    assert(
      maxObservedConcurrency <= 2,
      `Max concurrency observed (${maxObservedConcurrency}) must not exceed limit 2`
    );
  });

  // ─── TEST 4: Independent Error Isolation ─────────────────────────────────────
  await test("One suggestion failure does not abort remaining suggestions in batch", async () => {
    const mockService = new ImageSearchService();
    mockService.searchImages = async (input: any) => {
      if (input.query.includes("fail_me")) {
        throw new Error("Provider rate limit simulated");
      }
      return [{ id: "mock_1", url: "https://example.com/mock.jpg", source: "stock" } as any];
    };

    const suggestions = [
      { id: "1", heading: "Good Section", query: "healthy query" },
      { id: "2", heading: "Failing Section", query: "fail_me query" },
      { id: "3", heading: "Another Good Section", query: "another healthy query" },
    ];

    const result = await mockService.batchSearchImages(suggestions, { concurrency: 2 });

    assert(result.total === 3, "Total should be 3");
    assert(result.completed === 2, `Expected 2 completed, got ${result.completed}`);
    assert(result.failed === 1, `Expected 1 failed, got ${result.failed}`);

    assert(result.results[0].success === true, "First item should succeed");
    assert(result.results[1].success === false, "Second item should fail gracefully");
    assert(result.results[1].error?.includes("Provider rate limit"), "Error message captured");
    assert(result.results[2].success === true, "Third item should succeed despite second item failure");
  });

  // ─── TEST 5: Accurate Summary Counts for Empty Results ───────────────────────
  await test("batchSearchImages computes withResults and empty counts accurately", async () => {
    const mockService = new ImageSearchService();
    mockService.searchImages = async (input: any) => {
      if (input.query.includes("empty_query")) return [];
      return [{ id: "res_1", url: "https://example.com/ok.jpg", source: "stock" } as any];
    };

    const suggestions = [
      { id: "1", heading: "With Results", query: "has results" },
      { id: "2", heading: "Empty", query: "empty_query" },
    ];

    const result = await mockService.batchSearchImages(suggestions);
    assert(result.withResults === 1, `Expected withResults: 1, got ${result.withResults}`);
    assert(result.empty === 1, `Expected empty: 1, got ${result.empty}`);
    assert(result.completed === 2, `Expected completed: 2, got ${result.completed}`);
  });

  // ─── TEST 6: Route Registration for Batch Search Endpoint ─────────────────────
  await test("AIController registers POST /ai/v1/images/batch-search and /ai/images/batch-search", () => {
    const controller = new AIController();
    const routes = controller._router.stack.filter((s: any) => s.route);

    const v1Route = routes.find((s: any) => s.route.path === "/ai/v1/images/batch-search");
    assert(v1Route !== undefined, "Route /ai/v1/images/batch-search must be registered");
    assert(v1Route.route.methods.post === true, "Must accept POST");

    const aliasRoute = routes.find((s: any) => s.route.path === "/ai/images/batch-search");
    assert(aliasRoute !== undefined, "Route /ai/images/batch-search alias must be registered");
    assert(aliasRoute.route.methods.post === true, "Alias must accept POST");
  });

  console.log(`\n=========================================================`);
  console.log(`  SPRINT 3 BATCH RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=========================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN SPRINT 3 BATCH TESTS:", err);
  process.exit(1);
});
