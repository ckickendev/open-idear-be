// =============================================================================
//  AI USAGE ANALYTICS — AUTOMATED TEST SUITE
//  tests/aiUsage.test.ts
//
//  Verifies:
//  1. AIUsage Mongoose Schema (all 11 required fields, enum constraints, indexes).
//  2. AIUsageRepository contract & aggregation queries.
//  3. AIUsageService domain logic & registry metadata enrichment.
//  4. MongoAIUsageSink runtime interceptor (SUCCESS & FAILED handling).
//  5. AIUsageController HTTP endpoints & role-based access control.
//  6. Live MongoDB aggregation verification (when MONGO_URL is available).
// =============================================================================

require("dotenv").config();
import mongoose, { Types } from "mongoose";
import { AIUsage, IAIUsage } from "../models/aiUsage.schema";
import {
  aiUsageRepository,
  AIUsageRepository,
} from "../ai/usage/repository/aiUsage.repository";
import {
  aiUsageService,
  AIUsageService,
} from "../ai/usage/service/aiUsage.service";
import {
  mongoAIUsageSink,
  MongoAIUsageSink,
} from "../ai/usage/sink/mongoAIUsage.sink";
import { aiFeatureRegistry } from "../ai/feature";
import type { AILogEntry } from "../ai/telemetry";
const AIUsageController = require("../controllers/aiUsage.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("  RUNNING AI USAGE ANALYTICS TEST SUITE (SPRINT P0.5)");
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

  // ─── Test 1: AIUsage Schema & Required Fields ──────────────────────────────
  await test("Schema should define all 11 required fields and correct indexes", () => {
    const paths = AIUsage.schema.paths;
    const requiredFields = [
      "userId",
      "featureId",
      "provider",
      "promptVersion",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "latency",
      "estimatedCostUSD",
      "status",
      "createdAt",
    ];

    for (const field of requiredFields) {
      assert(
        paths[field] !== undefined,
        `Expected schema to contain field "${field}"`
      );
    }

    // Verify status enum values
    const statusEnum = (paths["status"] as any).enumValues;
    assert(
      Array.isArray(statusEnum) &&
        statusEnum.includes("SUCCESS") &&
        statusEnum.includes("FAILED"),
      `Status must accept "SUCCESS" and "FAILED"`
    );

    // Verify compound and single performance indexes
    const indexes = AIUsage.schema.indexes();
    assert(indexes.length >= 4, `Expected at least 4 performance indexes`);
    const hasUserCreatedIndex = indexes.some(
      (idx) => (idx[0] as any).userId === 1 && (idx[0] as any).createdAt === -1
    );
    assert(
      hasUserCreatedIndex,
      "Expected compound index on { userId: 1, createdAt: -1 }"
    );

    const hasCreatedAtIndex = indexes.some(
      (idx) => (idx[0] as any).createdAt === -1
    );
    assert(
      hasCreatedAtIndex,
      "Expected index on { createdAt: -1 } for admin time filtering"
    );
  });

  // ─── Test 2: AIUsageRepository Fallback & Edge Cases ───────────────────────
  await test("AIUsageRepository should handle empty/invalid user ID safely", async () => {
    const summary = await aiUsageRepository.getUserSummary("invalid-user-id");
    assert(summary.totalGenerations === 0, "totalGenerations must be 0 for invalid user");
    assert(summary.totalTokens === 0, "totalTokens must be 0 for invalid user");
    assert(summary.estimatedCost === 0, "estimatedCost must be 0 for invalid user");
    assert(summary.mostUsedFeature === null, "mostUsedFeature must be null for invalid user");

    const history = await aiUsageRepository.getUserHistory("invalid-user-id");
    assert(Array.isArray(history) && history.length === 0, "History must be empty array for invalid user");
  });

  // ─── Test 3: AIUsageService Metadata Enrichment ───────────────────────────
  await test("AIUsageService.getMeUsage should enrich mostUsedFeature and history with registry data", async () => {
    const testUserId = new Types.ObjectId().toString();
    const mockRepo: any = {
      getUserSummary: async () => ({
        totalGenerations: 42,
        totalTokens: 18500,
        estimatedCost: 0.045,
        mostUsedFeature: {
          featureId: "rewrite",
          count: 18,
        },
      }),
      getUserHistory: async () => [
        {
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(testUserId),
          featureId: "rewrite",
          provider: "gemini",
          model: "gemini-2.5-flash",
          inputTokens: 120,
          outputTokens: 350,
          totalTokens: 470,
          latency: 420,
          estimatedCostUSD: 0.00015,
          status: "SUCCESS",
          createdAt: new Date(),
        },
      ],
    };

    const service = new AIUsageService(mockRepo);
    const result = await service.getMeUsage(testUserId);

    const expectedRewrite = aiFeatureRegistry.resolve("rewrite");
    assert(result.totalGenerations === 42, "totalGenerations matches");
    assert(result.totalTokens === 18500, "totalTokens matches");
    assert(result.estimatedCost === 0.045, "estimatedCost matches");
    assert(result.mostUsedFeature !== null, "mostUsedFeature exists");
    assert(result.mostUsedFeature?.featureId === "rewrite", "featureId is rewrite");
    assert(
      result.mostUsedFeature?.name === expectedRewrite.name,
      `Expected enriched feature name "${expectedRewrite.name}", got "${result.mostUsedFeature?.name}"`
    );
    assert(result.recentHistory.length === 1, "recentHistory has 1 item");
    assert(
      result.recentHistory[0].featureName === expectedRewrite.name,
      "History item featureName is enriched"
    );
  });

  // ─── Test 4: AIUsageService Admin Analytics Calculations ──────────────────
  await test("AIUsageService.getAdminAnalytics should compute percentages and enrich top features", async () => {
    const mockRepo: any = {
      getAdminAnalytics: async () => ({
        summary: {
          totalGenerations: 100,
          successfulGenerations: 95,
          failedGenerations: 5,
          successRate: 95,
          totalTokens: 150000,
          totalCostUSD: 0.75,
        },
        topFeatures: [
          { featureId: "summarize", count: 60, totalTokens: 90000, totalCost: 0.45 },
          { featureId: "publish_by_ai", count: 40, totalTokens: 60000, totalCost: 0.30 },
        ],
        providerDistribution: [
          { provider: "gemini", count: 75 },
          { provider: "gpt", count: 25 },
        ],
        dailyGenerations: [
          { date: "2026-09-16", count: 40, totalTokens: 60000, totalCost: 0.30 },
          { date: "2026-09-17", count: 60, totalTokens: 90000, totalCost: 0.45 },
        ],
        averageLatency: 520,
        averageTokenUsage: 1500,
      }),
    };

    const service = new AIUsageService(mockRepo);
    const analytics = await service.getAdminAnalytics(30);

    const expectedSummarize = aiFeatureRegistry.resolve("summarize");
    assert(analytics.summary.totalGenerations === 100, "totalGenerations matches");
    assert(analytics.topFeatures.length === 2, "2 top features returned");
    assert(
      analytics.topFeatures[0].name === expectedSummarize.name,
      `Expected "${expectedSummarize.name}", got "${analytics.topFeatures[0].name}"`
    );
    assert(
      analytics.topFeatures[0].category === expectedSummarize.category,
      `Expected "${expectedSummarize.category}", got "${analytics.topFeatures[0].category}"`
    );

    // Verify provider distribution percentage calculation
    assert(analytics.providerDistribution.length === 2, "2 providers");
    const geminiDist = analytics.providerDistribution.find((p) => p.provider === "gemini");
    const gptDist = analytics.providerDistribution.find((p) => p.provider === "gpt");
    assert(geminiDist?.percentage === 75, `Expected 75% for gemini, got ${geminiDist?.percentage}`);
    assert(gptDist?.percentage === 25, `Expected 25% for gpt, got ${gptDist?.percentage}`);
    assert(analytics.averageLatency === 520, "averageLatency matches");
    assert(analytics.averageTokenUsage === 1500, "averageTokenUsage matches");
  });

  // ─── Test 5: MongoAIUsageSink Runtime Interceptor ─────────────────────────
  await test("MongoAIUsageSink should intercept SUCCESS and FAILED events without throwing", async () => {
    let recordedEvents: any[] = [];
    const mockService: any = {
      recordUsage: async (dto: any) => {
        recordedEvents.push(dto);
        return dto;
      },
    };

    const sink = new MongoAIUsageSink();
    (sink as any).service = mockService;

    // Test 5a: Successful execution event
    const successEntry: AILogEntry = {
      id: "log-1",
      timestamp: new Date(),
      providerId: "gemini",
      model: "gemini-2.5-flash",
      prompt: { messages: [{ role: "user", content: "hello" }] },
      executionTimeMs: 350,
      success: true,
      featureId: "rewrite",
      userId: new Types.ObjectId().toString(),
      tokenUsage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      estimatedCost: 0.0002,
    };

    // Replace internal call to service
    const origRecord = aiUsageService.recordUsage;
    aiUsageService.recordUsage = async (dto) => {
      recordedEvents.push(dto);
      return dto as any;
    };

    try {
      await sink.log(successEntry);
      assert(recordedEvents.length === 1, "Recorded 1 usage event");
      assert(recordedEvents[0].status === "SUCCESS", "Status is SUCCESS");
      assert(recordedEvents[0].featureId === "rewrite", "featureId is rewrite");
      assert(recordedEvents[0].totalTokens === 150, "totalTokens is 150");

      // Test 5b: Failed execution event
      const failedEntry: AILogEntry = {
        id: "log-2",
        timestamp: new Date(),
        providerId: "gemini",
        model: "gemini-2.5-flash",
        prompt: { messages: [{ role: "user", content: "fail test" }] },
        executionTimeMs: 120,
        success: false,
        error: { message: "AI API Quota Exceeded", code: "quota_exceeded" },
        promptName: "summarize",
      };

      await sink.log(failedEntry);
      assert(recordedEvents.length === 2, "Recorded second event");
      assert(recordedEvents[1].status === "FAILED", "Status is FAILED");
      assert(recordedEvents[1].errorMessage === "AI API Quota Exceeded", "Error message captured");
      assert(recordedEvents[1].featureId === "summarize", "Fallback resolved promptName to featureId");
    } finally {
      aiUsageService.recordUsage = origRecord;
    }
  });

  // ─── Test 6: AIUsageController HTTP Handlers & Security ───────────────────
  await test("AIUsageController should handle /me and /admin endpoints with proper auth", async () => {
    const controller = new AIUsageController();

    // 6a: Test getMeUsage without token
    let statusCode: number = 200;
    let jsonResponse: any = null;
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (body: any) => {
        jsonResponse = body;
        return mockRes;
      },
    };

    await controller.getMeUsage({ userInfo: null } as any, mockRes);
    assert(statusCode === 401, "Expected 401 for unauthenticated user");

    // 6b: Test getAdminAnalytics with non-admin role
    await controller.getAdminAnalytics({ userInfo: { role: "member" } } as any, mockRes);
    assert(statusCode === 403, "Expected 403 for non-admin user");

    // 6c: Test getAdminAnalytics with admin role
    const origGetAdmin = aiUsageService.getAdminAnalytics;
    aiUsageService.getAdminAnalytics = async () => ({
      summary: {
        totalGenerations: 10,
        successfulGenerations: 10,
        failedGenerations: 0,
        successRate: 100,
        totalTokens: 5000,
        totalCostUSD: 0.02,
      },
      topFeatures: [],
      providerDistribution: [],
      dailyGenerations: [],
      averageLatency: 300,
      averageTokenUsage: 500,
    });

    try {
      await controller.getAdminAnalytics(
        { userInfo: { role: "admin" }, query: { days: "7" } } as any,
        mockRes
      );
      assert(jsonResponse?.status === "success", "Response status is success");
      assert(jsonResponse?.totalGenerations === undefined, "totalGenerations in admin is under summary");
      assert(jsonResponse?.summary?.totalGenerations === 10, "Summary totalGenerations is 10");
      assert(jsonResponse?.averageLatency === 300, "averageLatency is 300");
    } finally {
      aiUsageService.getAdminAnalytics = origGetAdmin;
    }
  });

  // ─── Test 7: Live Database Integration (Optional) ──────────────────────────
  if (process.env.MONGO_URL) {
    await test("Live Database Integration (Skip if offline or sandboxed)", async () => {
      try {
        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(process.env.MONGO_URL!, { serverSelectionTimeoutMS: 2000 });
        }
      } catch (connErr: any) {
        console.log(`    [INFO] Live DB connection skipped (${connErr.message})`);
        return;
      }

      const testUserId = new Types.ObjectId();
      const testFeatureId = "rewrite";

      // 1. Insert test usage document
      const created = await aiUsageRepository.create({
        userId: testUserId.toString(),
        featureId: testFeatureId,
        provider: "gemini-test",
        promptVersion: "v1",
        inputTokens: 100,
        outputTokens: 250,
        latency: 450,
        estimatedCostUSD: 0.001,
        status: "SUCCESS",
      });

      assert(created._id !== undefined, "Record created in database");
      assert(created.totalTokens === 350, "totalTokens calculated automatically as 350");

      try {
        // 2. Query user summary
        const summary = await aiUsageService.getMeUsage(testUserId.toString());
        assert(summary.totalGenerations >= 1, `Expected at least 1 generation, got ${summary.totalGenerations}`);
        assert(summary.totalTokens >= 350, `Expected at least 350 tokens, got ${summary.totalTokens}`);
        assert(summary.mostUsedFeature?.featureId === "rewrite", "mostUsedFeature is rewrite");
        assert(summary.recentHistory.length >= 1, "recentHistory contains created record");

        // 3. Query admin analytics
        const adminData = await aiUsageService.getAdminAnalytics(1);
        assert(adminData.summary.totalGenerations >= 1, "Admin summary reflects created generation");
        assert(adminData.topFeatures.some((f) => f.featureId === "rewrite"), "rewrite in topFeatures");
      } finally {
        // 4. Clean up test record
        await AIUsage.deleteOne({ _id: created._id });
      }
    });
  }

  console.log("\n========================================================");
  console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().then(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
}).catch((err) => {
  console.error("Test runner encountered an unhandled error:", err);
  process.exit(1);
});
