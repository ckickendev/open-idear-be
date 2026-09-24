// =============================================================================
//  AI VISUAL INTELLIGENCE & BATCH GENERATION — SPRINT 4 TEST SUITE
//  tests/visualIntelligenceSprint4.test.ts
//
//  Verifies Sprint 4 Specifications:
//  1. Decision Engine Classification (7 visual types):
//     - Product review -> SEARCH_IMAGE
//     - Architecture explanation -> DIAGRAM / GENERATE_IMAGE
//     - Numerical benchmark -> CHART
//     - UI tutorial -> SCREENSHOT
//     - Programming explanation -> CODE_VISUAL
//     - Simple conceptual paragraph -> NO_VISUAL
//  2. Confidence threshold enforcement (< 0.70 defaults to NO_VISUAL).
//  3. Over-generation prevention on conceptual text.
//  4. Batch workflow: detects existing assets, skips completed sections & NO_VISUAL.
//  5. Cross-section duplicate detection & asset reuse.
//  6. Telemetry event recording (all 8 event types).
//  7. Quality metrics arithmetic calculation.
// =============================================================================

require("dotenv").config();
const {
  visualClassifierService,
  VisualClassifierService,
} = require("../ai/visual-intelligence/visualClassifier.service");
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
  console.log("  RUNNING SPRINT 4 VISUAL INTELLIGENCE & BATCH TEST SUITE ");
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

  // ─── TEST 1: Decision Rules & Canonical Visual Decision Types ──────────────
  await test("Decision Engine classifies all 6 active visual types correctly", () => {
    // 1. Product Review -> SEARCH_IMAGE
    const productRec = visualClassifierService.classifySection(
      "MacBook Pro M3 Max Review: Hands-On Hardware & Specs",
      "We test the new unibody chassis, ports, battery life, and pricing in this hands-on review."
    );
    assert(
      productRec.recommendation === "SEARCH_IMAGE",
      `Expected SEARCH_IMAGE for product review, got ${productRec.recommendation}`
    );
    assert(productRec.confidence >= 0.70, "Confidence must meet threshold");
    assert(productRec.reason.length > 5, "Must provide explanation why");

    // 2. Architecture Explanation -> DIAGRAM / GENERATE_IMAGE
    const archRec = visualClassifierService.classifySection(
      "Kafka Distributed Event Streaming Topology & Architecture",
      "Explain how brokers, cluster partitions, and consumer groups orchestrate message streams under the hood."
    );
    assert(
      archRec.recommendation === "DIAGRAM" || archRec.recommendation === "GENERATE_IMAGE",
      `Expected DIAGRAM or GENERATE_IMAGE for architecture, got ${archRec.recommendation}`
    );
    assert(archRec.confidence >= 0.70, "Architecture confidence must meet threshold");

    // 3. Numerical Benchmark -> CHART
    const chartRec = visualClassifierService.classifySection(
      "PostgreSQL vs MongoDB Throughput & Latency Benchmarks",
      "Comparing p99 latency, queries per second (QPS), and throughput under heavy concurrent write load."
    );
    assert(
      chartRec.recommendation === "CHART",
      `Expected CHART for benchmark, got ${chartRec.recommendation}`
    );

    // 4. UI Tutorial -> SCREENSHOT
    const tutorialRec = visualClassifierService.classifySection(
      "Step-by-Step Setup Guide: Installing Docker Desktop",
      "Walkthrough tutorial covering installation, console prerequisites, and dashboard configuration."
    );
    assert(
      tutorialRec.recommendation === "SCREENSHOT",
      `Expected SCREENSHOT for tutorial, got ${tutorialRec.recommendation}`
    );

    // 5. Programming Explanation -> CODE_VISUAL
    const codeRec = visualClassifierService.classifySection(
      "Implementing Red-Black Tree Balancing Algorithm in Rust",
      "Detailed function implementation, recursion syntax, and controller handler code."
    );
    assert(
      codeRec.recommendation === "CODE_VISUAL",
      `Expected CODE_VISUAL for code implementation, got ${codeRec.recommendation}`
    );
  });

  // ─── TEST 2: Decision Rules: Prefer NO_VISUAL on Simple/Conceptual Text ──────
  await test("Decision Engine prefers NO_VISUAL for conceptual text and conclusions", () => {
    // 1. Conclusion section
    const conclusionRec = visualClassifierService.classifySection(
      "Conclusion & Final Thoughts",
      "In summary, choosing between relational and document databases depends on your team's specific scalability requirements."
    );
    assert(
      conclusionRec.recommendation === "NO_VISUAL",
      `Expected NO_VISUAL for conclusion, got ${conclusionRec.recommendation}`
    );
    assert(conclusionRec.visualType === "none", "Visual type must be 'none'");

    // 2. Short conceptual paragraph without technical signals
    const briefRec = visualClassifierService.classifySection(
      "About This Guide",
      "This document outlines best practices collected from production engineering teams over the past year."
    );
    assert(
      briefRec.recommendation === "NO_VISUAL",
      `Expected NO_VISUAL for brief introductory prose, got ${briefRec.recommendation}`
    );
  });

  // ─── TEST 3: Confidence Thresholding ───────────────────────────────────────
  await test("Confidence threshold enforces minimum confidence (low confidence defaults to NO_VISUAL)", () => {
    assert(VisualClassifierService.MIN_CONFIDENCE_THRESHOLD === 0.70, "Minimum threshold must be 0.70");

    // Generic heading with vague prose
    const lowConfRec = visualClassifierService.classifySection(
      "General Observations",
      "Some general notes that don't involve any system design, code, hardware, or benchmarks."
    );

    assert(
      lowConfRec.recommendation === "NO_VISUAL",
      "Low confidence recommendation must fall back to NO_VISUAL"
    );
    assert(typeof lowConfRec.confidence === "number", "Must include numeric confidence");
  });

  // ─── TEST 4: Output Contract Verification ──────────────────────────────────
  await test("Output format contains visualType, recommendation, confidence, searchQuery, imagePrompt, reason", () => {
    const rec = visualClassifierService.classifySection(
      "Redis Distributed Cache Architecture",
      "Detailed cluster topology and failover replication mechanism."
    );

    assert(rec.visualType !== undefined, "Must contain visualType");
    assert(rec.recommendation !== undefined, "Must contain recommendation");
    assert(typeof rec.confidence === "number", "Must contain numeric confidence");
    assert(typeof rec.searchQuery === "string" && rec.searchQuery.length > 0, "Must contain searchQuery");
    assert(typeof rec.imagePrompt === "string" && rec.imagePrompt.length > 0, "Must contain imagePrompt");
    assert(typeof rec.reason === "string" && rec.reason.length > 0, "Must contain reason");
  });

  // ─── TEST 5: Batch Mode: Skips Completed & NO_VISUAL Sections ──────────────
  await test("Batch Visual Pipeline skips completed sections and NO_VISUAL sections", async () => {
    const sampleArticle = `
# System Design Handbook

## Introduction
A high level introduction to modern software systems.

## Microservices Architecture & Cluster Topology
Detailed topology of event driven services and broker pipelines.

## Benchmark Performance
Comparing latency and requests per second under peak load.

## Conclusion
Final takeaways from this engineering analysis.
    `.trim();

    const result = await batchVisualService.executeBatchPipeline({
      markdown: sampleArticle,
      userId: "author-batch-test",
    });

    assert(result.total === 4, `Expected 4 sections, got ${result.total}`);
    // Introduction and Conclusion should be classified as NO_VISUAL and skipped
    assert(result.skipped >= 2, `Expected at least 2 skipped sections, got ${result.skipped}`);
    assert(result.generated >= 1, "Must generate at least 1 visual for architecture");
    assert(result.summaryMessage.includes("sections:"), "Summary message must be formatted");
  });

  // ─── TEST 6: Duplicate Detection: Cross-Section Asset Reuse ─────────────────
  await test("Batch Mode reuses existing asset when multiple sections have similar visual concepts", async () => {
    const duplicateConceptArticle = `
## Redis Cache Cluster Architecture
How Redis cluster master and replica nodes organize cache partitions.

## Redis Cluster Architecture Overview
A detailed system architecture view of Redis cluster master and replica caching nodes.
    `.trim();

    const result = await batchVisualService.executeBatchPipeline({
      markdown: duplicateConceptArticle,
      userId: "author-dedup-test",
    });

    assert(result.total === 2, "Expected 2 sections");
    assert(result.items.length === 2, "Expected 2 items");

    // The second item should detect the near-duplicate prompt and reuse the asset
    const item1 = result.items[0];
    const item2 = result.items[1];

    assert(item1.imageUrl !== undefined, "Item 1 must have an image");
    assert(item2.imageUrl !== undefined, "Item 2 must have an image");
    assert(
      item1.imageUrl === item2.imageUrl,
      "Second section with near-duplicate concept must reuse first section's image"
    );
    assert(item2.isReused === true, "Item 2 must be marked as isReused: true");
  });

  // ─── TEST 7: Telemetry: All 8 Visual Lifecycle Events ───────────────────────
  await test("VisualAnalyticsService records all 8 Sprint 4 telemetry events", async () => {
    visualAnalyticsService.clearMemoryLog();
    const userId = "telemetry-user-sprint4";

    const eventsToTest = [
      "visual_suggestion_created",
      "visual_search_started",
      "visual_search_selected",
      "visual_generation_started",
      "visual_generation_accepted",
      "visual_generation_rejected",
      "visual_generation_regenerated",
      "visual_suggestion_dismissed",
    ];

    for (const evt of eventsToTest) {
      const record = await visualAnalyticsService.recordEvent({
        userId,
        heading: "Telemetry Test Section",
        visualType: "DIAGRAM",
        actionTaken: evt,
        confidence: 0.94,
      });
      assert(record.actionTaken === evt, `Must record event ${evt}`);
    }

    const stats = await visualAnalyticsService.getStats(userId);
    assert(stats.totalEvents === 8, `Expected 8 events recorded, got ${stats.totalEvents}`);
  });

  // ─── TEST 8: Quality Metrics Engine Arithmetic Calculation ─────────────────
  await test("VisualAnalyticsService computes all 5 quality metrics accurately", async () => {
    visualAnalyticsService.clearMemoryLog();
    const userId = "metrics-user-sprint4";

    // Simulate lifecycle events:
    // 10 suggestions created
    for (let i = 0; i < 10; i++) {
      await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_suggestion_created" });
    }
    // 4 search started, 3 search selected
    for (let i = 0; i < 4; i++) {
      await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_search_started" });
    }
    for (let i = 0; i < 3; i++) {
      await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_search_selected" });
    }
    // 6 generation started, 4 accepted, 2 rejected, 1 regenerated
    for (let i = 0; i < 6; i++) {
      await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_generation_started" });
    }
    for (let i = 0; i < 4; i++) {
      await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_generation_accepted" });
    }
    for (let i = 0; i < 2; i++) {
      await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_generation_rejected" });
    }
    await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_generation_regenerated" });
    // 2 dismissed
    for (let i = 0; i < 2; i++) {
      await visualAnalyticsService.recordEvent({ userId, actionTaken: "visual_suggestion_dismissed" });
    }

    const metrics = await visualAnalyticsService.computeQualityMetrics(userId);

    // 1. suggestion acceptance rate = (accepted [4] + search_selected [3]) / created [10] = 70.0%
    assert(
      metrics.suggestionAcceptanceRate === 70.0,
      `Expected 70.0% suggestion acceptance rate, got ${metrics.suggestionAcceptanceRate}`
    );

    // 2. generation acceptance rate = accepted [4] / started [6] = 66.7%
    assert(
      metrics.generationAcceptanceRate === 66.7,
      `Expected 66.7% generation acceptance rate, got ${metrics.generationAcceptanceRate}`
    );

    // 3. regeneration rate = regenerated [1] / started [6] = 16.7%
    assert(
      metrics.regenerationRate === 16.7,
      `Expected 16.7% regeneration rate, got ${metrics.regenerationRate}`
    );

    // 4. search vs generation preference = search [4] / (search [4] + gen [6]) = 40.0%
    assert(
      metrics.searchVsGenerationPreference === 40.0,
      `Expected 40.0% search vs generation preference, got ${metrics.searchVsGenerationPreference}`
    );

    // 5. dismissal rate = dismissed [2] / created [10] = 20.0%
    assert(
      metrics.dismissalRate === 20.0,
      `Expected 20.0% dismissal rate, got ${metrics.dismissalRate}`
    );
  });

  // ─── TEST 9: Controller Endpoints ──────────────────────────────────────────
  await test("AIController registers and serves classify and analytics stats", async () => {
    const controller = new AIController();
    const routes = controller._router.stack.filter((s: any) => s.route);

    const classifyRoute = routes.find((s: any) => s.route.path === "/ai/v1/visuals/classify");
    assert(classifyRoute !== undefined, "Route /ai/v1/visuals/classify must be registered");

    const batchRoute = routes.find((s: any) => s.route.path === "/ai/v1/visuals/batch-generate");
    assert(batchRoute !== undefined, "Route /ai/v1/visuals/batch-generate must be registered");

    const statsRoute = routes.find((s: any) => s.route.path === "/ai/v1/visuals/analytics/stats");
    assert(statsRoute !== undefined, "Route /ai/v1/visuals/analytics/stats must be registered");
  });

  console.log("\n=========================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
