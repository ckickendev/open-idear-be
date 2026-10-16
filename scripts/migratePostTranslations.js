/**
 * =============================================================================
 *  MIGRATION SCRIPT — POST TRANSLATIONS (SPRINT 1 - BILINGUAL ARCHITECTURE)
 *  scripts/migratePostTranslations.js
 *
 *  Design Decisions:
 *  - Safely backfills existing monolingual Post records into the PostTranslation collection.
 *  - Non-destructive: Leaves existing Post documents and fields 100% intact.
 *  - Idempotent: Uses findOne / upsert logic to ensure re-running never creates duplicates.
 *  - Vietnamese Content Detection: Inspects titles and text for Vietnamese diacritics
 *    to accurately categorize legacy articles instead of blindly marking everything as 'en'.
 *  - Diagnostic Reporting: Detects slug collisions, empty content, and missing fields.
 *  - Safe execution: Supports `--dry-run` flag. Defaults to dry-run unless `--write` is specified.
 * =============================================================================
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Post, PostTranslation } = require("../models");

// Regex matching Vietnamese tone marks and special characters (đ, â, ă, ê, ô, ơ, ư, etc.)
const VIETNAMESE_DIACRITICS_REGEX = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

function detectLanguage(title = "", content = "", text = "") {
  const sample = `${title} ${text.substring(0, 500)} ${content.substring(0, 500)}`;
  const matches = sample.match(new RegExp(VIETNAMESE_DIACRITICS_REGEX, "gi"));
  // If at least 3 Vietnamese diacritic occurrences are found, classify as Vietnamese
  if (matches && matches.length >= 3) {
    return "vi";
  }
  return "en";
}

async function migratePostTranslations() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || !args.includes("--write");

  console.log("=================================================================");
  console.log(`🚀 Starting PostTranslation Backfill Migration ${isDryRun ? "[DRY RUN MODE — NO WRITES]" : "[WRITE MODE]"}`);
  console.log("=================================================================");

  const mongoUri =
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/open-idear";

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ Connected to MongoDB successfully.\n");

    const posts = await Post.find({ del_flag: 0 }).sort({ createdAt: 1 });
    console.log(`Found ${posts.length} active post(s) to inspect.\n`);

    const stats = {
      scanned: posts.length,
      detectedEn: 0,
      detectedVi: 0,
      alreadyMigrated: 0,
      toMigrate: 0,
      skippedEmpty: 0,
      slugCollisions: 0,
      errors: 0,
    };

    const seenSlugsByLocale = {
      en: new Set(),
      vi: new Set(),
    };

    // Pre-populate existing translation slugs to diagnose collisions
    const existingTranslations = await PostTranslation.find({}, { locale: 1, slug: 1, postId: 1 }).lean();
    for (const t of existingTranslations) {
      if (seenSlugsByLocale[t.locale]) {
        seenSlugsByLocale[t.locale].add(t.slug);
      }
    }

    const migrationBatch = [];

    for (const post of posts) {
      const title = (post.title || "").trim();
      const rawContent = (post.content || post.text || "").trim();
      const rawText = (post.text || post.content || "").trim();
      const slug = (post.slug || "").trim().toLowerCase();

      // Check for empty content
      if (!title || !rawContent) {
        console.warn(`⚠️  [SKIP EMPTY] Post ID "${post._id}" is missing title or content.`);
        stats.skippedEmpty++;
        continue;
      }

      // Check if this post already has a translation in PostTranslation
      const existingForPost = existingTranslations.filter(
        (t) => t.postId.toString() === post._id.toString()
      );

      if (existingForPost.length > 0) {
        stats.alreadyMigrated++;
        continue;
      }

      // Detect language
      const detectedLocale = detectLanguage(title, rawContent, rawText);
      if (detectedLocale === "vi") {
        stats.detectedVi++;
      } else {
        stats.detectedEn++;
      }

      // Check for slug collision within the target locale
      if (seenSlugsByLocale[detectedLocale].has(slug)) {
        console.warn(
          `⚠️  [SLUG COLLISION] Slug "${slug}" already exists for locale "${detectedLocale}" (Post ID: ${post._id}).`
        );
        stats.slugCollisions++;
      } else {
        seenSlugsByLocale[detectedLocale].add(slug);
      }

      const translationDoc = {
        postId: post._id,
        locale: detectedLocale,
        title,
        slug,
        description: (post.description || "").trim(),
        content: post.content || rawText,
        text: post.text || title,
        contentVersion: post.contentVersion || "html-v1",
        blocks: Array.isArray(post.blocks) && post.blocks.length > 0 ? post.blocks : undefined,
        hero: post.hero || undefined,
        aiContext: post.aiContext || undefined,
        seo: post.seo || undefined,
        published: Boolean(post.published),
        publishedAt: post.published ? post.updatedAt || post.createdAt : null,
        readtime: post.readtime || 0,
        currentVersionId: post.currentVersionId || undefined,
      };

      migrationBatch.push({
        post,
        translationDoc,
      });
      stats.toMigrate++;
    }

    console.log("-----------------------------------------------------------------");
    console.log("📊 Migration Pre-Check Summary:");
    console.log(`   - Total Posts Scanned        : ${stats.scanned}`);
    console.log(`   - Already Migrated           : ${stats.alreadyMigrated}`);
    console.log(`   - Pending Migration          : ${stats.toMigrate}`);
    console.log(`   - Classified as English (en) : ${stats.detectedEn}`);
    console.log(`   - Classified as Vietnamese (vi): ${stats.detectedVi}`);
    console.log(`   - Skipped (Empty / Missing)  : ${stats.skippedEmpty}`);
    console.log(`   - Slug Collisions Detected   : ${stats.slugCollisions}`);
    console.log("-----------------------------------------------------------------\n");

    if (isDryRun) {
      console.log("ℹ️  [DRY RUN COMPLETE] Zero database writes performed.");
      console.log("   To execute changes against the database, run with: npm run migrate:translations");
      await mongoose.disconnect();
      process.exit(0);
    }

    // Execute writes in idempotent mode
    console.log("Writing translation records to database...");
    let writeSuccessCount = 0;

    for (const item of migrationBatch) {
      try {
        const { post, translationDoc } = item;

        // Idempotent upsert by { postId, locale }
        await PostTranslation.findOneAndUpdate(
          { postId: translationDoc.postId, locale: translationDoc.locale },
          { $setOnInsert: translationDoc },
          { upsert: true, new: true }
        );

        // Update parent Post with defaultLocale and availableLocales
        await Post.findByIdAndUpdate(post._id, {
          $set: {
            defaultLocale: translationDoc.locale,
          },
          $addToSet: {
            availableLocales: translationDoc.locale,
          },
        });

        writeSuccessCount++;
      } catch (writeErr) {
        console.error(`❌ [ERROR] Failed to write translation for Post ID ${item.post._id}:`, writeErr.message);
        stats.errors++;
      }
    }

    console.log(`\n✅ [MIGRATION COMPLETE] Successfully migrated ${writeSuccessCount} post(s).`);
    if (stats.errors > 0) {
      console.warn(`⚠️ Encountered ${stats.errors} error(s) during write operations.`);
    }

    await mongoose.disconnect();
    process.exit(stats.errors > 0 ? 1 : 0);
  } catch (err) {
    console.error("❌ Fatal Migration Error:", err.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

if (require.main === module) {
  migratePostTranslations();
}

module.exports = {
  detectLanguage,
  migratePostTranslations,
  runMigration: migratePostTranslations,
};
