// =============================================================================
//  OPENIDEAR SHOP — READ-ONLY PREFLIGHT UNIT & SAFETY TESTS
//  tests/preflightShopIndexes.test.js
// =============================================================================

"use strict";

const assert = require("assert");
const {
  sanitizeConnectionTarget,
  isDesiredIndex,
  analyzeShopIndexes,
} = require("../scripts/preflight_shop_indexes_readonly");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — S6.2.2 INDEX PREFLIGHT SAFETY TESTS");
  console.log("==================================================================");

  let testsPassed = 0;

  // ─── Test 1: URI Sanitization Redacts Passwords and Extracts Host ─────────────
  {
    const testUri =
      "mongodb+srv://admin_user:super_secret_p%40ss@cluster0.abc.mongodb.net/production_db?retryWrites=true";
    const sanitized = sanitizeConnectionTarget(testUri);

    assert.strictEqual(sanitized.valid, true, "Must be marked valid");
    assert.strictEqual(sanitized.host, "cluster0.abc.mongodb.net", "Host must match");
    assert.strictEqual(sanitized.database, "production_db", "Database name must match");
    assert.strictEqual(sanitized.hasAuth, true, "Must detect auth presence");

    // Verify that secrets are nowhere in the output string
    const serialized = JSON.stringify(sanitized);
    assert(
      !serialized.includes("super_secret"),
      "Credentials must never be present in sanitized output"
    );
    assert(
      !serialized.includes("admin_user"),
      "Username must not leak in sanitized metadata"
    );
    console.log("  ✓ 1. sanitizeConnectionTarget strips credentials and safely isolates host/database");
    testsPassed++;
  }

  // ─── Test 2: Index Specification Matching ─────────────────────────────────────
  {
    const partialIdx = {
      key: { sku: 1 },
      unique: true,
      partialFilterExpression: { del_flag: 0 },
    };
    const unconditionalIdx = {
      key: { sku: 1 },
      unique: true,
      partialFilterExpression: null,
    };
    const sparseUniqueIdx = {
      key: { idempotencyKey: 1 },
      unique: true,
      sparse: true,
    };
    const sparseNonUniqueIdx = {
      key: { idempotencyKey: 1 },
      unique: false,
      sparse: true,
    };

    assert.strictEqual(
      isDesiredIndex(partialIdx, { sku: 1 }, { del_flag: 0 }),
      true,
      "Partial index with del_flag: 0 must match target"
    );
    assert.strictEqual(
      isDesiredIndex(unconditionalIdx, { sku: 1 }, { del_flag: 0 }),
      false,
      "Unconditional index must NOT match partial filter target"
    );
    assert.strictEqual(
      isDesiredIndex(sparseUniqueIdx, { idempotencyKey: 1 }, null, true),
      true,
      "Sparse unique index must match"
    );
    assert.strictEqual(
      isDesiredIndex(sparseNonUniqueIdx, { idempotencyKey: 1 }, null, true),
      false,
      "Sparse non-unique index must NOT match unique target"
    );
    console.log("  ✓ 2. isDesiredIndex accurately differentiates partial, sparse, and unique requirements");
    testsPassed++;
  }

  // ─── Test 3: Read-Only Enforcement Verification (No Write Calls) ──────────────
  {
    const writeMethodsInvoked = [];

    // Create mock DB with spy methods
    function createMockCollection(name, data = {}) {
      return {
        // Allowed Read Methods
        indexes: async () => data.indexes || [{ name: "_id_", key: { _id: 1 } }],
        countDocuments: async () => 0,
        aggregate: () => ({
          toArray: async () => [],
        }),
        find: () => ({
          project: () => ({
            limit: () => ({
              toArray: async () => [],
            }),
          }),
        }),

        // Forbidden Write Methods (must never be called)
        insertOne: async () => writeMethodsInvoked.push(`${name}.insertOne`),
        insertMany: async () => writeMethodsInvoked.push(`${name}.insertMany`),
        updateOne: async () => writeMethodsInvoked.push(`${name}.updateOne`),
        updateMany: async () => writeMethodsInvoked.push(`${name}.updateMany`),
        deleteOne: async () => writeMethodsInvoked.push(`${name}.deleteOne`),
        deleteMany: async () => writeMethodsInvoked.push(`${name}.deleteMany`),
        dropIndex: async () => writeMethodsInvoked.push(`${name}.dropIndex`),
        createIndex: async () => writeMethodsInvoked.push(`${name}.createIndex`),
        drop: async () => writeMethodsInvoked.push(`${name}.drop`),
        bulkWrite: async () => writeMethodsInvoked.push(`${name}.bulkWrite`),
      };
    }

    const mockDb = {
      listCollections: () => ({
        toArray: async () => [
          { name: "shop_products" },
          { name: "shop_categories" },
          { name: "ShopOrder" },
        ],
      }),
      collection: (name) => createMockCollection(name),
    };

    await analyzeShopIndexes(mockDb);

    assert.strictEqual(
      writeMethodsInvoked.length,
      0,
      `Preflight must NEVER call write methods! Called: ${writeMethodsInvoked.join(", ")}`
    );
    console.log("  ✓ 3. [SAFETY CRITICAL] analyzeShopIndexes executes strictly read-only operations without invoking write methods");
    testsPassed++;
  }

  // ─── Test 4: Blocker Detection on Duplicate Active SKUs ───────────────────────
  {
    const mockDb = {
      listCollections: () => ({
        toArray: async () => [{ name: "shop_products" }],
      }),
      collection: (name) => ({
        indexes: async () => [{ name: "_id_", key: { _id: 1 } }],
        countDocuments: async () => 2,
        aggregate: (pipeline) => ({
          toArray: async () => {
            const isSkuGrouping = pipeline.some(
              (p) => p.$group && p.$group._id === "$sku"
            );
            if (isSkuGrouping) {
              return [{ _id: "SOLAR-INV-5KW", count: 2, docIds: ["id1", "id2"] }];
            }
            return [];
          },
        }),
      }),
    };

    const results = await analyzeShopIndexes(mockDb);
    assert(
      results.blockers.some((b) => b.includes("duplicate active SKU")),
      "Must flag duplicate active SKU as a blocker"
    );
    console.log("  ✓ 4. analyzeShopIndexes detects duplicate active SKUs and correctly generates a blocker");
    testsPassed++;
  }

  // ─── Test 5: Warning on Multiple Explicit Null Idempotency Keys ────────────────
  {
    const mockDb = {
      listCollections: () => ({
        toArray: async () => [{ name: "ShopOrder" }],
      }),
      collection: (name) => ({
        indexes: async () => [{ name: "_id_", key: { _id: 1 } }],
        countDocuments: async (query) => {
          if (query && query.idempotencyKey === null) return 5;
          return 10;
        },
        aggregate: () => ({
          toArray: async () => [],
        }),
      }),
    };

    const results = await analyzeShopIndexes(mockDb);
    assert(
      results.warnings.some((w) => w.includes("explicit null idempotencyKey")),
      "Must warn that multiple explicit null idempotency keys will conflict in a sparse unique index"
    );
    console.log("  ✓ 5. analyzeShopIndexes detects explicit null idempotencyKey vulnerability and issues warning");
    testsPassed++;
  }

  // ─── Test 6: Blocker Detection on Non-Numeric del_flag ─────────────────────────
  {
    const mockDb = {
      listCollections: () => ({
        toArray: async () => [{ name: "shop_products" }],
      }),
      collection: (name) => ({
        indexes: async () => [{ name: "_id_", key: { _id: 1 } }],
        countDocuments: async (query) => {
          if (query && query.del_flag && query.del_flag.$not) return 3;
          return 5;
        },
        aggregate: () => ({
          toArray: async () => [],
        }),
      }),
    };

    const results = await analyzeShopIndexes(mockDb);
    assert(
      results.blockers.some((b) => b.includes("del_flag is not a numeric type")),
      "Must flag non-numeric del_flag as a blocker"
    );
    console.log("  ✓ 6. analyzeShopIndexes detects non-numeric del_flag data types and generates a blocker");
    testsPassed++;
  }

  console.log("==================================================================");
  console.log(`  ALL PREFLIGHT SAFETY TESTS PASSED (${testsPassed}/6)`);
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
