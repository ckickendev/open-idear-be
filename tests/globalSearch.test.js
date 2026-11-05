const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Course, Post, PostTranslation, Category } = require("../models");
const globalSearchService = require("../services/globalSearch.services");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR — SPRINT 1: UNIFIED GLOBAL SEARCH ENGINE TESTS");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ ${message}`);
      passed++;
    } else {
      console.error(`✗ FAILED: ${message}`);
      failed++;
    }
  }

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URL);
    }

    // ── Test 1: Empty Query Returns Pagination & Counts ──
    const emptyResult = await globalSearchService.search({ q: "", page: 1, limit: 5 });
    assert(emptyResult.status !== "error", "Test 1.1: Empty query executes successfully");
    assert(typeof emptyResult.counts.all === "number", "Test 1.2: Counts payload includes total");
    assert(Array.isArray(emptyResult.courses), "Test 1.3: Returns courses array");
    assert(Array.isArray(emptyResult.posts), "Test 1.4: Returns posts array");
    assert(Array.isArray(emptyResult.availableCategories), "Test 1.5: Returns available categories array");

    // ── Test 2: Accent-Insensitive Vietnamese Query ──
    const noAccentResult = await globalSearchService.search({ q: "dau tu", locale: "vi" });
    const withAccentResult = await globalSearchService.search({ q: "đầu tư", locale: "vi" });

    assert(
      noAccentResult.counts.all >= 1,
      `Test 2.1: Non-accent query "dau tu" finds results (found ${noAccentResult.counts.all})`
    );
    assert(
      withAccentResult.counts.all >= 1,
      `Test 2.2: Accented query "đầu tư" finds results (found ${withAccentResult.counts.all})`
    );
    assert(
      noAccentResult.courses.some((c) => /đầu tư/i.test(c.title)),
      "Test 2.3: Non-accent query matches course title with Vietnamese accents"
    );

    // ── Test 3: Type Tab Isolation & Faceted Counts ──
    const courseOnlyResult = await globalSearchService.search({ q: "dau tu", type: "courses" });
    assert(courseOnlyResult.courses.length > 0, "Test 3.1: type=courses returns matching courses");
    assert(courseOnlyResult.posts.length === 0, "Test 3.2: type=courses excludes posts from results");
    assert(courseOnlyResult.counts.posts >= 1, "Test 3.3: Global tab count for posts preserved for UI tabs");

    const postOnlyResult = await globalSearchService.search({ q: "dau tu", type: "posts" });
    assert(postOnlyResult.courses.length === 0, "Test 3.4: type=posts excludes courses from results");
    assert(postOnlyResult.counts.courses >= 1, "Test 3.5: Global tab count for courses preserved for UI tabs");

    // ── Test 4: Pricing Filter ──
    const freeCourseResult = await globalSearchService.search({ type: "courses", isFree: true });
    assert(
      freeCourseResult.courses.every((c) => c.price === 0 || c.isFree === true),
      "Test 4.1: isFree filter strictly returns free courses"
    );

    // ── Test 5: ReDoS & Special Character Safety ──
    const specialChars = ["(", ")", "[", "]", "+", "*", "?", "^", "$", "\\", "C++", ".NET"];
    for (const charQuery of specialChars) {
      const safeRes = await globalSearchService.search({ q: charQuery });
      assert(
        safeRes && Array.isArray(safeRes.items),
        `Test 5: Special characters query "${charQuery}" handled safely without ReDoS`
      );
    }

    // ── Test 6: Draft Isolation ──
    const allCourses = await globalSearchService.search({ type: "courses", limit: 50 });
    const hasDrafts = allCourses.courses.some((c) => c.status === "draft");
    assert(!hasDrafts, "Test 6: Unpublished / draft courses strictly excluded from search");

    // ── Test 7: Unified Data Shape Integrity ──
    if (noAccentResult.courses.length > 0) {
      const sampleCourse = noAccentResult.courses[0];
      assert(
        sampleCourse.id && sampleCourse.title && sampleCourse.slug && sampleCourse.instructor,
        "Test 7.1: Course item conforms to unified frontend contract"
      );
    }
    if (noAccentResult.posts.length > 0) {
      const samplePost = noAccentResult.posts[0];
      assert(
        samplePost.id && samplePost.title && samplePost.slug && samplePost.author,
        "Test 7.2: Post item conforms to unified frontend contract"
      );
    }

    console.log("------------------------------------------------------------------");
    console.log(`  Sprint 1 Global Search Tests: ${passed} passed, ${failed} failed.`);
    console.log("==================================================================");

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution encountered an error:", err);
    process.exit(1);
  }
}

runTests();
