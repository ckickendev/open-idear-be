/**
 * =============================================================================
 *  MIGRATION SCRIPT — ARTICLE VERSIONING (SPRINT 1)
 *  scripts/migrateArticleVersioning.js
 *
 *  Design Decisions:
 *  - Migrates all existing Post records to initialize ArticleVersion v1.0.
 *  - Non-destructive: preserves existing post content, blocks, and timestamps.
 *  - Strictly idempotent: will not create duplicate version snapshots.
 *  - Supports `--dry-run` flag for previewing changes without writing to DB.
 *  - Executable directly: `npm run migrate:versions` or `node scripts/migrateArticleVersioning.js`.
 * =============================================================================
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Post, ArticleVersion } = require("../models");

async function migrateArticleVersioning() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("=================================================================");
  console.log(`🚀 Starting Article Versioning Migration ${isDryRun ? "[DRY RUN MODE]" : ""}`);
  console.log("=================================================================");

  const mongoUri =
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/open-idear";

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ Connected to MongoDB successfully.");

    // Find posts needing version initialization
    const posts = await Post.find({
      $or: [
        { currentVersionId: { $exists: false } },
        { currentVersionId: null },
      ],
    });

    console.log(`\nFound ${posts.length} post(s) needing version initialization.\n`);

    let createdCount = 0;
    let linkedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const post of posts) {
      try {
        const title = post.title || "Untitled";
        const content = post.content || post.text || "";

        if (!post.author) {
          console.warn(`[SKIP] Post ID "${post._id}" ("${title}") has no author. Skipping.`);
          skippedCount++;
          continue;
        }

        // Check if v1.0 already exists
        let versionDoc = await ArticleVersion.findOne({
          articleId: post._id,
          version: "1.0",
        });

        if (!versionDoc) {
          if (!isDryRun) {
            versionDoc = await ArticleVersion.create({
              articleId: post._id,
              version: "1.0",
              markdown: post.text || content,
              html: post.content || content,
              blocks: post.blocks || undefined,
              changelog: "Initial version migration",
              createdBy: post.author,
              source: "manual",
              createdAt: post.createdAt || new Date(),
            });
          }
          createdCount++;
          console.log(`[CREATE] Post ID "${post._id}" ("${title}") -> Created ArticleVersion 1.0`);
        } else {
          linkedCount++;
          console.log(`[LINK] Post ID "${post._id}" ("${title}") -> Existing ArticleVersion 1.0 found.`);
        }

        if (!isDryRun && versionDoc) {
          post.currentVersionId = versionDoc._id;
          post.latestVersion = "1.0";
          await post.save();
        }
      } catch (err) {
        console.error(`[ERROR] Failed to migrate post ID "${post._id}":`, err.message);
        errorCount++;
      }
    }

    console.log("\n=================================================================");
    console.log("🏁 Migration Complete Summary:");
    console.log(` - Total posts examined:  ${posts.length}`);
    console.log(` - New versions created:  ${createdCount}`);
    console.log(` - Existing versions linked: ${linkedCount}`);
    console.log(` - Skipped posts:         ${skippedCount}`);
    console.log(` - Errors encountered:    ${errorCount}`);
    console.log("=================================================================\n");
  } catch (err) {
    console.error("❌ Fatal MongoDB migration connection error:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from MongoDB.");
  }
}

migrateArticleVersioning();
