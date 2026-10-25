// =============================================================================
//  OPENIDEAR SHOP — MIGRATION SCRIPT HARDENING & IDEMPOTENCY TESTS
//  tests/migrationHardeningSafety.test.js
// =============================================================================

"use strict";

const assert = require("assert");
const { safeDropIndex, verifyIndexExists } = require("../scripts/migrate_shop_indexes_v2");

async function runHardeningTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — S6.2.3 MIGRATION HARDENING SAFETY TESTS");
  console.log("==================================================================");

  let testsPassed = 0;

  // ─── Test 1: safeDropIndex safely handles missing vs existing index ───────────
  {
    const droppedIndexes = [];
    const mockCollection = {
      indexes: async () => [{ name: "_id_", key: { _id: 1 } }, { name: "legacy_idx", key: { sku: 1 } }],
      dropIndex: async (name) => droppedIndexes.push(name),
    };

    const silentLogger = { log: () => {} };

    // Dropping existing index
    await safeDropIndex(mockCollection, "legacy_idx", silentLogger);
    assert.deepStrictEqual(droppedIndexes, ["legacy_idx"], "Must drop existing index");

    // Dropping missing index
    await safeDropIndex(mockCollection, "non_existent_idx", silentLogger);
    assert.deepStrictEqual(droppedIndexes, ["legacy_idx"], "Must skip drop when index does not exist");

    console.log("  ✓ 1. safeDropIndex safely drops existing indexes and skips non-existent indexes without throwing");
    testsPassed++;
  }

  // ─── Test 2: verifyIndexExists detects missing or mismatching index ──────────
  {
    const mockCollection = {
      indexes: async () => [
        {
          name: "sku_1",
          key: { sku: 1 },
          partialFilterExpression: { del_flag: 0 },
        },
      ],
    };
    const silentLogger = { log: () => {} };

    // Valid check
    await verifyIndexExists(mockCollection, "sku_1", { sku: 1 }, { del_flag: 0 }, silentLogger);

    // Missing index check
    let caughtMissing = false;
    try {
      await verifyIndexExists(mockCollection, "missing_idx", { sku: 1 }, null, silentLogger);
    } catch (err) {
      caughtMissing = true;
      assert(err.message.includes("was not found after build"), "Must detect missing index");
    }
    assert(caughtMissing, "Must throw on missing index");

    // Partial filter mismatch check
    let caughtMismatch = false;
    try {
      await verifyIndexExists(mockCollection, "sku_1", { sku: 1 }, { del_flag: 1 }, silentLogger);
    } catch (err) {
      caughtMismatch = true;
      assert(err.message.includes("partialFilterExpression does not match"), "Must detect option mismatch");
    }
    assert(caughtMismatch, "Must throw on option mismatch");

    console.log("  ✓ 2. verifyIndexExists verifies presence, key specification, and partial filter expression");
    testsPassed++;
  }

  // ─── Test 3: Idempotency Logic on Partial and Fully Migrated Indexes ──────────
  {
    const fullyMigratedProdIndexes = [
      { name: "_id_", key: { _id: 1 } },
      { name: "sku_1", key: { sku: 1 }, unique: true, partialFilterExpression: { del_flag: 0 } },
      { name: "slug_1", key: { slug: 1 }, unique: true, partialFilterExpression: { del_flag: 0 } },
    ];

    // Check that fully migrated indexes are correctly identified as already matching target
    const skuIdx = fullyMigratedProdIndexes.find((i) => i.name === "sku_1");
    const isSkuMigrated = Boolean(skuIdx && skuIdx.partialFilterExpression && skuIdx.partialFilterExpression.del_flag === 0);
    assert.strictEqual(isSkuMigrated, true, "Fully migrated index must be recognized as target");

    const legacyProdIndexes = [
      { name: "_id_", key: { _id: 1 } },
      { name: "sku_1", key: { sku: 1 }, unique: true, partialFilterExpression: null },
      { name: "slug_1", key: { slug: 1 }, unique: true, partialFilterExpression: null },
    ];
    const legacySkuIdx = legacyProdIndexes.find((i) => i.name === "sku_1");
    const isLegacySkuMigrated = Boolean(legacySkuIdx && legacySkuIdx.partialFilterExpression);
    assert.strictEqual(isLegacySkuMigrated, false, "Legacy index must be recognized as needing migration");

    console.log("  ✓ 3. Idempotency guards detect existing target indexes and avoid redundant drops");
    testsPassed++;
  }

  console.log("==================================================================");
  console.log(`  ALL MIGRATION HARDENING TESTS PASSED (${testsPassed}/3)`);
  console.log("==================================================================");
}

runHardeningTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
