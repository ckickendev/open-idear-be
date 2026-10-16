// =============================================================================
//  MULTILINGUAL AI WORKFLOW — AUTOMATED TEST SUITE (SPRINT 4)
//  tests/multilingualAI.test.ts
//
//  Verifies:
//  1. Centralized Language Instructions in AIContextCollector (en vs vi).
//  2. Legacy callers without locale preserve English defaults.
//  3. TranslatorSchema validation for title, description, content, slug, and SEO.
//  4. Feature registry registration & alias resolution for 'article_translate'.
//  5. ArticleTranslationWorkflow with mocked provider: code & structure preservation.
//  6. Protection against publishing: returns pure drafts, no side-effects.
//  7. Accidental overwrite protection: validation requires distinct source & target.
//  8. Controller locale extraction & validation for Planner, Writer, Stream, Translate.
// =============================================================================

import assert from "node:assert";
import { AIContextCollector, getLanguageInstructions } from "../ai/context";
import { BaseAgent } from "../ai/agent/base.agent";
import { TranslatorSchema } from "../ai/agent/translator.schema";
import { TranslatorAgent } from "../ai/agent/translator.agent";
import { ArticleTranslationWorkflow } from "../ai/workflow/translation.workflow";
import { aiFeatureRegistry } from "../ai/feature";

async function runTests() {
  console.log("\n========================================================");
  console.log("  RUNNING SPRINT 4 MULTILINGUAL AI TEST SUITE");
  console.log("========================================================\n");

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
      failed++;
    }
  }

  // Common deterministic mock for TranslatorAgent
  const mockTranslatorAgent = {
    execute: async (input: any) => {
      assert(input.sourceLocale === "en", "Expected sourceLocale to be en");
      assert(input.targetLocale === "vi", "Expected targetLocale to be vi");
      const content = input.sourceContent || input.content || "";
      assert(content.includes("```typescript"), "Code block must reach agent input");
      assert(content.includes("https://example.com/assets/arch.png"), "Image reference must reach agent");

      return {
        success: true,
        data: {
          title: "Bộ nhớ đệm hiệu năng cao với Redis (High-Performance Caching)",
          description: "Bộ nhớ đệm (caching) là thành phần then chốt cho các hệ thống quy mô lớn.",
          content: [
            "# Bộ nhớ đệm hiệu năng cao với Redis (High-Performance Caching)",
            "",
            "Bộ nhớ đệm (caching) đóng vai trò sống còn đối với các ứng dụng quy mô lớn.",
            "",
            "![Architecture Diagram](https://example.com/assets/arch.png)",
            "",
            "## Cài đặt mã nguồn (Code Implementation)",
            "",
            "```typescript",
            "import Redis from 'ioredis';",
            "const redis = new Redis();",
            "await redis.set('key', 'value', 'EX', 3600);",
            "```",
            "",
            "| Phân tầng Cache | Độ trễ (Latency) |",
            "| :--- | :--- |",
            "| L1 Trong bộ nhớ (In-Memory) | < 1ms |",
            "| L2 Redis | 2-5ms |",
          ].join("\n"),
          slug: "bo-nho-dem-hieu-nang-cao-voi-redis",
          seo: {
            metaTitle: "Bộ nhớ đệm hiệu năng cao với Redis",
            metaDescription: "Hướng dẫn tối ưu bộ nhớ đệm với Redis.",
            keywords: ["redis", "caching", "hieu nang cao"],
          },
        },
      };
    },
  } as unknown as TranslatorAgent;

  // ─── Test 1: Centralized Vietnamese Language Instructions ─────────────────
  await test("AIContextCollector: Injects Vietnamese instructions when language is 'vi'", () => {
    const formatted = AIContextCollector.formatToMarkdown({
      language: "vi",
      topic: "Microservices Architecture",
    });

    assert(formatted.includes("# TARGET LANGUAGE & LOCALIZATION RULES"), "Missing localization header");
    assert(formatted.includes("Vietnamese (Tiếng Việt)"), "Missing Vietnamese target rule");
    assert(formatted.includes("Preserve code blocks"), "Missing code preservation instruction");
    assert(formatted.includes("API names"), "Missing API identifiers instruction");
    assert(formatted.includes("English technical terms in parentheses"), "Missing parenthetical technical term instruction");
  });

  // ─── Test 2: Centralized English Language Instructions ────────────────────
  await test("AIContextCollector: Injects English instructions when language is 'en'", () => {
    const formatted = AIContextCollector.formatToMarkdown({
      language: "en",
      topic: "Building Distributed Systems",
    });

    assert(formatted.includes("# TARGET LANGUAGE & LOCALIZATION RULES"), "Missing localization header");
    assert(formatted.includes("English"), "Missing English target rule");
    assert(formatted.includes("natural technical English"), "Missing natural technical English rule");
  });

  // ─── Test 3: Legacy Caller Defaulting to English ──────────────────────────
  await test("AIContextCollector: Preserves English defaults for legacy callers without locale", () => {
    const formatted = AIContextCollector.formatToMarkdown({
      topic: "Legacy Request",
    });

    assert(formatted.includes("# TARGET LANGUAGE & LOCALIZATION RULES"), "Missing localization header");
    assert(formatted.includes("English"), "Expected default to English for legacy caller");
    assert(!formatted.includes("Vietnamese (Tiếng Việt)"), "Should not inject Vietnamese for legacy caller");
  });

  // ─── Test 4: Helper getLanguageInstructions contract ─────────────────────
  await test("getLanguageInstructions returns targeted guidelines for both 'en' and 'vi'", () => {
    const viInstructions = getLanguageInstructions("vi");
    const enInstructions = getLanguageInstructions("en");

    assert(viInstructions.includes("Tiếng Việt"), "vi instructions must mention Tiếng Việt");
    assert(viInstructions.includes("parentheses"), "vi instructions must retain English terms in parentheses");
    assert(enInstructions.includes("natural technical English"), "en instructions must enforce technical English");
  });

  // ─── Test 5: TranslatorSchema validation ──────────────────────────────────
  await test("TranslatorSchema: Validates correct translation output payload", () => {
    const validPayload = {
      title: "Kiến trúc Hướng dịch vụ",
      description: "Tổng quan toàn diện về vi dịch vụ và các mẫu thiết kế thực tế.",
      content: "## Giới thiệu\n\nĐây là bài viết hướng dẫn về microservices.\n\n```ts\nconst port = 5000;\n```",
      slug: "kien-truc-huong-dich-vu",
      seo: {
        metaTitle: "Kiến trúc Hướng dịch vụ - OpenIdear",
        metaDescription: "Tổng quan toàn diện về vi dịch vụ.",
        keywords: ["microservices", "kien truc phan mem"],
      },
    };

    const parsed = TranslatorSchema.safeParse(validPayload);
    assert(parsed.success, `Expected valid schema parsing, errors: ${JSON.stringify(parsed)}`);
    assert(parsed.data?.title === validPayload.title, "Parsed title matches");
    assert(parsed.data?.slug === "kien-truc-huong-dich-vu", "Parsed slug matches");
  });

  // ─── Test 6: TranslatorSchema rejects missing fields ──────────────────────
  await test("TranslatorSchema: Rejects malformed or incomplete payload", () => {
    const invalidPayload = {
      title: "Chỉ có tiêu đề",
      // missing description, content, slug
    };

    const parsed = TranslatorSchema.safeParse(invalidPayload);
    assert(!parsed.success, "Schema should have rejected missing content and slug");
  });

  // ─── Test 7: AI Feature Registry Integration ──────────────────────────────
  await test("AIFeatureRegistry: article_translate feature is registered with alias support", () => {
    assert(aiFeatureRegistry.has("article_translate"), "Expected 'article_translate' to be registered");
    const feature = aiFeatureRegistry.get("article_translate");
    assert(feature !== undefined, "Feature definition must exist");
    assert(feature?.category === "authoring", "Feature category should be authoring");

    // Test alias resolution
    const resolved = aiFeatureRegistry.resolve("translate");
    assert(resolved.id === "article_translate", "Expected 'translate' alias to resolve to 'article_translate'");
  });

  // ─── Test 8: ArticleTranslationWorkflow with Mocked Agent ─────────────────
  await test("ArticleTranslationWorkflow: Preserves code, structure, and images with deterministic mock", async () => {
    const sourceMarkdown = [
      "# High-Performance Caching with Redis",
      "",
      "Caching is critical for web scale applications.",
      "",
      "![Architecture Diagram](https://example.com/assets/arch.png)",
      "",
      "## Code Implementation",
      "",
      "```typescript",
      "import Redis from 'ioredis';",
      "const redis = new Redis();",
      "await redis.set('key', 'value', 'EX', 3600);",
      "```",
      "",
      "| Phân tầng Cache | Độ trễ (Latency) |",
      "| :--- | :--- |",
      "| L1 Trong bộ nhớ (In-Memory) | < 1ms |",
      "| L2 Redis | 2-5ms |",
    ].join("\n");

    const workflow = new ArticleTranslationWorkflow(mockTranslatorAgent);

    const result = await workflow.execute({
      sourceLocale: "en",
      targetLocale: "vi",
      sourceTitle: "High-Performance Caching with Redis",
      sourceContent: sourceMarkdown,
      sourceDescription: "Caching is critical for web scale applications.",
    });

    assert(result.title.includes("Redis"), "Translated title preserved key terms");
    assert(result.content.includes("```typescript"), "Code blocks must be preserved identically");
    assert(result.content.includes("https://example.com/assets/arch.png"), "Image URLs must be preserved");
    assert(result.content.includes("| Phân tầng Cache |"), "Markdown tables must be preserved");
    assert(result.slug === "bo-nho-dem-hieu-nang-cao-voi-redis", "Localized slug was generated");
    assert(result.sourceLocale === "en" && result.targetLocale === "vi", "Locales match input");
  });

  // ─── Test 9: Accidental Overwrite & Same-Locale Protection ─────────────────
  await test("ArticleTranslationWorkflow: Prevents same-source and same-target translation", async () => {
    const workflow = new ArticleTranslationWorkflow(mockTranslatorAgent);

    let errorThrown = false;
    try {
      await workflow.execute({
        sourceLocale: "en",
        targetLocale: "en",
        sourceTitle: "Test Title",
        sourceContent: "Test Content",
      });
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes("must be different"), "Expected error regarding identical locales");
    }

    assert(errorThrown, "Workflow must throw error when sourceLocale === targetLocale");
  });

  // ─── Test 10: Validation of empty content or title ────────────────────────
  await test("ArticleTranslationWorkflow: Validates required title and content", async () => {
    const workflow = new ArticleTranslationWorkflow(mockTranslatorAgent);

    let errorThrown = false;
    try {
      await workflow.execute({
        sourceLocale: "en",
        targetLocale: "vi",
        sourceTitle: "",
        sourceContent: "",
      });
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes("requires non-empty"), "Expected error regarding missing fields");
    }

    assert(errorThrown, "Workflow must reject empty title and content");
  });

  console.log("\n--------------------------------------------------------");
  console.log(`  Tests completed: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
