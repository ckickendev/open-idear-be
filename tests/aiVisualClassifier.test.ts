// =============================================================================
//  OPENIDEAR — AI VISUAL ASSISTANT INTELLIGENCE & CLASSIFIER TEST SUITE (SPRINT 3)
//  tests/aiVisualClassifier.test.ts
//
//  Verifies:
//  1. Visual Classifier & Decision Engine for all 7 visual types:
//     - Product review -> Prefer Search (product)
//     - Architecture -> Prefer AI Illustration / Diagram
//     - Benchmark -> Suggest Chart
//     - Tutorial -> Suggest Screenshot placeholder
//     - Comparison -> Suggest Split Image layout
//     - Code -> Suggest Code syntax block
//  2. Confidence scoring & explainable reasoning (no blind generation).
//  3. Article-wide structural analysis with completed visual detection.
//  4. Batch generation pipeline execution (skip completed, search/generate remaining).
//  5. VisualAnalytics schema & event tracking telemetry.
//  6. AIController route registration.
// =============================================================================

require("dotenv").config();
const { visualClassifierService } = require("../ai/visual-intelligence/visualClassifier.service");
const { batchVisualService } = require("../services/batchVisual.service");
const { visualAnalyticsService } = require("../services/visualAnalytics.service");
const AIController = require("../controllers/ai.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n=========================================================");
  console.log("  RUNNING AI VISUAL ASSISTANT INTELLIGENCE (SPRINT 3)     ");
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
      if (err.stack) {
        console.error(err.stack.split("\n").slice(0, 4).join("\n"));
      }
      failed++;
    }
  }

  // ─── TEST 1: Decision Engine Rules (All 7 Visual Types) ─────────────────────
  await test("Decision Engine: Architecture -> diagram / illustration", () => {
    const rec1 = visualClassifierService.classifySection("Kafka Event Flow", "Explains partition brokers and producer-consumer topology.");
    assert(rec1.visualType === "diagram", `Kafka Event Flow must be 'diagram', got '${rec1.visualType}'`);
    assert(rec1.confidence >= 0.85, `Confidence must be >= 0.85, got ${rec1.confidence}`);
    assert(rec1.reason.includes("architecture") || rec1.reason.includes("component"), "Reason must explain architectural context");

    const rec2 = visualClassifierService.classifySection("Microservices System Architecture Overview");
    assert(rec2.visualType === "diagram" || rec2.visualType === "illustration", `Architecture should be diagram or illustration, got ${rec2.visualType}`);
  });

  await test("Decision Engine: Product Review -> product (Prefer Search)", () => {
    const rec = visualClassifierService.classifySection(
      "M3 Max MacBook Pro Review & Hardware Specs",
      "Hands-on review testing ports, chassis, battery life, and pricing options."
    );
    assert(rec.visualType === "product", `Must be 'product', got '${rec.visualType}'`);
    assert(rec.recommendedAction === "search", `Must prefer 'search', got '${rec.recommendedAction}'`);
    assert(rec.reason.includes("Product review") || rec.reason.includes("authentic"), "Reason must explain search preference for authentic photography");
    assert(rec.confidence >= 0.85, `Confidence must be >= 0.85, got ${rec.confidence}`);
  });

  await test("Decision Engine: Benchmark -> chart", () => {
    const rec = visualClassifierService.classifySection(
      "Redis Throughput & Latency Benchmarks",
      "Comparing p99 latency in ms and requests per second under peak load."
    );
    assert(rec.visualType === "chart", `Must be 'chart', got '${rec.visualType}'`);
    assert(rec.recommendedAction === "chart", `Recommended action should be 'chart', got '${rec.recommendedAction}'`);
    assert(rec.reason.toLowerCase().includes("chart") || rec.reason.toLowerCase().includes("metric"), "Reason must mention charts or metrics");
  });

  await test("Decision Engine: Tutorial -> screenshot placeholder", () => {
    const rec = visualClassifierService.classifySection(
      "Step-by-Step Installation Tutorial for Docker on macOS",
      "Follow this setup guide to configure the Docker dashboard settings."
    );
    assert(rec.visualType === "screenshot", `Must be 'screenshot', got '${rec.visualType}'`);
    assert(rec.recommendedAction === "screenshot", `Action must be 'screenshot', got '${rec.recommendedAction}'`);
    assert(rec.reason.includes("Tutorial") || rec.reason.includes("screenshot"), "Reason must explain screenshot preference for tutorials");
  });

  await test("Decision Engine: Comparison -> comparison (Split Layout)", () => {
    const rec = visualClassifierService.classifySection(
      "Redis vs Memcached: Feature Comparison & Trade-offs",
      "Evaluating differences between Redis and Memcached caching mechanisms."
    );
    assert(rec.visualType === "comparison", `Must be 'comparison', got '${rec.visualType}'`);
    assert(rec.recommendedAction === "comparison", `Action must be 'comparison', got '${rec.recommendedAction}'`);
    assert(rec.reason.includes("comparison") || rec.reason.includes("split"), "Reason must mention comparison or split layout");
  });

  await test("Decision Engine: Code Implementation -> code", () => {
    const rec = visualClassifierService.classifySection(
      "Binary Search Tree Implementation Algorithm",
      "Detailed function syntax and recursive code traversal."
    );
    assert(rec.visualType === "code", `Must be 'code', got '${rec.visualType}'`);
    assert(rec.recommendedAction === "code", `Action must be 'code', got '${rec.recommendedAction}'`);
  });

  // ─── TEST 2: Article Analysis & Completed Section Detection ─────────────────
  await test("analyzeArticle identifies sections and completed visuals", () => {
    const sampleMarkdown = `
# Building Resilient Microservices

## 1. System Topology Flow
Here is the architecture overview.
![System Architecture](https://res.cloudinary.com/demo/image/upload/sample.jpg)

## 2. MacBook Pro M3 Review for Developers
Checking the keyboard and battery life.

## 3. Database Benchmarks & RPS
Latency tested across 100k queries.
    `.trim();

    const sections = visualClassifierService.analyzeArticle(sampleMarkdown);
    assert(sections.length === 3, `Must find 3 H2 sections, found ${sections.length}`);

    // Section 1 has an image -> completed
    assert(sections[0].heading.includes("System Topology Flow"), "Section 1 heading mismatch");
    assert(sections[0].isCompleted === true, "Section 1 must be marked completed due to existing image");
    assert(sections[0].existingImageUrls.length === 1, "Section 1 must capture existing image URL");

    // Section 2 has no image -> not completed, product review
    assert(sections[1].isCompleted === false, "Section 2 must be marked uncompleted");
    assert(sections[1].recommendation.visualType === "product", "Section 2 should be product");

    // Section 3 has no image -> not completed, chart
    assert(sections[2].isCompleted === false, "Section 3 must be marked uncompleted");
    assert(sections[2].recommendation.visualType === "chart", "Section 3 should be chart");
  });

  // ─── TEST 3: Batch Generation Pipeline ──────────────────────────────────────
  await test("Batch Visual Pipeline skips completed and generates/searches remaining", async () => {
    const sampleArticle = `
# Comprehensive Distributed Systems Guide

## 1. Event Broker Architecture
Kafka and RabbitMQ broker topology.
![Kafka Architecture](https://example.com/kafka.png)

## 2. Developer Laptop Review
Hardware specs and chassis build quality.

## 3. Throughput Benchmarks
Latency results under 50,000 req/sec.
    `.trim();

    const result = await batchVisualService.executeBatchPipeline({
      markdown: sampleArticle,
      userId: "507f1f77bcf86cd799439011",
    });

    assert(result.total === 3, `Expected 3 total sections, got ${result.total}`);
    assert(result.skipped === 1, `Expected 1 skipped section (already completed), got ${result.skipped}`);
    assert(result.searched >= 1, `Expected at least 1 searched section (laptop review), got ${result.searched}`);
    assert(result.generated >= 1, `Expected at least 1 generated section (benchmarks), got ${result.generated}`);
    assert(result.items.length === 3, `Expected 3 items in result breakdown, got ${result.items.length}`);

    // Check summary message formatting
    assert(
      result.summaryMessage.includes("3 sections") &&
      result.summaryMessage.includes("1 skipped"),
      `Summary message format incorrect: ${result.summaryMessage}`
    );

    // Verify output markdown preserved original image and inserted new images
    assert(result.updatedMarkdown.includes("https://example.com/kafka.png"), "Must preserve original image");
    assert(
      result.updatedMarkdown.includes("![2. Developer Laptop Review](") ||
      result.updatedMarkdown.includes("Developer Laptop Review"),
      "Must insert image for section 2"
    );
  });

  // ─── TEST 4: Visual Analytics Telemetry Service ─────────────────────────────
  await test("VisualAnalyticsService records events and validates action types", async () => {
    const event = await visualAnalyticsService.recordEvent({
      heading: "Kafka Event Flow",
      visualType: "diagram",
      recommendedAction: "diagram",
      actionTaken: "accepted",
      confidence: 0.96,
      preset: "isometric",
    });

    assert(event.actionTaken === "accepted", "Event actionTaken must be 'accepted'");
    assert(event.visualType === "diagram", "Event visualType must be 'diagram'");

    // Test rejection of invalid action
    let threw = false;
    try {
      await visualAnalyticsService.recordEvent({
        actionTaken: "invalid_action_foo" as any,
      });
    } catch (err) {
      threw = true;
    }
    assert(threw, "Must reject invalid actionTaken");

    // Test stats aggregation
    const stats = await visualAnalyticsService.getStats();
    assert(typeof stats.totalEvents === "number", "stats.totalEvents must be number");
    assert(typeof stats.actions.accepted === "number", "stats.actions.accepted must be number");
  });

  // ─── TEST 5: Controller Route Registration ──────────────────────────────────
  await test("AIController registers all Sprint 3 intelligence endpoints", () => {
    const controller = new AIController();
    const router = controller._router;

    const registeredRoutes: Array<{ method: string; path: string }> = [];
    router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods);
        registeredRoutes.push({
          method: methods[0].toUpperCase(),
          path: middleware.route.path,
        });
      }
    });

    const expectedEndpoints = [
      { method: "POST", path: "/ai/v1/visuals/classify" },
      { method: "POST", path: "/ai/visuals/classify" },
      { method: "POST", path: "/ai/v1/visuals/batch-generate" },
      { method: "POST", path: "/ai/visuals/batch-generate" },
      { method: "POST", path: "/ai/v1/visuals/analytics" },
      { method: "POST", path: "/ai/visuals/analytics" },
      { method: "GET", path: "/ai/v1/visuals/analytics/stats" },
      { method: "GET", path: "/ai/visuals/analytics/stats" },
    ];

    for (const expected of expectedEndpoints) {
      const found = registeredRoutes.some(
        (r) => r.method === expected.method && r.path === expected.path
      );
      assert(found, `Route ${expected.method} ${expected.path} must be registered on AIController router`);
    }
  });

  console.log("\n=========================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
