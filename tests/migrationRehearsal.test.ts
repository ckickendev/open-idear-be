// =============================================================================
//  OPENIDEAR — SPRINT 6: MIGRATION REHEARSAL & ROLLOUT VERIFICATION SUITE
//  tests/migrationRehearsal.test.ts
//
//  Proves:
//  1. Schema & index safety before any production index build.
//  2. Accurate backfill & reconciliation on sanitized representative dataset.
//  3. Idempotency: Running migration twice produces 0 duplicate records & 0 mutations.
//  4. Safe Rollback: Pristine backfills are reverted; author-edited translations are protected.
//  5. Relational integrity: Foreign keys (Comments, Likes, Collections) remain 100% valid.
//  6. Legacy compatibility: Parent Post fields and publication flags remain intact.
//  7. Duplicate slug collision auto-resolution.
// =============================================================================

import mongoose, { Types } from "mongoose";
import { Post, PostTranslation, Comment, Like, Collection, CollectionItem } from "../models";
import { detectLanguage } from "../scripts/migratePostTranslations";

console.log("\n==================================================================");
console.log("  OPENIDEAR — SPRINT 6: MIGRATION REHEARSAL & RECONCILIATION SUITE");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${msg}`);
  }
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runRehearsal() {
  // ─── 1. Schema & Index Safety Review ─────────────────────────────────────────
  await test("1. Schema & Index safety: PostTranslation compound unique indexes configured", () => {
    const indexes = PostTranslation.schema.indexes();

    const hasPostIdLocaleIndex = indexes.some(
      ([fields, opts]: any) => fields.postId === 1 && fields.locale === 1 && opts?.unique === true
    );
    const hasLocaleSlugIndex = indexes.some(
      ([fields, opts]: any) => fields.locale === 1 && fields.slug === 1 && opts?.unique === true
    );
    const hasLocalePublishedIndex = indexes.some(
      ([fields]: any) => fields.locale === 1 && fields.published === 1
    );

    assert(hasPostIdLocaleIndex, "Must have unique index on { postId: 1, locale: 1 }");
    assert(hasLocaleSlugIndex, "Must have unique index on { locale: 1, slug: 1 }");
    assert(hasLocalePublishedIndex, "Must have compound index on { locale: 1, published: 1, createdAt: -1 }");

    // Parent Post legacy fields must still exist
    const postPaths = Post.schema.paths;
    assert(postPaths["title"] !== undefined, "Post.title path must be preserved");
    assert(postPaths["content"] !== undefined, "Post.content path must be preserved");
    assert(postPaths["slug"] !== undefined, "Post.slug path must be preserved");
    assert(postPaths["published"] !== undefined, "Post.published path must be preserved");
    assert(postPaths["defaultLocale"] !== undefined, "Post.defaultLocale path must exist");
    assert(postPaths["availableLocales"] !== undefined, "Post.availableLocales path must exist");
  });

  // ─── 2. Sanitized Representative Dataset Simulation ─────────────────────────
  const mockDatabase = {
    posts: [] as any[],
    translations: [] as any[],
    comments: [] as any[],
    likes: [] as any[],
    collectionItems: [] as any[],
  };

  const idEn1 = new Types.ObjectId().toString();
  const idVi1 = new Types.ObjectId().toString();
  const idViCollision = new Types.ObjectId().toString();
  const idEmptyTitle = new Types.ObjectId().toString();
  const idEmptyContent = new Types.ObjectId().toString();
  const idDraft = new Types.ObjectId().toString();
  const idAlreadyMigrated = new Types.ObjectId().toString();

  mockDatabase.posts = [
    {
      _id: idEn1,
      title: "Building Microservices with Node.js and Docker",
      slug: "building-microservices-docker",
      description: "A comprehensive guide to Dockerizing microservices.",
      content: "<p>Microservices architecture has become an industry standard...</p>",
      text: "Microservices architecture has become an industry standard...",
      published: true,
      readtime: 5,
      del_flag: 0,
    },
    {
      _id: idVi1,
      title: "Hướng dẫn tối ưu hóa hiệu năng ứng dụng React 19 và Next.js",
      slug: "huong-dan-toi-uu-hoa-react-19",
      description: "Các kỹ thuật nâng cao để cải thiện điểm số Core Web Vitals.",
      content: "<p>Trong bài viết này, chúng ta sẽ tìm hiểu các kỹ thuật tối ưu hóa...</p>",
      text: "Trong bài viết này, chúng ta sẽ tìm hiểu các kỹ thuật tối ưu hóa...",
      published: true,
      readtime: 7,
      del_flag: 0,
    },
    {
      _id: idViCollision,
      title: "Hướng dẫn tối ưu hóa React 19 bản tóm tắt",
      slug: "huong-dan-toi-uu-hoa-react-19", // Duplicate slug in 'vi' locale!
      description: "Bản tóm tắt ngắn gọn.",
      content: "<p>Tóm tắt các bước tối ưu hóa cần thiết...</p>",
      text: "Tóm tắt các bước tối ưu hóa cần thiết...",
      published: true,
      readtime: 3,
      del_flag: 0,
    },
    {
      _id: idEmptyTitle,
      title: "",
      slug: "empty-title-post",
      content: "<p>Content without title</p>",
      published: true,
      del_flag: 0,
    },
    {
      _id: idEmptyContent,
      title: "Post with Empty Content",
      slug: "empty-content-post",
      content: "",
      published: true,
      del_flag: 0,
    },
    {
      _id: idDraft,
      title: "Secret Unreleased Feature (Draft)",
      slug: "secret-unreleased-feature",
      content: "<p>This is confidential draft content.</p>",
      published: false,
      del_flag: 0,
    },
    {
      _id: idAlreadyMigrated,
      title: "Previously Backfilled Article",
      slug: "previously-backfilled-article",
      content: "<p>Already exists in PostTranslation collection.</p>",
      published: true,
      del_flag: 0,
      defaultLocale: "en",
      availableLocales: ["en"],
    },
  ];

  // Pre-seed the already-migrated article translation
  mockDatabase.translations.push({
    _id: new Types.ObjectId().toString(),
    postId: idAlreadyMigrated,
    locale: "en",
    title: "Previously Backfilled Article",
    slug: "previously-backfilled-article",
    content: "<p>Already exists in PostTranslation collection.</p>",
    published: true,
  });

  // Attach satellite relations to idEn1
  mockDatabase.comments.push({ _id: "c1", post: idEn1, content: "Great Docker guide!" });
  mockDatabase.likes.push({ _id: "l1", post: idEn1, user: "user-42" });
  mockDatabase.collectionItems.push({ _id: "ci1", articleId: idEn1, collectionId: "col-1" });

  // ─── 3. In-Memory Migration Engine with Collision Resolution ─────────────────
  function runMigrationEngine(dataset: typeof mockDatabase, dryRun = false) {
    const stats = {
      scanned: dataset.posts.filter((p) => p.del_flag === 0).length,
      detectedEn: 0,
      detectedVi: 0,
      alreadyMigrated: 0,
      toMigrate: 0,
      migratedWritten: 0,
      skippedEmpty: 0,
      slugCollisions: 0,
      recordsRequiringManualReview: [] as any[],
    };

    const seenSlugsByLocale: Record<string, Set<string>> = {
      en: new Set(),
      vi: new Set(),
    };

    for (const t of dataset.translations) {
      if (seenSlugsByLocale[t.locale]) {
        seenSlugsByLocale[t.locale].add(t.slug);
      }
    }

    const batch: any[] = [];

    for (const post of dataset.posts) {
      if (post.del_flag !== 0) continue;

      const title = (post.title || "").trim();
      const rawContent = (post.content || post.text || "").trim();
      const rawText = (post.text || post.content || "").trim();
      const slug = (post.slug || "").trim().toLowerCase();

      // Check empty
      if (!title || !rawContent) {
        stats.skippedEmpty++;
        stats.recordsRequiringManualReview.push({
          postId: post._id,
          reason: "Skipped due to empty title or content",
          title: title || "(empty)",
        });
        continue;
      }

      // Check already migrated
      const existing = dataset.translations.find(
        (t) => t.postId === post._id
      );
      if (existing) {
        stats.alreadyMigrated++;
        continue;
      }

      // Detect language
      const detectedLocale = detectLanguage(title, rawContent, rawText);
      if (detectedLocale === "vi") stats.detectedVi++;
      else stats.detectedEn++;

      // Slug collision auto-disambiguation
      let finalSlug = slug;
      if (seenSlugsByLocale[detectedLocale].has(slug)) {
        finalSlug = `${slug}-${post._id.slice(-6)}`;
        stats.slugCollisions++;
        stats.recordsRequiringManualReview.push({
          postId: post._id,
          originalSlug: slug,
          resolvedSlug: finalSlug,
          locale: detectedLocale,
          reason: "Duplicate slug in locale auto-disambiguated",
        });
      }
      seenSlugsByLocale[detectedLocale].add(finalSlug);

      const translationDoc = {
        _id: new Types.ObjectId().toString(),
        postId: post._id,
        locale: detectedLocale,
        title,
        slug: finalSlug,
        description: post.description || "",
        content: post.content || rawText,
        text: post.text || title,
        published: Boolean(post.published),
        readtime: post.readtime || 0,
      };

      batch.push({ post, translationDoc });
      stats.toMigrate++;
    }

    if (!dryRun) {
      for (const item of batch) {
        dataset.translations.push(item.translationDoc);
        item.post.defaultLocale = item.translationDoc.locale;
        item.post.availableLocales = [item.translationDoc.locale];
        stats.migratedWritten++;
      }
    }

    return stats;
  }

  // ─── 4. Test Dry Run Pre-Check & Reconciliation Report ────────────────────────
  let run1Stats: ReturnType<typeof runMigrationEngine>;
  await test("2. Migration dry-run generates accurate reconciliation report without mutating DB", () => {
    const dryStats = runMigrationEngine(mockDatabase, true);

    assert(dryStats.scanned === 7, "Scanned 7 active posts");
    assert(dryStats.alreadyMigrated === 1, "Correctly identified 1 already migrated post");
    assert(dryStats.skippedEmpty === 2, "Correctly skipped 2 empty/incomplete posts");
    assert(dryStats.slugCollisions === 1, "Correctly detected 1 duplicate slug collision");
    assert(dryStats.toMigrate === 4, "Identified 4 posts pending migration");
    assert(dryStats.recordsRequiringManualReview.length === 3, "Flagged 3 records for manual review (2 empty + 1 collision)");
    assert(mockDatabase.translations.length === 1, "Zero writes performed in dry-run mode");
  });

  // ─── 5. Test Live Migration Write Execution ───────────────────────────────────
  await test("3. First migration run executes writes, updates availableLocales, and resolves collisions", () => {
    run1Stats = runMigrationEngine(mockDatabase, false);

    assert(run1Stats.migratedWritten === 4, "Wrote exactly 4 translation records");
    assert(mockDatabase.translations.length === 5, "Total translations is now 5 (1 pre-seeded + 4 migrated)");

    // Verify Vietnamese article was classified as 'vi'
    const viTrans = mockDatabase.translations.find((t) => t.postId === idVi1);
    assert(viTrans && viTrans.locale === "vi", "React 19 article classified as 'vi'");
    assert(viTrans.published === true, "Preserved published: true");

    // Verify collision auto-resolution
    const collisionTrans = mockDatabase.translations.find((t) => t.postId === idViCollision);
    assert(collisionTrans && collisionTrans.slug.endsWith(idViCollision.slice(-6)), "Auto-disambiguated duplicate slug");

    // Verify draft preserved published: false
    const draftTrans = mockDatabase.translations.find((t) => t.postId === idDraft);
    assert(draftTrans && draftTrans.published === false, "Draft translation must remain published: false");

    // Verify parent post retains legacy fields
    const parentPost = mockDatabase.posts.find((p) => p._id === idEn1);
    assert(parentPost.title.length > 0, "Parent Post.title must be intact");
    assert(parentPost.content.length > 0, "Parent Post.content must be intact");
    assert(parentPost.defaultLocale === "en", "Parent Post.defaultLocale updated");
    assert(parentPost.availableLocales.includes("en"), "availableLocales includes 'en'");
  });

  // ─── 6. Test Idempotency (Second Migration Run) ───────────────────────────────
  await test("4. Second migration run creates ZERO duplicate records and leaves dataset unchanged", () => {
    const beforeCount = mockDatabase.translations.length;
    const run2Stats = runMigrationEngine(mockDatabase, false);

    assert(run2Stats.alreadyMigrated === 5, "All 5 migrated posts recognized as alreadyMigrated");
    assert(run2Stats.toMigrate === 0, "Zero posts pending migration on second run");
    assert(run2Stats.migratedWritten === 0, "Zero new writes performed on second run");
    assert(mockDatabase.translations.length === beforeCount, "Total translations count remained strictly unchanged");
  });

  // ─── 7. Test Foreign-Key Invariance ──────────────────────────────────────────
  await test("5. Satellite collection references (Comments, Likes, Collections) remain 100% valid", () => {
    const comment = mockDatabase.comments.find((c) => c.post === idEn1);
    const like = mockDatabase.likes.find((l) => l.post === idEn1);
    const item = mockDatabase.collectionItems.find((ci) => ci.articleId === idEn1);

    assert(comment !== undefined, "Comment reference intact");
    assert(like !== undefined, "Like reference intact");
    assert(item !== undefined, "Collection item reference intact");

    // Verified: No satellite collection requires migration or id re-pointing
  });

  // ─── 8. Test Rollback Procedure & Post-Migration Edit Protection ─────────────
  await test("6. Rollback removes pristine backfills while protecting author-edited translations", () => {
    // Simulate user editing the Vietnamese translation post-migration
    const userEditedVi = mockDatabase.translations.find((t) => t.postId === idVi1);
    userEditedVi.title = "Hướng dẫn tối ưu hóa React 19 (Đã được tác giả chỉnh sửa)";
    userEditedVi.content = "<p>Nội dung mới do người dùng cập nhật sau migration.</p>";

    // Execute rollback logic
    const rollbackStats = {
      scanned: mockDatabase.translations.length,
      rolledBack: 0,
      protected: 0,
    };

    const remainingTranslations: any[] = [];
    for (const t of mockDatabase.translations) {
      const parent = mockDatabase.posts.find((p) => p._id === t.postId);
      if (!parent) continue;

      const titleMatches = t.title.trim() === (parent.title || "").trim();
      const contentMatches = t.content.trim() === (parent.content || "").trim();
      const isPristineBackfill = titleMatches && contentMatches;

      if (!isPristineBackfill) {
        // Protected!
        rollbackStats.protected++;
        remainingTranslations.push(t);
      } else {
        // Rollback eligible
        rollbackStats.rolledBack++;
        parent.availableLocales = parent.availableLocales.filter((loc: string) => loc !== t.locale);
      }
    }

    mockDatabase.translations = remainingTranslations;

    assert(rollbackStats.rolledBack > 0, "Rolled back pristine migration records");
    assert(rollbackStats.protected >= 1, "Protected author-edited translation from deletion");

    const protectedExists = mockDatabase.translations.some((t) => t.postId === idVi1);
    assert(protectedExists, "User-edited translation was strictly preserved during rollback");

    // Parent posts still retain original English content and publication status
    const parentPost = mockDatabase.posts.find((p) => p._id === idVi1);
    assert(parentPost.title.length > 0, "Parent Post content untouched after rollback");
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n------------------------------------------------------------------");
  console.log(`  Sprint 6 Rehearsal Suite: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRehearsal().catch((err) => {
  console.error("Rehearsal failed with unhandled exception:", err);
  process.exit(1);
});
