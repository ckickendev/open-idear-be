/**
 * =============================================================================
 *  OPENIDEAR — SPRINT 5: TARGETED LEGACY TEST-VIDEO CLEANUP SCRIPT
 *  scripts/cleanupLegacyTestVideos.js
 *
 *  Design Principles & Safety Guardrails:
 *  - Explicit Execution Only: NEVER executes on application startup.
 *  - Safe By Default: Runs in --dry-run mode unless both --apply and --confirm are passed.
 *  - Data Integrity Protection:
 *    * Preserves ALL Course, Chapter, Lesson, Enrollment, and AI records.
 *    * If any active Lesson references a Media record, it is strictly PROTECTED and skipped.
 *  - Targeted Identification:
 *    * Only flags disposable test assets (mock GUIDs, explicit [Test] descriptions, unlinked legacy test stubs).
 *  - Complete Audit Trail:
 *    * Prints a detailed report of scanned, identified, protected, and affected records.
 * =============================================================================
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Media, Lesson, Course } = require("../models");

// Patterns identifying disposable test assets
const TEST_DESCRIPTION_PATTERNS = [
  /^\[Test\]/i,
  /^test video/i,
  /^test-/i,
  /unit test/i,
  /sprint \d test/i,
  /mock video/i,
];

const TEST_IDENTIFIER_PATTERNS = [
  /^guid-test-/i,
  /^guid-mock-/i,
  /^guid-existing-video/i,
  /^guid-new-video/i,
  /^guid-new-container/i,
  /^test_cf_/i,
  /^mock_guid_/i,
];

function isTestVideoAsset(media) {
  const desc = media.description || "";
  const identifier = media.bunnyVideoId || media.url || "";

  const matchesDesc = TEST_DESCRIPTION_PATTERNS.some((p) => p.test(desc));
  const matchesId = TEST_IDENTIFIER_PATTERNS.some((p) => p.test(identifier));
  const isLegacyUnlinkedCf = media.provider === "cloudflare" && (!media.cloudflareId || media.cloudflareId.startsWith("test_"));

  return matchesDesc || matchesId || isLegacyUnlinkedCf;
}

async function runCleanup() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isConfirmed = args.includes("--confirm");
  const isDryRun = !isApply || !isConfirmed;

  console.log("==================================================================");
  console.log(`  OPENIDEAR — LEGACY TEST VIDEO CLEANUP ${isDryRun ? "[DRY RUN PREVIEW]" : "[APPLY MODE]"}`);
  console.log("==================================================================");

  if (isDryRun) {
    console.log("ℹ️  Running in DRY RUN mode. No database records will be modified.");
    console.log("ℹ️  To execute changes, re-run with: node scripts/cleanupLegacyTestVideos.js --apply --confirm\n");
  } else {
    console.log("⚠️  APPLY MODE DETECTED: Confirmed test records will be soft-deleted.\n");
  }

  const mongoUri =
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/open-idear";

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log("✓ Connected to MongoDB.");

    // Query all video media assets
    const videoAssets = await Media.find({
      type: "video",
      del_flag: 0,
    }).lean();

    console.log(`Found ${videoAssets.length} active video record(s) in database.\n`);

    const candidates = [];
    const protectedAssets = [];
    const legitimateAssets = [];

    for (const media of videoAssets) {
      const isTest = isTestVideoAsset(media);

      if (!isTest) {
        legitimateAssets.push(media);
        continue;
      }

      // Check if linked to any active lesson (SAFETY CHECK)
      const linkedLesson = await Lesson.findOne({
        media: media._id,
        del_flag: 0,
      }).lean();

      if (linkedLesson) {
        protectedAssets.push({
          media,
          lessonId: linkedLesson._id,
          lessonTitle: linkedLesson.title,
        });
      } else {
        candidates.push(media);
      }
    }

    // Print Dry-run / Audit Report
    console.log("── Scan & Identification Summary ─────────────────────────────────");
    console.log(`Total video records scanned:       ${videoAssets.length}`);
    console.log(`Legitimate course video assets:    ${legitimateAssets.length}`);
    console.log(`Protected test assets (in lessons): ${protectedAssets.length}`);
    console.log(`Disposable test video candidates:   ${candidates.length}`);
    console.log("──────────────────────────────────────────────────────────────────\n");

    if (protectedAssets.length > 0) {
      console.log("🛡️  PROTECTED ASSETS (Referenced by active lessons — Retained):");
      protectedAssets.forEach((p, idx) => {
        console.log(`  ${idx + 1}. Media ID: ${p.media._id} | Title: "${p.media.description || "N/A"}" | Linked to Lesson: "${p.lessonTitle}" (${p.lessonId})`);
      });
      console.log();
    }

    if (candidates.length === 0) {
      console.log("✓ No disposable test video records found. Database is clean!");
      return { scanned: videoAssets.length, candidates: 0, affected: 0 };
    }

    console.log("🗑️  DISPOSABLE TEST ASSETS IDENTIFIED:");
    candidates.forEach((c, idx) => {
      console.log(`  ${idx + 1}. Media ID: ${c._id} | Provider: ${c.provider} | ID: ${c.bunnyVideoId || c.url} | Title: "${c.description || "Untitled"}"`);
    });
    console.log();

    let affectedCount = 0;
    if (!isDryRun) {
      const candidateIds = candidates.map((c) => c._id);
      const updateResult = await Media.updateMany(
        { _id: { $in: candidateIds } },
        { $set: { del_flag: 1 } }
      );
      affectedCount = updateResult.modifiedCount;
      console.log(`✓ Successfully soft-deleted ${affectedCount} disposable test video record(s).`);
    } else {
      console.log(`[DRY RUN] Would soft-delete ${candidates.length} record(s). Zero records modified.`);
    }

    return {
      scanned: videoAssets.length,
      candidates: candidates.length,
      protectedCount: protectedAssets.length,
      affected: affectedCount,
      isDryRun,
    };
  } catch (err) {
    console.error("Cleanup script error:", err.message);
    throw err;
  } finally {
    await mongoose.disconnect();
    console.log("✓ MongoDB connection closed.");
  }
}

if (require.main === module) {
  runCleanup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  runCleanup,
  isTestVideoAsset,
  TEST_DESCRIPTION_PATTERNS,
  TEST_IDENTIFIER_PATTERNS,
};
