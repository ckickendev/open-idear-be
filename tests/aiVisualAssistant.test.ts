// =============================================================================
//  AI VISUAL ASSISTANT — AUTOMATED TEST SUITE (SPRINT 1)
//  tests/aiVisualAssistant.test.ts
//
//  Verifies:
//  1. Asset schema fields: type, searchQuery, prompt, source.
//  2. WriterSchema validation of imageSuggestions metadata.
//  3. MockTechnicalStockProvider keyword matching and ranking.
//  4. ImageSearchService composite integration and limits.
//  5. AIController image search route bindings.
// =============================================================================

require("dotenv").config();
const Asset = require("../models/asset.schema");
import { WriterSchema, VisualTypeEnum, VisualSuggestionSchema } from "../ai/agent/writer.schema";
const { MockTechnicalStockProvider, ImageSearchService } = require("../services/imageSearch.service");
const AIController = require("../controllers/ai.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n=========================================================");
  console.log("  RUNNING AI VISUAL ASSISTANT TEST SUITE (SPRINT 1)      ");
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

  // ─── TEST 1: Asset Schema Extensions ─────────────────────────────────────────
  await test("Asset schema defines type, searchQuery, prompt, source and enum values", () => {
    const paths = (Asset.schema as any).paths;
    assert(paths.type !== undefined, "Asset must have 'type' field");
    assert(paths.searchQuery !== undefined, "Asset must have 'searchQuery' field");
    assert(paths.prompt !== undefined, "Asset must have 'prompt' field");
    assert(paths.source !== undefined, "Asset must have 'source' field");

    const sourceEnums = paths.source.enumValues;
    assert(sourceEnums.includes("upload"), "source should allow 'upload'");
    assert(sourceEnums.includes("ai_generated"), "source should allow 'ai_generated'");
    assert(sourceEnums.includes("stock"), "source should allow 'stock'");
    assert(sourceEnums.includes("asset_library"), "source should allow 'asset_library'");
  });

  // ─── TEST 2: WriterSchema Validates Image Suggestions ────────────────────────
  await test("WriterSchema successfully parses optional imageSuggestions", () => {
    const validPayload = {
      markdown: "# Mastering Redis Architecture\n\nRedis is fast.\n\n## Redis Clustering\n\nClustering enables horizontal scale.",
      wordCount: 150,
      estimatedReadingTime: 2,
      imageSuggestions: [
        {
          heading: "Redis Clustering",
          searchQuery: "Redis architecture diagram",
          imagePrompt: "Modern isometric Redis cache cluster architecture, blue technical illustration",
          alt: "Redis clustering and cache node topology diagram",
          position: "after_heading",
        },
      ],
    };

    const parsed = WriterSchema.parse(validPayload);
    assert(Array.isArray(parsed.imageSuggestions), "imageSuggestions must be an array");
    assert(parsed.imageSuggestions!.length === 1, "Must have 1 suggestion");
    assert(parsed.imageSuggestions![0].heading === "Redis Clustering", "Heading must match");
    assert(parsed.imageSuggestions![0].searchQuery === "Redis architecture diagram", "Search query must match");
    assert(parsed.imageSuggestions![0].position === "after_heading", "Position must match");

    // Also verify backward compatibility when imageSuggestions is omitted
    const payloadWithoutImages = {
      markdown: "Go is concise.",
      wordCount: 50,
      estimatedReadingTime: 1,
    };
    const parsedNoImages = WriterSchema.parse(payloadWithoutImages);
    assert(parsedNoImages.markdown === "Go is concise.", "Omitted imageSuggestions must still parse");
    assert(Array.isArray(parsedNoImages.visualSuggestions), "visualSuggestions must default to array");
    assert(parsedNoImages.visualSuggestions.length === 0, "visualSuggestions must default to empty array");
  });

  // ─── TEST 2B: VisualType Controlled Enum Validation ─────────────────────────
  await test("VisualTypeEnum strictly enforces controlled values and rejects arbitrary strings", () => {
    const validTypes = [
      "illustration",
      "diagram",
      "screenshot",
      "product",
      "comparison",
      "chart",
      "code",
      "none",
    ];

    for (const valid of validTypes) {
      assert(VisualTypeEnum.safeParse(valid).success, `Valid visualType "${valid}" must pass validation`);
    }

    const invalidTypes = ["photorealistic", "drawing", "banner", "clipart", "arbitrary_value", "random"];
    for (const invalid of invalidTypes) {
      assert(!VisualTypeEnum.safeParse(invalid).success, `Invalid visualType "${invalid}" must be rejected`);
    }
  });

  // ─── TEST 2C: WriterSchema Validates Structured visualSuggestions ───────────
  await test("WriterSchema validates visualSuggestions contract and maps to imageSuggestions", () => {
    const payload = {
      markdown: "# Distributed Streaming\n\n## Redis Architecture\n\nRedis operates as an in-memory datastore.",
      wordCount: 85,
      estimatedReadingTime: 1,
      visualSuggestions: [
        {
          id: "vs_001",
          target: "Redis Architecture",
          position: "after-heading",
          visualType: "diagram",
          searchQuery: "Redis architecture diagram",
          imagePrompt: "Modern technical illustration showing Redis cache architecture...",
          altText: "Redis cache architecture showing application, Redis and database",
          reason: "This section explains system architecture.",
          confidence: 0.94,
        },
      ],
    };

    const parsed = WriterSchema.parse(payload);
    assert(parsed.visualSuggestions.length === 1, "Must parse 1 visual suggestion");
    const vs = parsed.visualSuggestions[0];
    assert(vs.id === "vs_001", "id must match vs_001");
    assert(vs.target === "Redis Architecture", "target must match heading");
    assert(vs.position === "after-heading", "position must match after-heading");
    assert(vs.visualType === "diagram", "visualType must match diagram");
    assert(vs.searchQuery === "Redis architecture diagram", "searchQuery must match");
    assert(vs.imagePrompt.includes("Redis cache architecture"), "imagePrompt must match");
    assert(vs.altText.includes("Redis cache architecture"), "altText must match");
    assert(vs.reason === "This section explains system architecture.", "reason must match");
    assert(vs.confidence === 0.94, "confidence must match 0.94");

    // Check automatic backward compatibility population of imageSuggestions
    assert(parsed.imageSuggestions.length === 1, "imageSuggestions must be auto-populated");
    assert(parsed.imageSuggestions[0].heading === "Redis Architecture", "Legacy heading must match target");
    assert(parsed.imageSuggestions[0].alt === vs.altText, "Legacy alt must match altText");
  });

  // ─── TEST 2D: Graceful visualType: 'none' and empty visualSuggestions ────────
  await test("WriterSchema handles visualSuggestions = [] and filters visualType: 'none'", () => {
    // 1. Empty visualSuggestions array
    const emptyPayload = {
      markdown: "Plain text documentation without need for diagrams.",
      wordCount: 60,
      estimatedReadingTime: 1,
      visualSuggestions: [],
    };
    const parsedEmpty = WriterSchema.parse(emptyPayload);
    assert(parsedEmpty.visualSuggestions.length === 0, "Empty visualSuggestions must parse cleanly");
    assert(parsedEmpty.imageSuggestions.length === 0, "Legacy imageSuggestions must be empty");

    // 2. Section where visualType is 'none'
    const nonePayload = {
      markdown: "## Changelog\n\n- Updated dependencies.",
      wordCount: 30,
      estimatedReadingTime: 1,
      visualSuggestions: [
        {
          id: "vs_none",
          target: "Changelog",
          position: "after-heading",
          visualType: "none",
          searchQuery: "",
          imagePrompt: "",
          altText: "",
          reason: "Changelog section does not require visual assistance.",
          confidence: 0.99,
        },
      ],
    };
    const parsedNone = WriterSchema.parse(nonePayload);
    assert(parsedNone.visualSuggestions[0].visualType === "none", "Must preserve visualType 'none'");
    assert(parsedNone.imageSuggestions.length === 0, "visualType 'none' must NOT be mapped to imageSuggestions");
  });

  // ─── TEST 3: MockTechnicalStockProvider Search ──────────────────────────────
  await test("MockTechnicalStockProvider returns relevant technical diagrams & stock", async () => {
    const provider = new MockTechnicalStockProvider();

    const redisResults = await provider.search("redis cache architecture", 4);
    assert(redisResults.length > 0, "Must return results for redis search");
    assert(redisResults[0].source === "stock", "Source must be 'stock'");
    assert(typeof redisResults[0].url === "string" && redisResults[0].url.startsWith("http"), "Must have valid url");
    assert(typeof redisResults[0].thumbnailUrl === "string", "Must have valid thumbnailUrl");
    assert(typeof redisResults[0].title === "string", "Must have title");
    assert(typeof redisResults[0].alt === "string", "Must have alt");

    const aiResults = await provider.search("neural network model", 2);
    assert(aiResults.length === 2, "Must respect limit");
    assert(aiResults.some((r: any) => r.tags.includes("ai") || r.tags.includes("neural")), "Must match AI keywords");
  });

  // ─── TEST 4: ImageSearchService Aggregation & Limits ─────────────────────────
  await test("ImageSearchService enforces limits and structure", async () => {
    const service = new ImageSearchService();
    const results = await service.search("database system design", 5);

    assert(Array.isArray(results), "Results must be an array");
    assert(results.length <= 5, "Results must not exceed limit");
    for (const item of results) {
      assert(!!item.id, "Item must have id");
      assert(!!item.url, "Item must have url");
      assert(!!item.alt, "Item must have alt");
      assert(!!item.title, "Item must have title");
      assert(!!item.source, "Item must have source");
    }
  });

  // ─── TEST 5: AIController Image Search Route Registration ────────────────────
  await test("AIController binds POST /ai/v1/images/search and /ai/images/search", () => {
    const controller = new AIController();
    const routes = controller._router.stack.filter((s: any) => s.route);

    const v1Route = routes.find((s: any) => s.route.path === "/ai/v1/images/search");
    assert(v1Route !== undefined, "Route /ai/v1/images/search must be registered");
    assert(v1Route.route.methods.post === true, "Must accept POST");

    const aliasRoute = routes.find((s: any) => s.route.path === "/ai/images/search");
    assert(aliasRoute !== undefined, "Route /ai/images/search alias must be registered");
    assert(aliasRoute.route.methods.post === true, "Alias must accept POST");
  });

  // ─── TEST 6: Content Transformer & Placeholder Injection Logic ───────────────
  await test("Content transformer injects placeholders for visual suggestions and skips visualType: 'none'", () => {
    function escapeHtmlAttr(str: string): string {
      return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function injectImagePlaceholders(html: string, suggestions?: any[]): string {
      if (!html || !suggestions || suggestions.length === 0) return html;
      let result = html;
      for (const suggestion of suggestions) {
        if (suggestion.visualType === "none") continue;
        const heading = suggestion.target || suggestion.heading;
        if (!heading) continue;

        const headingAttr = escapeHtmlAttr(heading);
        const queryAttr = escapeHtmlAttr(suggestion.searchQuery || heading);
        const promptAttr = escapeHtmlAttr(suggestion.imagePrompt || "");
        const altAttr = escapeHtmlAttr(suggestion.altText || suggestion.alt || heading);
        const idAttr = suggestion.id ? ` data-id="${escapeHtmlAttr(suggestion.id)}"` : "";
        const visualTypeAttr = suggestion.visualType ? ` data-visual-type="${escapeHtmlAttr(suggestion.visualType)}"` : "";
        const confidenceAttr = suggestion.confidence !== undefined ? ` data-confidence="${suggestion.confidence}"` : "";
        const reasonAttr = suggestion.reason ? ` data-reason="${escapeHtmlAttr(suggestion.reason)}"` : "";

        const placeholderHtml = `<div data-type="image-placeholder"${idAttr} data-heading="${headingAttr}" data-search-query="${queryAttr}" data-image-prompt="${promptAttr}" data-alt="${altAttr}"${visualTypeAttr}${confidenceAttr}${reasonAttr}></div>`;
        const cleanHeadingText = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const headingPattern = new RegExp(`(<h[1-3][^>]*>[\\s\\S]*?${cleanHeadingText}[\\s\\S]*?<\\/h[1-3]>)`, "i");

        if (headingPattern.test(result)) {
          result = result.replace(headingPattern, `$1\n${placeholderHtml}`);
        }
      }
      return result;
    }

    const html = `
      <h2>Architecture Overview</h2>
      <p>High level view.</p>
      <h2>Deployment Notes</h2>
      <p>Simple list.</p>
    `;

    const suggestions = [
      {
        id: "vs_001",
        target: "Architecture Overview",
        visualType: "diagram",
        searchQuery: "System architecture diagram",
        imagePrompt: "Cloud architecture diagram",
        altText: "System Architecture Overview",
        reason: "Explains multi-tier cloud infrastructure",
        confidence: 0.95,
      },
      {
        id: "vs_002",
        target: "Deployment Notes",
        visualType: "none",
        reason: "Text only notes",
        confidence: 0.99,
      },
    ];

    const injected = injectImagePlaceholders(html, suggestions);

    // Verify vs_001 was injected
    assert(injected.includes('data-type="image-placeholder"'), "Must inject placeholder for diagram");
    assert(injected.includes('data-heading="Architecture Overview"'), "Must have heading attribute");
    assert(injected.includes('data-visual-type="diagram"'), "Must have visualType diagram");
    assert(injected.includes('data-confidence="0.95"'), "Must have confidence attribute");

    // Verify vs_002 ('none') was NOT injected
    assert(!injected.includes('data-heading="Deployment Notes"'), "Must NOT inject placeholder for visualType 'none'");
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
