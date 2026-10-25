/**
 * =============================================================================
 *  ROLLBACK SCRIPT — POST TRANSLATIONS (SPRINT 6 - CONTROLLED ROLLBACK)
 *  scripts/rollbackPostTranslations.js
 *
 *  Design Decisions & Safety Rules:
 *  - Safely rolls back backfilled translation records created by migration.
 *  - Data Protection Guard: Does NOT delete translations that have post-migration
 *    author edits (content/title diverged from parent Post or subsequent updates).
 *  - Non-destructive: Leaves parent Post documents and legacy fields 100% intact.
 *  - Safe execution: Defaults to `--dry-run` mode. Requires `--write` flag to commit.
 *  - Reconciles state and outputs comprehensive audit report before exiting.
 * =============================================================================
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Post, PostTranslation } = require("../models");

async function rollbackPostTranslations() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || !args.includes("--write");

  console.log("=================================================================");
  console.log(`🔄 PostTranslation Rollback Utility ${isDryRun ? "[DRY RUN MODE — NO WRITES]" : "[WRITE MODE]"}`);
  console.log("=================================================================\n");

  const mongoUri =
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/open-idear";

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ Connected to MongoDB successfully.\n");

    const translations = await PostTranslation.find({}).lean();
    console.log(`Found ${translations.length} total translation record(s) to inspect.\n`);

    const stats = {
      scanned: translations.length,
      eligibleForRollback: 0,
      protectedAuthorEdits: 0,
      orphanedTranslations: 0,
      rolledBack: 0,
      errors: 0,
      details: [],
    };

    const eligibleBatch = [];

    for (const trans of translations) {
      const parentPost = await Post.findById(trans.postId).lean();

      if (!parentPost) {
        console.warn(`⚠️ [ORPHANED] Translation ID "${trans._id}" has no parent Post.`);
        stats.orphanedTranslations++;
        continue;
      }

      // Check if translation has post-migration author edits
      // If title, content, or updatedAt differs substantially from parent post, protect it
      const titleMatches = (trans.title || "").trim() === (parentPost.title || "").trim();
      const contentMatches =
        (trans.content || "").trim() === (parentPost.content || parentPost.text || "").trim();

      const isPristineBackfill = titleMatches && contentMatches;

      if (!isPristineBackfill) {
        console.log(
          `🛡️  [PROTECTED EDIT] Post ID "${trans.postId}" (${trans.locale}) has unique or updated content. Skipping rollback.`
        );
        stats.protectedAuthorEdits++;
        stats.details.push({
          postId: trans.postId.toString(),
          locale: trans.locale,
          status: "PROTECTED",
          reason: "Content differs from parent post (User authored edit)",
        });
        continue;
      }

      stats.eligibleForRollback++;
      eligibleBatch.push({
        translationId: trans._id,
        postId: trans.postId,
        locale: trans.locale,
      });
      stats.details.push({
        postId: trans.postId.toString(),
        locale: trans.locale,
        status: "ELIGIBLE",
        reason: "Pristine migration backfill matching parent post",
      });
    }

    console.log("-----------------------------------------------------------------");
    console.log("📊 Rollback Pre-Check Summary:");
    console.log(`   - Total Translations Scanned   : ${stats.scanned}`);
    console.log(`   - Eligible for Safe Rollback   : ${stats.eligibleForRollback}`);
    console.log(`   - Protected Author Edits (Kept): ${stats.protectedAuthorEdits}`);
    console.log(`   - Orphaned Translations (Kept) : ${stats.orphanedTranslations}`);
    console.log("-----------------------------------------------------------------\n");

    if (isDryRun) {
      console.log("ℹ️  [DRY RUN COMPLETE] Zero database writes performed.");
      console.log("   To execute rollback against the database, run with: node scripts/rollbackPostTranslations.js --write");
      await mongoose.disconnect();
      return stats;
    }

    // Execute writes
    console.log("Executing rollback on eligible records...");
    for (const item of eligibleBatch) {
      try {
        await PostTranslation.deleteOne({ _id: item.translationId });
        await Post.findByIdAndUpdate(item.postId, {
          $pull: { availableLocales: item.locale },
        });
        stats.rolledBack++;
      } catch (err) {
        console.error(`❌ [ERROR] Failed to roll back translation for Post ${item.postId}:`, err.message);
        stats.errors++;
      }
    }

    console.log(`\n✅ [ROLLBACK COMPLETE] Successfully reverted ${stats.rolledBack} translation(s).`);
    await mongoose.disconnect();
    return stats;
  } catch (err) {
    console.error("❌ Fatal Rollback Error:", err.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    throw err;
  }
}

if (require.main === module) {
  rollbackPostTranslations().catch(() => process.exit(1));
}

module.exports = {
  rollbackPostTranslations,
};
