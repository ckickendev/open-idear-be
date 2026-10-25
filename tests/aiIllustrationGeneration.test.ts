// =============================================================================
//  AI TECHNICAL ILLUSTRATION GENERATION — AUTOMATED TEST SUITE (SPRINT 2)
//  tests/aiIllustrationGeneration.test.ts
//
//  Verifies:
//  1. ImageGeneratorRegistry: active provider, stub providers (OpenAI, Ideogram).
//  2. Style preset prompt enhancement for all 4 presets.
//  3. Fuzzy duplicate detection arithmetic.
//  4. Asset schema extensions (type='ai', prompt, model, seed, createdBy).
//  5. AIController route registration for POST /ai/images/generate.
//  6. End-to-end technical illustration generation flow.
// =============================================================================

require("dotenv").config();
const Asset = require("../models/asset.schema");
const { imageGeneratorRegistry } = require("../ai/image/imageGenerator.registry");
const { imageGenerationService, ImageGenerationService } = require("../services/imageGeneration.service");
const AIController = require("../controllers/ai.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n=========================================================");
  console.log("  RUNNING AI ILLUSTRATION GENERATION SUITE (SPRINT 2)     ");
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

  // ─── TEST 1: Provider Registry ──────────────────────────────────────────────
  await test("ImageGeneratorRegistry has Gemini active and stubs registered", () => {
    const active = imageGeneratorRegistry.getActive();
    assert(active.id === "gemini-imagen", "Default active provider must be gemini-imagen");
    assert(imageGeneratorRegistry.has("openai-dalle3"), "Must register OpenAI stub");
    assert(imageGeneratorRegistry.has("ideogram"), "Must register Ideogram stub");
    assert(imageGeneratorRegistry.list().length >= 3, "Must have at least 3 providers registered");
  });

  // ─── TEST 2: Style Presets Prompt Enhancement ────────────────────────────────
  await test("Style preset modifiers correctly inject technical instructions", () => {
    const rawPrompt = "Redis Cache Cluster";

    const isometric = imageGenerationService.enhancePromptWithPreset(rawPrompt, "isometric");
    assert(isometric.includes("isometric technical illustration"), "Must apply isometric style");
    assert(isometric.includes("Redis Cache Cluster"), "Must preserve raw prompt");

    const blueprint = imageGenerationService.enhancePromptWithPreset(rawPrompt, "blueprint");
    assert(blueprint.includes("blueprint schematic"), "Must apply blueprint style");
    assert(blueprint.includes("CAD drafting lines"), "Must include CAD drafting lines");

    const flatVector = imageGenerationService.enhancePromptWithPreset(rawPrompt, "flat_vector");
    assert(flatVector.includes("flat vector technical icon"), "Must apply flat vector style");

    const threeD = imageGenerationService.enhancePromptWithPreset(rawPrompt, "3d_technical");
    assert(threeD.includes("3D technical render"), "Must apply 3D technical style");
  });

  // ─── TEST 3: Fuzzy Matching Duplicate Prevention ─────────────────────────────
  await test("Fuzzy duplicate similarity matches semantically near prompts", () => {
    const p1 = "Redis cache cluster architecture";
    const p2 = "Redis cache cluster architecture diagram";
    const simHigh = imageGenerationService.calculatePromptSimilarity(p1, p2);
    assert(simHigh >= 0.8, `Similarity should be high for identical topics, got ${simHigh}`);

    const pDiff = "PostgreSQL B-Tree index optimization";
    const simLow = imageGenerationService.calculatePromptSimilarity(p1, pDiff);
    assert(simLow < 0.3, `Similarity should be low for distinct topics, got ${simLow}`);
  });

  // ─── TEST 4: Asset Schema Model Extensions ──────────────────────────────────
  await test("Asset schema defines 'ai' type, createdBy, model, seed", () => {
    const paths = (Asset.schema as any).paths;
    assert(paths.type.enumValues.includes("ai"), "Asset type enum must include 'ai'");
    assert(paths.createdBy !== undefined, "Asset must define createdBy field");
    assert(paths.model !== undefined, "Asset must define model field");
    assert(paths.seed !== undefined, "Asset must define seed field");
    assert(paths.prompt !== undefined, "Asset must define prompt field");
  });

  // ─── TEST 5: Controller Route Bindings ────────────────────────────────────────
  await test("AIController binds POST /ai/images/generate & /ai/v1/images/generate", () => {
    const controller = new AIController();
    const routes = controller._router.stack.filter((s: any) => s.route);

    const v1Route = routes.find((s: any) => s.route.path === "/ai/v1/images/generate");
    assert(v1Route !== undefined, "Route /ai/v1/images/generate must be registered");
    assert(v1Route.route.methods.post === true, "Must accept POST");

    const aliasRoute = routes.find((s: any) => s.route.path === "/ai/images/generate");
    assert(aliasRoute !== undefined, "Route /ai/images/generate alias must be registered");
    assert(aliasRoute.route.methods.post === true, "Alias must accept POST");
  });

  // ─── TEST 6: End-to-End Generation Flow ──────────────────────────────────────
  await test("imageGenerationService generates valid illustration asset", async () => {
    const result = await imageGenerationService.generateTechnicalIllustration({
      prompt: "Kafka Distributed Event Streaming",
      style: "isometric",
      aspectRatio: "16:9",
      seed: 42,
    });

    assert(!!result.url, "Must return asset url");
    assert(result.type === "ai", "Must have type='ai'");
    assert(result.prompt === "Kafka Distributed Event Streaming", "Must retain original prompt");
    assert(result.seed === 42, "Must retain seed");
    assert(result.model.includes("gemini"), "Model must identify provider");
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
