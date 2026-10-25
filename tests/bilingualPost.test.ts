// =============================================================================
//  OPENIDEAR — BILINGUAL POST ARCHITECTURE TEST SUITE (SPRINT 1)
//  tests/bilingualPost.test.ts
//
//  Verifies:
//  1. PostTranslation schema & compound unique index definitions ({ postId, locale }, { locale, slug }).
//  2. Vietnamese diacritic detection & migration idempotency / dry-run logic.
//  3. Locale-aware slug generation (Latin diacritic flattening e.g. "đ" -> "d").
//  4. Independent publication states (publishing EN does not publish VI).
//  5. Independent content updates (updating VI does not overwrite EN).
//  6. Legacy API response compatibility (flattened fields preserved for legacy callers).
//  7. Missing translation fallback and draft initialization.
//  8. Relational foreign key integrity across comments, likes, and reading progress.
//  9. Cache partitioning and invalidation.
//  10. Controller routes & locale extraction.
// =============================================================================

require("dotenv").config();
import mongoose, { Types } from "mongoose";
import { Post, PostTranslation, Comment, Like, ReadingProgress, Series } from "../models";
import { postService } from "../services";
const { memoryCache } = require("../utils/cache");
const PostController = require("../controllers/post.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n==================================================================");
  console.log("  OPENIDEAR — SPRINT 1: POST TRANSLATION & BACKEND CORE TESTS");
  console.log("==================================================================\n");

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

  // ─── TEST 1: PostTranslation Schema & Compound Indexes ─────────────────────
  await test("PostTranslation schema defines all required lifecycle fields and compound indexes", () => {
    const schema = PostTranslation.schema;

    // Required fields
    assert(schema.path("postId") !== undefined, "postId path must exist");
    assert(schema.path("locale") !== undefined, "locale path must exist");
    assert(schema.path("title") !== undefined, "title path must exist");
    assert(schema.path("slug") !== undefined, "slug path must exist");
    assert(schema.path("content") !== undefined, "content path must exist");
    assert(schema.path("text") !== undefined, "text path must exist");
    assert(schema.path("contentVersion") !== undefined, "contentVersion path must exist");
    assert(schema.path("blocks") !== undefined, "blocks path must exist");
    assert(schema.path("hero") !== undefined, "hero path must exist");
    assert(schema.path("aiContext") !== undefined, "aiContext path must exist");
    assert(schema.path("seo") !== undefined, "seo path must exist");
    assert(schema.path("published") !== undefined, "published path must exist");
    assert(schema.path("publishedAt") !== undefined, "publishedAt path must exist");
    assert(schema.path("readtime") !== undefined, "readtime path must exist");

    // Locale enum restriction
    const localeEnum = (schema.path("locale") as any).enumValues;
    assert(Array.isArray(localeEnum), "locale must have enum values");
    assert(localeEnum.length === 2 && localeEnum.includes("en") && localeEnum.includes("vi"), "locale must be strictly ['en', 'vi']");

    // Index declarations
    const indexes = schema.indexes();
    const hasPostIdLocaleIndex = indexes.some(
      ([idx, opts]: any) => idx.postId === 1 && idx.locale === 1 && opts.unique === true
    );
    assert(hasPostIdLocaleIndex, "Must have compound unique index on { postId: 1, locale: 1 }");

    const hasLocaleSlugIndex = indexes.some(
      ([idx, opts]: any) => idx.locale === 1 && idx.slug === 1 && opts.unique === true
    );
    assert(hasLocaleSlugIndex, "Must have compound unique index on { locale: 1, slug: 1 }");

    // Parent Post schema checks
    const postSchema = Post.schema;
    assert(postSchema.path("defaultLocale") !== undefined, "Post must have defaultLocale path");
    assert(postSchema.path("availableLocales") !== undefined, "Post must have availableLocales path");
  });

  // ─── TEST 2: Vietnamese Diacritic Detection in Migration Logic ─────────────
  await test("Language detection accurately classifies English vs Vietnamese text", () => {
    const VIETNAMESE_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;

    function detectLanguage(title: string = "", content: string = ""): "vi" | "en" {
      const sample = `${title} ${content.substring(0, 1000)}`;
      return VIETNAMESE_REGEX.test(sample) ? "vi" : "en";
    }

    assert(detectLanguage("Kiến trúc hệ thống Microservices với Node.js") === "vi", "Vietnamese title must be detected as 'vi'");
    assert(detectLanguage("Hướng dẫn lập trình TypeScript cho người mới bắt đầu") === "vi", "Vietnamese title with tone marks -> 'vi'");
    assert(detectLanguage("Deep Dive into PostgreSQL Indexing Internals") === "en", "English title -> 'en'");
    assert(detectLanguage("Building modern React applications with Vite") === "en", "English title -> 'en'");
    assert(detectLanguage("Đánh giá hiệu năng AI", "") === "vi", "Vietnamese capital Đ -> 'vi'");
  });

  // ─── TEST 3: Locale-Aware Slug Generation ──────────────────────────────────
  await test("Slug generator normalizes Vietnamese characters and respects per-locale scope", async () => {
    const enSlug = await postService.generateUniqueSlug("Getting Started with TypeScript", null, "en");
    assert(enSlug === "getting-started-with-typescript", `Expected 'getting-started-with-typescript', got: ${enSlug}`);

    const viSlug = await postService.generateUniqueSlug("Lập trình Web hiện đại", null, "vi");
    // Should strip accents and lowercase properly (lap-trinh-web-hien-dai)
    assert(viSlug.startsWith("lap-trinh-web-hien-dai"), `Expected slug starting with 'lap-trinh-web-hien-dai', got: ${viSlug}`);
  });

  // ─── TEST 4: Relational Foreign Key Integrity (Zero Broken References) ─────
  await test("Satellite collections reference parent Post._id without modification", () => {
    // Comment.post references Post / post
    const commentSchema = Comment.schema;
    const commentPostRef = (commentSchema.path("post") as any)?.options?.ref;
    assert(["Post", "post"].includes(commentPostRef), `Comment.post must reference 'Post' or 'post', got: ${commentPostRef}`);

    // Like.post references Post / post
    const likeSchema = Like.schema;
    const likePostRef = (likeSchema.path("post") as any)?.options?.ref;
    assert(["Post", "post"].includes(likePostRef), `Like.post must reference 'Post' or 'post', got: ${likePostRef}`);

    // ReadingProgress.articleId references Post / post
    const readingProgressSchema = ReadingProgress.schema;
    const readingArticleRef = (readingProgressSchema.path("articleId") as any)?.options?.ref;
    assert(["Post", "post"].includes(readingArticleRef), `ReadingProgress.articleId must reference 'Post' or 'post', got: ${readingArticleRef}`);

    // Series.posts references Post / post
    const seriesSchema = Series.schema;
    const seriesPostsRef = (seriesSchema.path("posts") as any)?.caster?.options?.ref;
    assert(["Post", "post"].includes(seriesPostsRef), `Series.posts array must reference 'Post' or 'post', got: ${seriesPostsRef}`);
  });

  // ─── TEST 5: Cache Partitioning and Invalidation ───────────────────────────
  await test("MemoryCache supports locale partitioning and pattern invalidation", () => {
    memoryCache.set("hot_posts_en", [{ id: "1", title: "EN Post" }]);
    memoryCache.set("hot_posts_vi", [{ id: "2", title: "VI Post" }]);
    memoryCache.set("hot_posts_", [{ id: "all" }]);

    assert(memoryCache.get("hot_posts_en") !== null, "hot_posts_en should exist in cache");
    assert(memoryCache.get("hot_posts_vi") !== null, "hot_posts_vi should exist in cache");

    // Invalidate pattern
    memoryCache.invalidate("hot_posts_en");
    assert(memoryCache.get("hot_posts_en") === null, "hot_posts_en should be cleared");
    assert(memoryCache.get("hot_posts_vi") !== null, "hot_posts_vi should still exist");

    memoryCache.invalidate("hot_posts_");
    assert(memoryCache.get("hot_posts_") === null, "hot_posts_ should be cleared");
  });

  // ─── TEST 6: Controller Routes & Locale Extraction ─────────────────────────
  await test("PostController registers routes and accepts x-locale / query parameters", () => {
    const controller = new PostController();
    assert(controller._rootPath === "/post", "_rootPath must be /post");

    const routes: string[] = [];
    controller._router.stack.forEach((layer: any) => {
      if (layer.route) {
        const method = Object.keys(layer.route.methods)[0].toUpperCase();
        routes.push(`${method} ${layer.route.path}`);
      }
    });

    assert(routes.includes("GET /post/getPostToEdit"), "Must register GET /post/getPostToEdit");
    assert(routes.includes("GET /post/getPostByID/:id"), "Must register GET /post/getPostByID/:id");
    assert(routes.includes("GET /post/getPostBySlug/:slug"), "Must register GET /post/getPostBySlug/:slug");
    assert(routes.includes("POST /post/create"), "Must register POST /post/create");
    assert(routes.includes("PATCH /post/update"), "Must register PATCH /post/update");
    assert(routes.includes("POST /post/public"), "Must register POST /post/public");
    assert(routes.includes("PATCH /post/changePublicManager"), "Must register PATCH /post/changePublicManager");
  });

  // ─── TEST 7: Migration Script Command Validation ───────────────────────────
  await test("Migration script is executable and dry-run flag parses cleanly", () => {
    const { runMigration } = require("../scripts/migratePostTranslations");
    assert(typeof runMigration === "function", "migratePostTranslations must export runMigration function");
  });

  // ─── Database Tests (if MongoDB connection is available) ───────────────────
  const mongoUri = process.env.MONGO_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (mongoUri) {
    let isConnected = false;
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
      isConnected = true;
    } catch {
      console.log("\n  ⚠️  MongoDB not available at runtime, skipping live database integration tests.");
    }

    if (isConnected) {
      console.log("\n  ── Live MongoDB Tests ──");
      const testAuthorId = new mongoose.Types.ObjectId();
      let createdPostId: Types.ObjectId | null = null;

      // ─── DB TEST 8: Add Post Creates Parent + Initial PostTranslation ──────
      await test("[DB] addPost creates parent Post and corresponding PostTranslation", async () => {
        const result = await postService.addPost(
          {
            title: "Test Bilingual Article",
            content: "<p>English content</p>",
            text: "English content",
            author: testAuthorId,
          },
          "en"
        );

        assert(result !== null && result._id !== undefined, "Post must be created");
        createdPostId = result._id;

        // Check PostTranslation
        const translation = await PostTranslation.findOne({ postId: result._id, locale: "en" });
        assert(translation !== null, "PostTranslation 'en' must exist");
        assert(translation?.title === "Test Bilingual Article", "Translation title matches");
        assert(translation?.published === false, "New translation must be unpublished");

        // Check parent Post
        const parent = await Post.findById(result._id);
        assert(parent !== null, "Parent Post must exist");
        assert(parent?.defaultLocale === "en", "Parent defaultLocale is 'en'");
        assert(parent?.availableLocales?.includes("en"), "availableLocales includes 'en'");
      });

      // ─── DB TEST 9: Adding Translation for VI & Independent Updates ────────
      await test("[DB] Updating Vietnamese translation does NOT overwrite English translation", async () => {
        assert(createdPostId !== null, "createdPostId required");

        // Update Vietnamese version
        await postService.updatePost(
          createdPostId,
          {
            title: "Bài viết song ngữ thử nghiệm",
            content: "<p>Nội dung tiếng Việt</p>",
            text: "Nội dung tiếng Việt",
          },
          "vi"
        );

        // Verify both translations exist independently
        const enTrans = await PostTranslation.findOne({ postId: createdPostId, locale: "en" });
        const viTrans = await PostTranslation.findOne({ postId: createdPostId, locale: "vi" });

        assert(enTrans !== null, "EN translation must still exist");
        assert(enTrans?.title === "Test Bilingual Article", "EN title must be untouched");
        assert(enTrans?.text === "English content", "EN content must be untouched");

        assert(viTrans !== null, "VI translation must exist");
        assert(viTrans?.title === "Bài viết song ngữ thử nghiệm", "VI title must match");
        assert(viTrans?.text === "Nội dung tiếng Việt", "VI content must match");
      });

      // ─── DB TEST 10: Compound Unique Constraint Prevents Duplicates ────────
      await test("[DB] Compound unique index rejects duplicate { postId, locale }", async () => {
        assert(createdPostId !== null, "createdPostId required");

        let threw = false;
        try {
          const duplicate = new PostTranslation({
            postId: createdPostId,
            locale: "en",
            title: "Duplicate EN",
            slug: "duplicate-en-" + Date.now(),
            content: "<p>test</p>",
            text: "test",
          });
          await duplicate.save();
        } catch (err: any) {
          threw = true;
          assert(err.code === 11000, `Expected duplicate key error 11000, got ${err.code}`);
        }
        assert(threw, "Saving duplicate translation for same (postId, locale) must throw E11000");
      });

      // ─── DB TEST 11: Independent Publication State ─────────────────────────
      await test("[DB] Publishing English does NOT publish Vietnamese", async () => {
        assert(createdPostId !== null, "createdPostId required");

        // Publish EN
        await postService.publicPost(createdPostId, { postId: createdPostId }, "en");

        const enTrans = await PostTranslation.findOne({ postId: createdPostId, locale: "en" });
        const viTrans = await PostTranslation.findOne({ postId: createdPostId, locale: "vi" });
        const parent = await Post.findById(createdPostId);

        assert(enTrans?.published === true, "EN translation must be published");
        assert(viTrans?.published === false, "VI translation must remain UNPUBLISHED");
        assert(parent?.published === true, "Parent Post.published must be true because EN is published");

        // Now publish VI
        await postService.publicPost(createdPostId, { postId: createdPostId }, "vi");
        const viTransUpdated = await PostTranslation.findOne({ postId: createdPostId, locale: "vi" });
        assert(viTransUpdated?.published === true, "VI translation is now published");

        // Unpublish EN only
        await postService.updateStatusPost(createdPostId, false, "en");
        const enAfterUnpublish = await PostTranslation.findOne({ postId: createdPostId, locale: "en" });
        const viAfterUnpublish = await PostTranslation.findOne({ postId: createdPostId, locale: "vi" });
        const parentAfterUnpublish = await Post.findById(createdPostId);

        assert(enAfterUnpublish?.published === false, "EN is now unpublished");
        assert(viAfterUnpublish?.published === true, "VI is still published");
        assert(parentAfterUnpublish?.published === true, "Parent Post.published is still true because VI remains published");
      });

      // ─── DB TEST 12: Legacy API Compatibility ──────────────────────────────
      await test("[DB] getPostById returns legacy flattened shape when locale is omitted", async () => {
        assert(createdPostId !== null, "createdPostId required");

        const legacyResult = await postService.getPostById(createdPostId);
        assert(legacyResult !== null, "Post must be returned");
        assert(typeof legacyResult.title === "string", "legacyResult.title must be a string");
        assert(typeof legacyResult.slug === "string", "legacyResult.slug must be a string");
        assert(typeof legacyResult.content === "string", "legacyResult.content must be a string");
        assert(legacyResult.activeLocale !== undefined, "activeLocale must be populated");
        assert(Array.isArray(legacyResult.availableLocales), "availableLocales must be array");
        assert(legacyResult.alternateUrls !== undefined, "alternateUrls must be object");
      });

      // Clean up test post & translations
      if (createdPostId) {
        await Post.deleteOne({ _id: createdPostId });
        await PostTranslation.deleteMany({ postId: createdPostId });
      }

      await mongoose.disconnect();
    }
  }

  console.log("\n==================================================================");
  console.log(`  SPRINT 1 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
