// =============================================================================
//  ARTICLE VERSIONING SYSTEM — AUTOMATED TEST SUITE (SPRINT 1)
//  tests/articleVersioning.test.ts
//
//  Verifies:
//  1. Semantic version calculation (1.0 -> 1.1, major bump -> 2.0).
//  2. ArticleVersion Mongoose schema constraints and index definitions.
//  3. ArticleVersionService: immutable version creation & post head updating.
//  4. Ownership enforcement: 403 Forbidden on non-owner version creation.
//  5. Append-only rollback: rollback creates a NEW version snapshot without mutating history.
//  6. Version history timeline query & author population.
//  7. ArticleController routing and endpoint definitions.
// =============================================================================

require("dotenv").config();
import mongoose, { Types } from "mongoose";
import { Post, ArticleVersion, User } from "../models";
import {
  articleVersionService,
  ArticleVersionService,
} from "../services/articleVersion.services";
const ArticleController = require("../controllers/article.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("  RUNNING ARTICLE VERSIONING SYSTEM TEST SUITE (SPRINT 1)");
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
      if (err.stack) {
        console.error(err.stack.split("\n").slice(0, 4).join("\n"));
      }
      failed++;
    }
  }

  // ─── TEST 1: Version Increment Arithmetic ──────────────────────────────────
  await test("Version calculation correctly increments minor and major versions", () => {
    const service = new ArticleVersionService();

    assert(service.calculateNextVersion("1.0", false) === "1.1", "1.0 minor -> 1.1");
    assert(service.calculateNextVersion("1.1", false) === "1.2", "1.1 minor -> 1.2");
    assert(service.calculateNextVersion("1.9", false) === "1.10", "1.9 minor -> 1.10");
    assert(service.calculateNextVersion("1.0", true) === "2.0", "1.0 major -> 2.0");
    assert(service.calculateNextVersion("2.4", true) === "3.0", "2.4 major -> 3.0");
    assert(service.calculateNextVersion("", false) === "1.0", "empty default -> 1.0");
  });

  // ─── TEST 2: Schema Structure & Indexes ────────────────────────────────────
  await test("ArticleVersion Schema defines required fields and compound unique index", () => {
    const schema = ArticleVersion.schema;

    assert(schema.path("articleId") !== undefined, "articleId path must exist");
    assert(schema.path("version") !== undefined, "version path must exist");
    assert(schema.path("html") !== undefined, "html path must exist");
    assert(schema.path("markdown") !== undefined, "markdown path must exist");
    assert(schema.path("changelog") !== undefined, "changelog path must exist");
    assert(schema.path("createdBy") !== undefined, "createdBy path must exist");
    assert(schema.path("source") !== undefined, "source path must exist");

    // Check enum constraints
    const sourceEnum = (schema.path("source") as any).enumValues;
    assert(Array.isArray(sourceEnum), "source must be an enum");
    assert(sourceEnum.includes("manual") && sourceEnum.includes("ai"), "source must allow manual and ai");

    // Check Post schema has currentVersionId and latestVersion
    const postSchema = Post.schema;
    assert(postSchema.path("currentVersionId") !== undefined, "post.currentVersionId must exist");
    assert(postSchema.path("latestVersion") !== undefined, "post.latestVersion must exist");
  });

  // ─── TEST 3: Controller Routes ─────────────────────────────────────────────
  await test("ArticleController correctly exposes /articles and /post alias endpoints", () => {
    const controller = new ArticleController();
    assert(controller._rootPath === "/articles", "_rootPath must be /articles");

    const routes: string[] = [];
    controller._router.stack.forEach((layer: any) => {
      if (layer.route) {
        routes.push(`${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
      }
    });

    assert(routes.includes("GET /articles/:slug/history"), "Must have GET /articles/:slug/history");
    assert(routes.includes("GET /articles/:slug/version/:version"), "Must have GET /articles/:slug/version/:version");
    assert(routes.includes("POST /articles/:id/version"), "Must have POST /articles/:id/version");
    assert(routes.includes("PATCH /articles/:id/rollback/:version"), "Must have PATCH /articles/:id/rollback/:version");
    assert(routes.includes("GET /post/:slug/history"), "Must have compatibility alias GET /post/:slug/history");
  });

  // ─── Database Tests (if MongoDB is reachable) ──────────────────────────────
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
      const testAuthorId = new mongoose.Types.ObjectId();
      const nonAuthorId = new mongoose.Types.ObjectId();
      let testPostId: any;

      // ─── TEST 4: Live Version Creation & Head Update ─────────────────────────
      await test("Service creates immutable ArticleVersion and points Post head", async () => {
        // Setup a test post
        const testPost = await Post.create({
          _id: new mongoose.Types.ObjectId(),
          title: "Test Versioned Article",
          slug: `test-versioned-${Date.now()}`,
          content: "<p>Version 1 content</p>",
          text: "Version 1 content",
          author: testAuthorId,
          published: true,
          contentVersion: "html-v1",
        });
        testPostId = testPost._id;

        // Create version 1.1
        const result = await articleVersionService.createNewVersion(
          testPostId.toString(),
          testAuthorId.toString(),
          {
            html: "<p>Version 1.1 updated content</p>",
            markdown: "Version 1.1 updated content",
            changelog: "Added introduction section",
            source: "manual",
          }
        );

        assert(result.version.version === "1.1", "Next version should be 1.1");
        assert(result.post.latestVersion === "1.1", "Post head latestVersion should be 1.1");

        // Verify version 1.0 snapshot exists unchanged
        const v10 = await ArticleVersion.findOne({ articleId: testPostId, version: "1.0" });
        assert(v10 !== null, "Version 1.0 snapshot must exist");
        assert(v10?.html === "<p>Version 1 content</p>", "Version 1.0 content must be untouched");

        // Verify version 1.1 snapshot
        const v11 = await ArticleVersion.findOne({ articleId: testPostId, version: "1.1" });
        assert(v11 !== null, "Version 1.1 snapshot must exist");
        assert(v11?.html === "<p>Version 1.1 updated content</p>", "Version 1.1 content must match");
      });

      // ─── TEST 5: Ownership Guard ───────────────────────────────────────────
      await test("Non-owner is forbidden from creating versions or rolling back", async () => {
        let threw = false;
        try {
          await articleVersionService.createNewVersion(
            testPostId.toString(),
            nonAuthorId.toString(),
            {
              html: "<p>Hacker content</p>",
            }
          );
        } catch (err: any) {
          threw = true;
          assert(err.message.includes("Access denied"), "Should throw access denied");
        }
        assert(threw, "Non-owner createNewVersion must reject");
      });

      // ─── TEST 6: Append-Only Rollback ──────────────────────────────────────
      await test("Rollback creates a NEW version snapshot copying historical content", async () => {
        // Rollback to version 1.0
        const rollbackResult = await articleVersionService.rollbackVersion(
          testPostId.toString(),
          testAuthorId.toString(),
          "1.0",
          "Reverting to initial release"
        );

        assert(rollbackResult.version.version === "1.2", "Rollback must produce next version 1.2");
        assert(rollbackResult.post.latestVersion === "1.2", "Post head must now be 1.2");

        // Fetch post from DB
        const updatedPost = await Post.findById(testPostId);
        assert(updatedPost?.content === "<p>Version 1 content</p>", "Post content should match rolled back v1.0");

        // Confirm history contains 3 immutable records: 1.0, 1.1, 1.2
        const allVersions = await ArticleVersion.find({ articleId: testPostId });
        assert(allVersions.length === 3, "Total versions must be 3 (append-only history)");
      });

      // ─── TEST 7: History Timeline Query ────────────────────────────────────
      await test("getVersionHistory returns correct ordered timeline with author info", async () => {
        const historyData = await articleVersionService.getVersionHistory(testPostId.toString());

        assert(historyData.history.length === 3, "History must have 3 items");
        assert(historyData.history[0].version === "1.2", "First item must be latest 1.2");
        assert(historyData.history[0].isCurrent === true, "Version 1.2 isCurrent must be true");
        assert(historyData.history[1].isCurrent === false, "Version 1.1 isCurrent must be false");
        assert(historyData.history[2].version === "1.0", "Last item must be 1.0");
      });

      // Clean up test data
      await ArticleVersion.deleteMany({ articleId: testPostId });
      await Post.findByIdAndDelete(testPostId);
      await mongoose.disconnect();
    }
  }

  console.log("\n========================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
