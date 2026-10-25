// =============================================================================
//  AI FEATURE REGISTRY — AUTOMATED TEST SUITE
//  tests/aiFeatureRegistry.test.ts
//
//  Verifies:
//  1. Registry initialization and registration of all core capabilities.
//  2. Data contract adherence (id, name, description, category, placeholder cost, telemetryKey).
//  3. Literal type safety and category filtering.
//  4. Backward-compatible alias resolution.
//  5. Immutability of returned feature definitions.
//  6. Error handling for unknown or empty feature lookups.
// =============================================================================

import {
  aiFeatureRegistry,
  AIFeatureRegistry,
  type AIFeatureId,
  type AIFeatureCategory,
  type AIFeatureDefinition,
  AI_FEATURE_IDS,
  AI_FEATURE_CATEGORIES,
} from "../ai/feature";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

function runTests() {
  console.log("\n========================================================");
  console.log("  RUNNING AI FEATURE REGISTRY TEST SUITE");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // ─── Test 1: Registry Initialization ────────────────────────────────────────
  test("Should initialize singleton registry with all 31 core features", () => {
    const all = aiFeatureRegistry.getAll();
    assert(all.length >= 31, `Expected at least 31 features, got ${all.length}`);
    assert(aiFeatureRegistry.has("rewrite"), "Expected feature 'rewrite' to exist");
    assert(aiFeatureRegistry.has("improve_tone"), "Expected feature 'improve_tone' to exist");
    assert(aiFeatureRegistry.has("summarize"), "Expected feature 'summarize' to exist");
    assert(aiFeatureRegistry.has("faq_generation"), "Expected feature 'faq_generation' to exist");
    assert(aiFeatureRegistry.has("comparison_generation"), "Expected feature 'comparison_generation' to exist");
    assert(aiFeatureRegistry.has("seo_outline"), "Expected feature 'seo_outline' to exist");
    assert(aiFeatureRegistry.has("research_topic"), "Expected feature 'research_topic' to exist");
    assert(aiFeatureRegistry.has("publish_by_ai"), "Expected feature 'publish_by_ai' to exist");
  });

  // ─── Test 2: Data Contract Verification ────────────────────────────────────
  test("Every registered feature must satisfy full structural contract", () => {
    const all = aiFeatureRegistry.getAll();
    for (const feature of all) {
      assert(typeof feature.id === "string" && feature.id.length > 0, `Feature missing valid id`);
      assert(typeof feature.name === "string" && feature.name.length > 0, `${feature.id}: missing name`);
      assert(typeof feature.description === "string" && feature.description.length > 0, `${feature.id}: missing description`);
      assert(typeof feature.category === "string" && AI_FEATURE_CATEGORIES.includes(feature.category), `${feature.id}: invalid category "${feature.category}"`);
      assert(typeof feature.estimatedCreditCost === "number" && feature.estimatedCreditCost >= 0, `${feature.id}: invalid estimatedCreditCost`);
      assert(typeof feature.telemetryKey === "string" && feature.telemetryKey.startsWith("ai."), `${feature.id}: invalid telemetryKey "${feature.telemetryKey}"`);
    }
  });

  // ─── Test 3: Specific Feature Properties ───────────────────────────────────
  test("Should return accurate metadata for requested example features", () => {
    const rewrite = aiFeatureRegistry.get("rewrite");
    assert(rewrite.category === "editing", "Rewrite should be in 'editing' category");
    assert(rewrite.telemetryKey === "ai.editing.rewrite", "Rewrite telemetryKey mismatch");
    assert(rewrite.estimatedCreditCost === 5, "Rewrite placeholder credit cost should be 5");

    const outline = aiFeatureRegistry.get("seo_outline");
    assert(outline.category === "authoring", "seo_outline should be in 'authoring' category");
    assert(outline.telemetryKey === "ai.authoring.outline", "seo_outline telemetryKey mismatch");

    const publisher = aiFeatureRegistry.get("publish_by_ai");
    assert(publisher.category === "publishing", "publish_by_ai should be in 'publishing' category");
    assert(publisher.telemetryKey === "ai.publishing.publish_by_ai", "publish_by_ai telemetryKey mismatch");
  });

  // ─── Test 4: Category Filtering ────────────────────────────────────────────
  test("Should filter features by category accurately", () => {
    const editing = aiFeatureRegistry.getByCategory("editing");
    assert(editing.length >= 7, `Expected at least 7 editing features, got ${editing.length}`);
    assert(editing.every((f) => f.category === "editing"), "All returned features must have category 'editing'");

    const growth = aiFeatureRegistry.getByCategory("growth");
    assert(growth.length >= 6, `Expected at least 6 growth features, got ${growth.length}`);
    assert(growth.every((f) => f.category === "growth"), "All returned features must have category 'growth'");

    const publishing = aiFeatureRegistry.getByCategory("publishing");
    assert(publishing.length >= 6, `Expected at least 6 publishing features, got ${publishing.length}`);

    const media = aiFeatureRegistry.getByCategory("media");
    assert(media.length >= 5, `Expected at least 5 media features, got ${media.length}`);
  });

  // ─── Test 5: Alias Resolution (Backward Compatibility) ─────────────────────
  test("Should resolve backward-compatible aliases to canonical features", () => {
    const faq = aiFeatureRegistry.resolve("faq");
    assert(faq.id === "faq_generation", `Expected alias 'faq' -> 'faq_generation', got '${faq.id}'`);

    const comparison = aiFeatureRegistry.resolve("comparison_table");
    assert(comparison.id === "comparison_generation", `Expected alias 'comparison_table' -> 'comparison_generation', got '${comparison.id}'`);

    const metadata = aiFeatureRegistry.resolve("metadata");
    assert(metadata.id === "publish_metadata", `Expected alias 'metadata' -> 'publish_metadata', got '${metadata.id}'`);

    const planner = aiFeatureRegistry.resolve("planner");
    assert(planner.id === "seo_outline", `Expected alias 'planner' -> 'seo_outline', got '${planner.id}'`);

    const writer = aiFeatureRegistry.resolve("writer");
    assert(writer.id === "article_writer", `Expected alias 'writer' -> 'article_writer', got '${writer.id}'`);

    const publisher = aiFeatureRegistry.resolve("publisher");
    assert(publisher.id === "publish_by_ai", `Expected alias 'publisher' -> 'publish_by_ai', got '${publisher.id}'`);
  });

  // ─── Test 6: Immutability ──────────────────────────────────────────────────
  test("Registered features should be frozen and immutable", () => {
    const feature = aiFeatureRegistry.get("rewrite");
    assert(Object.isFrozen(feature), "Feature definition should be frozen with Object.freeze");
    try {
      (feature as any).name = "Hacked Name";
      assert(feature.name === "Rewrite Content", "Feature property modification should not persist");
    } catch (e) {
      // In strict mode, writing to frozen object throws TypeError, which is expected
      assert(true, "TypeError correctly thrown on mutating frozen object");
    }
  });

  // ─── Test 7: Error Handling ────────────────────────────────────────────────
  test("Should throw descriptive errors on unknown or empty lookups", () => {
    let thrownGet = false;
    try {
      aiFeatureRegistry.get("non_existent_capability" as any);
    } catch (err: any) {
      thrownGet = true;
      assert(err.message.includes("non_existent_capability"), "Error message should mention ID");
    }
    assert(thrownGet, "Expected get() on non-existent feature to throw");

    let thrownResolve = false;
    try {
      aiFeatureRegistry.resolve("invalid_alias");
    } catch (err: any) {
      thrownResolve = true;
      assert(err.message.includes("invalid_alias"), "Resolve error should mention unknown alias");
    }
    assert(thrownResolve, "Expected resolve() on invalid alias to throw");

    let thrownEmpty = false;
    try {
      aiFeatureRegistry.resolve("");
    } catch (err: any) {
      thrownEmpty = true;
    }
    assert(thrownEmpty, "Expected resolve() on empty string to throw");
  });

  // ─── Test 8: Custom Dynamic Registration ───────────────────────────────────
  test("Custom registry instances can register and lookup dynamically", () => {
    const customRegistry = new AIFeatureRegistry();
    const initialCount = customRegistry.getAll().length;

    customRegistry.register({
      id: "research_topic" as AIFeatureId,
      name: "Updated Deep Research",
      description: "Custom override description",
      category: "research",
      estimatedCreditCost: 50,
      telemetryKey: "ai.research.topic.custom",
    });

    const updated = customRegistry.get("research_topic");
    assert(updated.name === "Updated Deep Research", "Expected custom override name");
    assert(updated.estimatedCreditCost === 50, "Expected custom credit cost");
    assert(customRegistry.getAll().length === initialCount, "Override should update in-place without duplicating count");
  });

  console.log("\n--------------------------------------------------------");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
