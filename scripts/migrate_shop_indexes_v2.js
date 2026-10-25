#!/usr/bin/env node
// =============================================================================
//  OPENIDEAR SHOP — PRODUCTION INDEX MIGRATION SCRIPT (V2 - HARDENED)
//  scripts/migrate_shop_indexes_v2.js
//
//  STRICT SAFETY RULES:
//  1. Requires explicit confirmation of target database name via --database=<name>.
//  2. Refuses to run if preflight blockers are detected.
//  3. Matches Mongoose schema index names (sku_1, slug_1, idempotencyKey_1) to
//     prevent index options conflict with Mongoose autoIndex.
//  4. Migrates each index sequentially with post-build verification.
//  5. Strictly idempotent: safe to run against initial, partial, or completed states.
//  6. Never deletes or updates business data.
// =============================================================================

"use strict";

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const {
  sanitizeConnectionTarget,
  analyzeShopIndexes,
} = require("./preflight_shop_indexes_readonly");

async function safeDropIndex(collection, indexName, logger = console) {
  const indexes = await collection.indexes();
  const exists = indexes.some((idx) => idx.name === indexName);
  if (exists) {
    logger.log(`  - Dropping legacy index '${indexName}'...`);
    await collection.dropIndex(indexName);
    logger.log(`  ✓ Legacy index '${indexName}' dropped successfully.`);
  } else {
    logger.log(`  - Legacy index '${indexName}' not present (skipping drop).`);
  }
}

async function verifyIndexExists(collection, indexName, keyPattern, partialExpr = null, logger = console) {
  const indexes = await collection.indexes();
  const found = indexes.find((i) => i.name === indexName);
  if (!found) {
    throw new Error(`Verification failed: Index '${indexName}' was not found after build.`);
  }

  const keyMatches = JSON.stringify(found.key) === JSON.stringify(keyPattern);
  if (!keyMatches) {
    throw new Error(`Verification failed: Index '${indexName}' key ${JSON.stringify(found.key)} does not match target ${JSON.stringify(keyPattern)}.`);
  }

  if (partialExpr) {
    const exprMatches = JSON.stringify(found.partialFilterExpression || null) === JSON.stringify(partialExpr);
    if (!exprMatches) {
      throw new Error(`Verification failed: Index '${indexName}' partialFilterExpression does not match target.`);
    }
  }

  logger.log(`  ✓ Verified index '${indexName}' in collection metadata.`);
}

async function runMigration(options = {}) {
  const logger = options.logger || console;
  const rawUri = process.env.MONGO_URL || process.env.MONGODB_URI;
  const targetInfo = sanitizeConnectionTarget(rawUri);

  logger.log("==================================================================");
  logger.log("  OPENIDEAR SHOP — PRODUCTION INDEX MIGRATION (V2)");
  logger.log("==================================================================");

  if (!targetInfo.valid) {
    throw new Error("Missing or invalid MONGO_URL database configuration.");
  }

  // Parse CLI args for expected database confirmation
  const expectedDbArg = process.argv.find((arg) => arg.startsWith("--database="));
  const expectedDb = expectedDbArg ? expectedDbArg.split("=")[1].trim() : options.expectedDatabase || null;

  logger.log(`Target Host:     ${targetInfo.host}`);
  logger.log(`Target Database: ${targetInfo.database}`);
  logger.log(`Expected DB:     ${expectedDb || "[NOT SPECIFIED - SAFETY CHECK REQUIRED]"}`);
  logger.log("------------------------------------------------------------------");

  // Safety Gate: Target database confirmation
  if (!expectedDb) {
    throw new Error(
      "Safety Gate: You must specify --database=<expected_db_name> to prevent accidental execution against an unintended environment."
    );
  }

  const connection = await mongoose.createConnection(rawUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
  }).asPromise();

  const db = connection.db;
  const actualDbName = db.databaseName;

  if (actualDbName !== expectedDb) {
    await connection.close().catch(() => {});
    throw new Error(
      `Safety Gate Failed: Target database is '${actualDbName}', but --database='${expectedDb}' was specified. Aborting.`
    );
  }

  try {
    // Step 1: Run read-only preflight analysis
    logger.log("\n[STEP 1/4] Running pre-migration read-only verification...");
    const preflight = await analyzeShopIndexes(db, { logger });

    if (preflight.blockers.length > 0) {
      throw new Error(
        `Preflight blockers detected (${preflight.blockers.length}): ${preflight.blockers.join("; ")}`
      );
    }
    logger.log("✓ Preflight passed with 0 blockers.");

    // Step 2: Migrate shop_products
    logger.log("\n[STEP 2/4] Migrating shop_products indexes...");
    const prodCol = db.collection("shop_products");
    const prodIndexes = await prodCol.indexes();

    // 2a. sku_1
    const currentSkuIdx = prodIndexes.find((i) => i.name === "sku_1");
    if (currentSkuIdx && !currentSkuIdx.partialFilterExpression) {
      await safeDropIndex(prodCol, "sku_1", logger);
      await prodCol.createIndex(
        { sku: 1 },
        {
          name: "sku_1",
          unique: true,
          partialFilterExpression: { del_flag: 0 },
          background: true,
        }
      );
      await verifyIndexExists(prodCol, "sku_1", { sku: 1 }, { del_flag: 0 }, logger);
    } else if (currentSkuIdx && currentSkuIdx.partialFilterExpression) {
      logger.log("  ✓ Index 'sku_1' already matches target partial unique specification.");
    }

    // 2b. slug_1
    const currentSlugIdx = prodIndexes.find((i) => i.name === "slug_1");
    if (currentSlugIdx && !currentSlugIdx.partialFilterExpression) {
      await safeDropIndex(prodCol, "slug_1", logger);
      await prodCol.createIndex(
        { slug: 1 },
        {
          name: "slug_1",
          unique: true,
          partialFilterExpression: { del_flag: 0 },
          background: true,
        }
      );
      await verifyIndexExists(prodCol, "slug_1", { slug: 1 }, { del_flag: 0 }, logger);
    } else if (currentSlugIdx && currentSlugIdx.partialFilterExpression) {
      logger.log("  ✓ Index 'slug_1' already matches target partial unique specification.");
    }

    // Step 3: Migrate shop_categories
    logger.log("\n[STEP 3/4] Migrating shop_categories indexes...");
    const catCol = db.collection("shop_categories");
    const catIndexes = await catCol.indexes();

    const currentCatSlugIdx = catIndexes.find((i) => i.name === "slug_1");
    if (currentCatSlugIdx && !currentCatSlugIdx.partialFilterExpression) {
      await safeDropIndex(catCol, "slug_1", logger);
      await catCol.createIndex(
        { slug: 1 },
        {
          name: "slug_1",
          unique: true,
          partialFilterExpression: { del_flag: 0 },
          background: true,
        }
      );
      await verifyIndexExists(catCol, "slug_1", { slug: 1 }, { del_flag: 0 }, logger);
    } else if (currentCatSlugIdx && currentCatSlugIdx.partialFilterExpression) {
      logger.log("  ✓ Index 'slug_1' on shop_categories already matches target specification.");
    }

    // Step 4: Migrate ShopOrder idempotency index
    logger.log("\n[STEP 4/4] Migrating ShopOrder indexes...");
    const orderCol = db.collection("ShopOrder");
    const orderIndexes = await orderCol.indexes();

    const currentIdempIdx = orderIndexes.find((i) => i.name === "idempotencyKey_1");
    if (currentIdempIdx && !currentIdempIdx.unique) {
      await safeDropIndex(orderCol, "idempotencyKey_1", logger);
      await orderCol.createIndex(
        { idempotencyKey: 1 },
        {
          name: "idempotencyKey_1",
          unique: true,
          sparse: true,
          background: true,
        }
      );
      await verifyIndexExists(orderCol, "idempotencyKey_1", { idempotencyKey: 1 }, null, logger);
    } else if (currentIdempIdx && currentIdempIdx.unique) {
      logger.log("  ✓ Index 'idempotencyKey_1' already matches unique sparse specification.");
    }

    logger.log("\n==================================================================");
    logger.log("  MIGRATION COMPLETE & VERIFIED SUCCESSFULLY");
    logger.log("==================================================================");
    return { success: true, database: actualDbName };
  } finally {
    await connection.close().catch(() => {});
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`\n❌ MIGRATION HALTED: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  runMigration,
  safeDropIndex,
  verifyIndexExists,
};
