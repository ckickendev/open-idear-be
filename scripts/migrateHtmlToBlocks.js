/**
 * =============================================================================
 *  MIGRATION SCRIPT — HTML TO BLOCKS-V1
 *  scripts/migrateHtmlToBlocks.js
 *
 *  Design Decisions:
 *  - Safely migrates existing legacy HTML / Markdown posts to "blocks-v1" format.
 *  - Non-destructive: Preserves original `content` string while populating `blocks` & setting `contentVersion: "blocks-v1"`.
 *  - Supports `--dry-run` flag for safe preview without writing to MongoDB.
 *  - Executable directly via `node scripts/migrateHtmlToBlocks.js`.
 * =============================================================================
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Post } = require("../models");
const { ContentStructureService } = require("../ai/content/contentStructure.service");

async function migrateHtmlToBlocks() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("=================================================================");
  console.log(`🚀 Starting Migration: HTML -> Blocks v1 ${isDryRun ? "[DRY RUN MODE]" : ""}`);
  console.log("=================================================================");

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/open-idear";
  
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log("✅ Connected to MongoDB.");

    // Query posts that are not yet migrated to blocks-v1 or missing blocks array
    const postsToMigrate = await Post.find({
      $or: [
        { contentVersion: { $ne: "blocks-v1" } },
        { blocks: { $exists: false } },
        { blocks: { $eq: null } },
        { blocks: { $size: 0 } },
      ],
    });

    console.log(`\nFound ${postsToMigrate.length} post(s) needing migration to blocks-v1.\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const post of postsToMigrate) {
      const rawContent = post.text || post.content || "";

      if (!rawContent.trim()) {
        console.warn(`[SKIP] Post ID "${post._id}" ("${post.title}") has empty content. Skipping.`);
        skippedCount++;
        continue;
      }

      try {
        // Convert post markdown/HTML string into structured ArticleBlock[]
        const structuredResult = ContentStructureService.buildArticleStructure({
          markdown: rawContent,
        });

        if (!structuredResult.blocks || structuredResult.blocks.length === 0) {
          console.warn(`[WARN] Post ID "${post._id}" ("${post.title}") produced 0 blocks.`);
        }

        if (!isDryRun) {
          post.contentVersion = "blocks-v1";
          post.blocks = structuredResult.blocks;
          await post.save();
        }

        console.log(`[SUCCESS] Migrated post ID "${post._id}" ("${post.title}") → ${structuredResult.blocks.length} block(s).`);
        migratedCount++;
      } catch (err) {
        console.error(`[ERROR] Failed to migrate post ID "${post._id}":`, err.message);
        failedCount++;
      }
    }

    console.log("\n=================================================================");
    console.log("📊 MIGRATION SUMMARY");
    console.log("=================================================================");
    console.log(`Total Scanned : ${postsToMigrate.length}`);
    console.log(`Migrated      : ${migratedCount}`);
    console.log(`Skipped       : ${skippedCount}`);
    console.log(`Failed        : ${failedCount}`);
    console.log(`Mode          : ${isDryRun ? "DRY RUN (No database writes)" : "LIVE EXECUTION"}`);
    console.log("=================================================================\n");

  } catch (error) {
    console.error("❌ Migration failed with critical error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

// Execute migration if called directly from CLI
if (require.main === module) {
  migrateHtmlToBlocks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateHtmlToBlocks };
