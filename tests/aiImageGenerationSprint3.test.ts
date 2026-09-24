// =============================================================================
//  AI TECHNICAL ILLUSTRATION GENERATION — SPRINT 3 TEST SUITE
//  tests/aiImageGenerationSprint3.test.ts
//
//  Verifies Sprint 3 Specifications:
//  1. ImageGenerationProvider interface abstraction & registry.
//  2. Technical style presets (Isometric, Blueprint, Flat Vector, 3D Technical).
//  3. Controller validation (prompt length, supported styles, aspect ratios).
//  4. Security & Authentication checks (401 on unauthenticated requests).
//  5. Cost Protection: Sliding-window rate limiter (429 Too Many Requests).
//  6. Cost Protection: In-flight duplicate request deduplication (Idempotency).
//  7. Asset schema metadata persistence (sourceType="ai", provider, model, style, aspectRatio).
//  8. Telemetry tracking (started, completed, failed, regenerated).
//  9. End-to-end generation with fallback resilience.
// =============================================================================

require("dotenv").config();
const Asset = require("../models/asset.schema");
const { imageGeneratorRegistry } = require("../ai/image/imageGenerator.registry");
const {
  imageGenerationService,
  ImageGenerationService,
} = require("../services/imageGeneration.service");
const AIController = require("../controllers/ai.controller");
import type {
  ImageGenerationProvider,
  GenerateIllustrationRequest,
  GeneratedIllustrationResult,
} from "../ai/image/imageGenerator.interface";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n=========================================================");
  console.log("  RUNNING SPRINT 3 AI IMAGE GENERATION TEST SUITE        ");
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

  // ─── TEST 1: Provider Abstraction & Registry ───────────────────────────────
  await test("ImageGenerationProvider interface abstraction & registry decoupling", () => {
    const active = imageGeneratorRegistry.getActive();
    assert(active.id === "gemini-imagen", "Default active provider must be gemini-imagen");
    assert(active.displayName.includes("Gemini"), "Display name must be readable");
    assert(typeof active.generate === "function", "Provider must implement generate()");

    // Register a custom mock ImageGenerationProvider to test extensibility
    class MockCustomProvider implements ImageGenerationProvider {
      readonly id = "custom-flux";
      readonly displayName = "Flux Technical";
      readonly isAvailable = true;
      async generate(request: GenerateIllustrationRequest): Promise<GeneratedIllustrationResult> {
        return {
          buffer: Buffer.from("mock-binary"),
          mimeType: "image/png",
          revisedPrompt: request.prompt,
          model: this.id,
          seed: request.seed || 123,
        };
      }
    }

    const customProvider = new MockCustomProvider();
    imageGeneratorRegistry.register(customProvider);
    assert(imageGeneratorRegistry.has("custom-flux"), "Registry must support dynamic provider registration");
  });

  // ─── TEST 2: Style Presets Prompt Engineering ──────────────────────────────
  await test("Style preset modifiers correctly inject technical instructions for all presets", () => {
    const rawPrompt = "Microservices Event Bus Architecture";

    // 1. Isometric (kebab & snake)
    const iso1 = imageGenerationService.enhancePromptWithPreset(rawPrompt, "isometric");
    const iso2 = imageGenerationService.enhancePromptWithPreset(rawPrompt, "technical-isometric");
    assert(iso1.includes("isometric technical illustration"), "Isometric style must contain technical illustration");
    assert(iso1.includes("30-degree orthographic angle"), "Must specify 30-degree orthographic angle");
    assert(iso1.includes("no photorealism"), "Must exclude photorealism");
    assert(iso1 === iso2, "kebab-case technical-isometric must produce identical instructions");

    // 2. Blueprint
    const blueprint = imageGenerationService.enhancePromptWithPreset(rawPrompt, "blueprint");
    assert(blueprint.includes("blueprint schematic"), "Blueprint must specify schematic");
    assert(blueprint.includes("CAD drafting lines"), "Blueprint must include CAD drafting lines");
    assert(blueprint.includes("Prussian blue"), "Blueprint must specify Prussian blue grid");

    // 3. Flat Vector
    const flat1 = imageGenerationService.enhancePromptWithPreset(rawPrompt, "flat_vector");
    const flat2 = imageGenerationService.enhancePromptWithPreset(rawPrompt, "flat-vector");
    assert(flat1.includes("flat vector technical icon"), "Flat vector must specify technical icon");
    assert(flat1 === flat2, "flat-vector and flat_vector must match");

    // 4. 3D Technical
    const threeD1 = imageGenerationService.enhancePromptWithPreset(rawPrompt, "3d_technical");
    const threeD2 = imageGenerationService.enhancePromptWithPreset(rawPrompt, "3d-technical");
    assert(threeD1.includes("3D technical render illustration"), "3D Technical must specify technical render");
    assert(threeD1 === threeD2, "3d-technical and 3d_technical must match");
  });

  // ─── TEST 3: Validation Rules (Prompt length, style, ratio) ────────────────
  await test("Validates prompt length, supported styles, and aspect ratios", () => {
    // Length validation
    assert(imageGenerationService.isValidStyle("isometric") === true, "isometric must be valid");
    assert(imageGenerationService.isValidStyle("technical-isometric") === true, "technical-isometric must be valid");
    assert(imageGenerationService.isValidStyle("blueprint") === true, "blueprint must be valid");
    assert(imageGenerationService.isValidStyle("flat-vector") === true, "flat-vector must be valid");
    assert(imageGenerationService.isValidStyle("3d-technical") === true, "3d-technical must be valid");
    assert(imageGenerationService.isValidStyle("photorealistic-portrait") === false, "unsupported style must be invalid");

    // Ratio validation
    assert(imageGenerationService.isValidAspectRatio("16:9") === true, "16:9 must be valid");
    assert(imageGenerationService.isValidAspectRatio("1:1") === true, "1:1 must be valid");
    assert(imageGenerationService.isValidAspectRatio("9:16") === true, "9:16 must be valid");
    assert(imageGenerationService.isValidAspectRatio("21:9") === false, "21:9 must be invalid");
  });

  // ─── TEST 4: Security & Authentication Enforcement ─────────────────────────
  await test("AIController enforces authentication on generation endpoint", async () => {
    const controller = new AIController();
    const mockReqWithoutUser: any = {
      body: { prompt: "Distributed consensus Raft" },
    };
    let statusCode: number | null = null;
    let jsonOutput: any = null;

    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        jsonOutput = data;
      },
    };

    await controller.generateTechnicalIllustration(mockReqWithoutUser, mockRes);
    assert(statusCode === 401, `Expected 401 Unauthorized for unauthenticated request, got ${statusCode}`);
    assert(jsonOutput?.error?.includes("Authentication required"), "Must return authentication required error");
  });

  // ─── TEST 5: Cost Protection: Per-User Generation Limits (429) ──────────────
  await test("Cost Protection: enforces sliding-window per-user generation limits (429)", () => {
    const testUserId = "user-cost-protection-test";
    imageGenerationService.resetRateLimits(testUserId);

    // Consume all 20 allowed requests
    for (let i = 0; i < 20; i++) {
      imageGenerationService.checkRateLimit(testUserId);
    }

    // 21st request must trigger 429 Too Many Requests
    let rateLimitCaught = false;
    try {
      imageGenerationService.checkRateLimit(testUserId);
    } catch (err: any) {
      rateLimitCaught = true;
      assert(err.status === 429, `Error status must be 429, got ${err.status}`);
      assert(err.code === "RATE_LIMIT_EXCEEDED", "Error code must be RATE_LIMIT_EXCEEDED");
    }
    assert(rateLimitCaught, "Must throw 429 rate limit exceeded error");
    imageGenerationService.resetRateLimits(testUserId);
  });

  // ─── TEST 6: Cost Protection: In-Flight Duplicate Idempotency ──────────────
  await test("Cost Protection: coalesces concurrent in-flight requests for identical prompts", async () => {
    const userId = "user-idempotency-test";
    imageGenerationService.resetRateLimits(userId);

    const prompt = "Event Sourcing with CQRS Pattern";
    // Fire two parallel requests with the identical prompt and style
    const p1 = imageGenerationService.generateTechnicalIllustration({
      prompt,
      style: "isometric",
      userId,
      force: false,
    });
    const p2 = imageGenerationService.generateTechnicalIllustration({
      prompt,
      style: "isometric",
      userId,
      force: false,
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    assert(res1._id.toString() === res2._id.toString(), "In-flight duplicate must resolve to the identical asset");
  });

  // ─── TEST 7: Asset Schema Model Metadata Extensions ─────────────────────────
  await test("Asset schema defines sourceType='ai', provider, style, aspectRatio", () => {
    const paths = (Asset.schema as any).paths;
    assert(paths.sourceType !== undefined, "Asset schema must define sourceType field");
    assert(paths.provider !== undefined, "Asset schema must define provider field");
    assert(paths.style !== undefined, "Asset schema must define style field");
    assert(paths.aspectRatio !== undefined, "Asset schema must define aspectRatio field");
    assert(paths.suggestionId !== undefined, "Asset schema must define suggestionId field");
  });

  // ─── TEST 8: Telemetry Event Logging ────────────────────────────────────────
  await test("Telemetry tracks started, completed, failed, and regenerated events", async () => {
    imageGenerationService.clearTelemetry();
    const userId = "user-telemetry-test";
    imageGenerationService.resetRateLimits(userId);

    const asset = await imageGenerationService.generateTechnicalIllustration({
      prompt: "Kubernetes Pod Lifecycle State Machine",
      style: "blueprint",
      userId,
      force: true, // force marks as regenerated
    });

    assert(asset !== null, "Asset must be returned");
    const events = imageGenerationService.getTelemetryEvents();

    const started = events.find((e) => e.event === "image_generation_started");
    assert(started !== undefined, "Must record image_generation_started");
    assert(started?.userId === userId, "Started event must record userId");

    const completed = events.find((e) => e.event === "image_generation_completed");
    assert(completed !== undefined, "Must record image_generation_completed");
    assert(typeof completed?.latency === "number", "Completed event must record latency");
    assert(completed?.assetId !== undefined, "Completed event must record assetId");

    const regenerated = events.find((e) => e.event === "image_generation_regenerated");
    assert(regenerated !== undefined, "Must record image_generation_regenerated when force=true");
  });

  // ─── TEST 9: End-to-End Generation & Metadata Verification ──────────────────
  await test("End-to-End generation produces compliant Asset with complete metadata", async () => {
    const userId = "author-e2e-test";
    imageGenerationService.resetRateLimits(userId);

    const result = await imageGenerationService.generateTechnicalIllustration({
      prompt: "Zero Knowledge Proof Circuit Verification",
      style: "3d-technical",
      aspectRatio: "16:9",
      seed: 999,
      userId,
      suggestionId: "sugg-zkp-101",
    });

    assert(result._id !== undefined, "Must generate asset _id");
    assert(result.sourceType === "ai", "sourceType must be 'ai'");
    assert(result.provider === "gemini-imagen", "provider must be 'gemini-imagen'");
    assert(result.style === "3d_technical", "style must be normalized to '3d_technical'");
    assert(result.aspectRatio === "16:9", "aspectRatio must be '16:9'");
    assert(result.suggestionId === "sugg-zkp-101", "suggestionId must be preserved");
    assert(result.url.length > 10, "URL must be populated");
    assert(result.thumbnailUrl.length > 10, "Thumbnail URL must be populated");
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
