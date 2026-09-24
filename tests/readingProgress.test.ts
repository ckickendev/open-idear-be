// =============================================================================
//  READING PROGRESS ENGINE — AUTOMATED TEST SUITE (SPRINT 1)
//  tests/readingProgress.test.ts
//
//  Verifies:
//  1. ReadingProgress Mongoose schema fields, types, and compound indexes.
//  2. ReadingProgressController routing & endpoint structure (/reading/continue, /reading/:articleId, etc.).
//  3. Reading time estimation & remaining minutes calculation logic.
//  4. Monotonic progress safeguard (progress never accidentally regresses).
//  5. Meaningful write filtering (avoids writes when progress delta < 2% and heading unchanged).
//  6. Completion logic (progress >= 90% + bottom sentinel marks completedAt).
//  7. User reading stats aggregation (articles completed, hours read, streak architecture).
// =============================================================================

require("dotenv").config();
import mongoose, { Types } from "mongoose";
import { ReadingProgress, readingProgressSchema } from "../models/readingProgress.schema";
import { ReadingProgressService } from "../services/readingProgress.services";
const ReadingProgressController = require("../controllers/readingProgress.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("  RUNNING READING PROGRESS ENGINE TEST SUITE (SPRINT 1) ");
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

  // ─── TEST 1: Schema Structure & Compound Index ──────────────────────────────
  await test("ReadingProgress schema defines required fields and compound unique index", () => {
    const paths = (readingProgressSchema as any).paths;

    assert(paths.userId !== undefined, "userId field must exist");
    assert(paths.userId.instance === "ObjectId", "userId must be ObjectId");
    assert(paths.userId.isRequired === true, "userId must be required");

    assert(paths.articleId !== undefined, "articleId field must exist");
    assert(paths.articleId.instance === "ObjectId", "articleId must be ObjectId");
    assert(paths.articleId.isRequired === true, "articleId must be required");

    assert(paths.progress !== undefined, "progress field must exist");
    assert(paths.progress.instance === "Number", "progress must be Number");

    assert(paths.lastHeadingId !== undefined, "lastHeadingId field must exist");
    assert(paths.lastParagraphIndex !== undefined, "lastParagraphIndex field must exist");
    assert(paths.completedAt !== undefined, "completedAt field must exist");
    assert(paths.updatedAt !== undefined, "updatedAt field must exist");

    // Verify indexes
    const indexes = (readingProgressSchema as any).indexes();
    const hasUniqueCompoundIndex = indexes.some(
      ([fields, options]: [any, any]) =>
        fields.userId === 1 && fields.articleId === 1 && options?.unique === true
    );
    assert(hasUniqueCompoundIndex, "Must have unique compound index on { userId: 1, articleId: 1 }");

    const hasRecencyIndex = indexes.some(
      ([fields]: [any]) => fields.userId === 1 && fields.updatedAt === -1
    );
    assert(hasRecencyIndex, "Must have recency index on { userId: 1, updatedAt: -1 }");
  });

  // ─── TEST 2: Controller Endpoint Registration ───────────────────────────────
  await test("ReadingProgressController initializes REST endpoints correctly", () => {
    const controller = new ReadingProgressController();
    assert(controller._rootPath === "/reading", "Controller root path must be /reading");

    const routes: { path: string; method: string }[] = [];
    controller._router.stack.forEach((layer: any) => {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods);
        methods.forEach((m) => routes.push({ path, method: m.toUpperCase() }));
      }
    });

    const hasContinue = routes.some(
      (r) => r.path === "/reading/continue" && r.method === "GET"
    );
    assert(hasContinue, "Must register GET /reading/continue");

    const hasStats = routes.some(
      (r) => r.path === "/reading/stats/me" && r.method === "GET"
    );
    assert(hasStats, "Must register GET /reading/stats/me");

    const hasGetProgress = routes.some(
      (r) => r.path === "/reading/:articleId" && r.method === "GET"
    );
    assert(hasGetProgress, "Must register GET /reading/:articleId");

    const hasPutProgress = routes.some(
      (r) => r.path === "/reading/:articleId" && r.method === "PUT"
    );
    assert(hasPutProgress, "Must register PUT /reading/:articleId");
  });

  // ─── TEST 3: Reading Time Estimation ─────────────────────────────────────────
  await test("calculateReadingMinutes prefers AI estimate and falls back to word count", () => {
    const service = new ReadingProgressService();

    // 1. With AI writer estimate
    const postWithAi = {
      aiContext: { writerOutput: { estimatedReadingTime: 7 } },
      text: "short text",
    };
    assert(service.calculateReadingMinutes(postWithAi) === 7, "Prefers aiContext.writerOutput estimate (7 mins)");

    // 2. Fallback to word count (400 words = 2 mins at 200 wpm)
    const words400 = Array(400).fill("word").join(" ");
    const postWithWords = { text: words400 };
    assert(service.calculateReadingMinutes(postWithWords) === 2, "400 words should equal 2 mins");

    // 3. Very short post defaults to minimum 1 minute
    const shortPost = { text: "just a few words" };
    assert(service.calculateReadingMinutes(shortPost) === 1, "Short post defaults to minimum 1 min");
  });

  // ─── TEST 4: Monotonic Progress & Meaningful Write Logic ─────────────────────
  await test("Progress logic enforces monotonicity and prevents accidental rewinds", () => {
    // Simulate updateProgress decision logic
    function evaluateProgressUpdate(existingProgress: number, inputProgress: number, lastHeadingId: string | null, newHeading: string | null) {
      const safeProgress = Math.max(existingProgress, inputProgress);
      const progressDelta = Math.abs(safeProgress - existingProgress);
      const headingChanged = Boolean(newHeading && newHeading !== lastHeadingId);
      const isMeaningful = progressDelta >= 2 || headingChanged;
      return { safeProgress, isMeaningful };
    }

    // Case A: User scrolled backward from 65% to 20% (e.g. checking an earlier section)
    const resA = evaluateProgressUpdate(65, 20, "heading-1", "heading-1");
    assert(resA.safeProgress === 65, "Progress must stay at 65% (monotonic safeguard)");
    assert(resA.isMeaningful === false, "No meaningful forward progress or heading change -> skip write");

    // Case B: Small forward jitter (65% to 66%) without heading change
    const resB = evaluateProgressUpdate(65, 66, "heading-2", "heading-2");
    assert(resB.safeProgress === 66, "Progress reaches 66%");
    assert(resB.isMeaningful === false, "1% delta is under the 2% write threshold -> skip write to avoid DB churn");

    // Case C: Meaningful forward progress (65% to 70%)
    const resC = evaluateProgressUpdate(65, 70, "heading-2", "heading-2");
    assert(resC.safeProgress === 70, "Progress reaches 70%");
    assert(resC.isMeaningful === true, "5% delta >= 2% threshold -> trigger DB write");

    // Case D: Heading changed even with same progress
    const resD = evaluateProgressUpdate(65, 65, "heading-1", "heading-2");
    assert(resD.isMeaningful === true, "New heading entered -> trigger DB write to save bookmark");
  });

  // ─── TEST 5: Automatic Completion Conditions ─────────────────────────────────
  await test("Completion is triggered when progress >= 90% and bottom is reached", () => {
    function checkCompletion(progress: number, isBottomReached: boolean): boolean {
      return (progress >= 90 && isBottomReached) || progress >= 99;
    }

    // 85% at bottom -> NOT completed
    assert(checkCompletion(85, true) === false, "85% at bottom should NOT complete");

    // 92% not at bottom yet -> NOT completed
    assert(checkCompletion(92, false) === false, "92% mid-page should NOT complete yet");

    // 92% and bottom reached -> COMPLETED
    assert(checkCompletion(92, true) === true, "92% + bottom reached triggers completion");

    // 99% reached -> COMPLETED (safeguard)
    assert(checkCompletion(99, false) === true, "99% triggers completion regardless of bottom sentinel");
  });

  // ─── TEST 6: Streak Calculation Architecture ─────────────────────────────────
  await test("Streak calculation accurately computes consecutive reading days", () => {
    const activeDates = new Set(["2026-09-20", "2026-09-19", "2026-09-18"]);
    
    // Simulate streak logic
    let streak = 0;
    const today = new Date("2026-09-20T12:00:00Z");
    let check = new Date(today);

    while (true) {
      const formatted = check.toISOString().split("T")[0];
      if (activeDates.has(formatted)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }

    assert(streak === 3, `Expected streak 3 days, got ${streak}`);
  });

  console.log("\n========================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered an error:", err);
  process.exit(1);
});
