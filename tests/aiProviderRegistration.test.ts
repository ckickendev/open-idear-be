// =============================================================================
//  AI PROVIDER REGISTRATION — AUTOMATED TEST SUITE
//  tests/aiProviderRegistration.test.ts
//
//  Verifies:
//  1. resolveGeminiApiKey handles canonical, alias, quoted, and whitespace keys.
//  2. Isolated ProviderRegistry stays empty when not configured for env bootstrap.
//  3. Auto-registering ProviderRegistry lazily registers GeminiProvider from env.
//  4. unregister() suppresses auto-registration until register()/bootstrapFromEnv().
//  5. registerDefaultProvidersFromEnv is idempotent and reports status cleanly.
//  6. HealthController.getHealthData exposes AI provider configuration state.
// =============================================================================

import assert from "node:assert";
import {
  ProviderRegistry,
  providerRegistry,
  resolveGeminiApiKey,
  registerDefaultProvidersFromEnv,
  AIError,
  type AIProvider,
} from "../ai/provider";

const HealthController = require("../controllers/health.controller");

async function runTests() {
  console.log("\n========================================================");
  console.log("  RUNNING AI PROVIDER REGISTRATION TEST SUITE");
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
      failed++;
    }
  }

  // 1. resolveGeminiApiKey tests
  await test("resolveGeminiApiKey resolves standard GEMINI_API_KEY and strips whitespace/quotes", () => {
    const res1 = resolveGeminiApiKey({ GEMINI_API_KEY: "  AIzaTestKey123  " });
    assert.strictEqual(res1.apiKey, "AIzaTestKey123");
    assert.strictEqual(res1.sourceKey, "GEMINI_API_KEY");

    const res2 = resolveGeminiApiKey({ GEMINI_API_KEY: ' "AIzaQuoted456" ' });
    assert.strictEqual(res2.apiKey, "AIzaQuoted456");
  });

  await test("resolveGeminiApiKey tolerates whitespace-padded key names and Google aliases", () => {
    const resSpace = resolveGeminiApiKey({ "GEMINI_API_KEY ": "AIzaSpaceKey" });
    assert.strictEqual(resSpace.apiKey, "AIzaSpaceKey");
    assert.strictEqual(resSpace.sourceKey, "GEMINI_API_KEY ");

    const resAlias = resolveGeminiApiKey({ GOOGLE_GENERATIVE_AI_API_KEY: "AIzaGenAI" });
    assert.strictEqual(resAlias.apiKey, "AIzaGenAI");
    assert.strictEqual(resAlias.sourceKey, "GOOGLE_GENERATIVE_AI_API_KEY");

    const resGoogleApi = resolveGeminiApiKey({ GOOGLE_API_KEY: "AIzaGoogleApi" });
    assert.strictEqual(resGoogleApi.apiKey, "AIzaGoogleApi");
    assert.strictEqual(resGoogleApi.sourceKey, "GOOGLE_API_KEY");
  });

  await test("resolveGeminiApiKey prioritizes GEMINI_API_KEY over aliases", () => {
    const res = resolveGeminiApiKey({
      GOOGLE_API_KEY: "AIzaFallback",
      GEMINI_API_KEY: "AIzaPrimary",
    });
    assert.strictEqual(res.apiKey, "AIzaPrimary");
    assert.strictEqual(res.sourceKey, "GEMINI_API_KEY");
  });

  // 2. Isolated registry behavior
  await test("Isolated ProviderRegistry does not auto-register from process.env", () => {
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "AIzaShouldNotAutoLoad";
    try {
      const isolated = new ProviderRegistry();
      assert.deepStrictEqual(isolated.list(), []);
      assert.strictEqual(isolated.has("gemini"), false);
      assert.throws(
        () => isolated.getDefault(),
        (err: unknown) => err instanceof AIError && err.code === "model_error"
      );
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  // 3. Auto-registering registry behavior
  await test("Auto-registering ProviderRegistry lazily registers GeminiProvider from process.env", () => {
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "AIzaLazyKey789";
    try {
      const autoReg = new ProviderRegistry({ autoRegisterFromEnv: true });
      assert.strictEqual(autoReg.has("gemini"), true);
      assert.deepStrictEqual(autoReg.list(), ["gemini"]);
      assert.strictEqual(autoReg.getDefault().id, "gemini");
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  // 4. unregister() suppression & bootstrapFromEnv() recovery
  await test("unregister() suppresses auto-register until explicit register() or bootstrapFromEnv()", () => {
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "AIzaTestKey";
    try {
      const autoReg = new ProviderRegistry({ autoRegisterFromEnv: true });
      assert.strictEqual(autoReg.getDefault().id, "gemini");

      autoReg.unregister("gemini");
      assert.deepStrictEqual(autoReg.list(), []);
      assert.throws(() => autoReg.getDefault(), AIError);

      const bootstrap = registerDefaultProvidersFromEnv(autoReg);
      assert.strictEqual(bootstrap.missing, false);
      assert.deepStrictEqual(bootstrap.registered, ["gemini"]);
      assert.strictEqual(autoReg.getDefault().id, "gemini");
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  // 5. Missing env error messaging
  await test("Empty auto-registering registry throws descriptive AIError when no key is set", () => {
    const savedEnv: Record<string, string | undefined> = {};
    const keysToClear = [
      "GEMINI_API_KEY",
      "GEMINI_API_KEY ",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_API_KEY",
    ];
    for (const k of keysToClear) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    try {
      const autoReg = new ProviderRegistry({ autoRegisterFromEnv: true });
      const res = registerDefaultProvidersFromEnv(autoReg);
      assert.strictEqual(res.missing, true);
      assert.deepStrictEqual(res.registered, []);
      assert.throws(
        () => autoReg.getDefault(),
        (err: unknown) =>
          err instanceof AIError &&
          err.code === "model_error" &&
          err.message.includes("GEMINI_API_KEY")
      );
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  // 6. HealthController reports AI configuration status
  await test("HealthController.getHealthData reports AI provider status from providerRegistry", async () => {
    const mockProvider: AIProvider = {
      id: "mock-gemini",
      generate: async () => ({ text: "", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }),
      generateJSON: async <T = unknown>() => ({ data: {} as T, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }),
      async *stream() {
        return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      },
    };
    const hadMock = providerRegistry.has("mock-gemini");
    providerRegistry.register(mockProvider);
    try {
      const healthController = new HealthController();
      const health = await healthController.getHealthData();
      assert.strictEqual(health.ai.configured, true);
      assert(health.ai.providers.includes("mock-gemini"));
    } finally {
      if (!hadMock) {
        providerRegistry.unregister("mock-gemini");
      }
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
