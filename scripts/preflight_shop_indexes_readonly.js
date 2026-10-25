#!/usr/bin/env node
// =============================================================================
//  OPENIDEAR SHOP — READ-ONLY PRODUCTION INDEX PREFLIGHT TOOL
//  scripts/preflight_shop_indexes_readonly.js
//
//  STRICT SAFETY RULES:
//  1. Strictly READ-ONLY operations (find, aggregate, countDocuments, indexes).
//  2. Never executes dropIndex, createIndex, update, delete, or bulkWrite.
//  3. Sanitizes all output: never prints passwords, URIs, or customer PII.
//  4. Exit codes:
//     0 = Preflight passed with 0 blockers and 0 warnings.
//     1 = Preflight completed, but blockers or warnings were detected.
//     2 = Could not safely run (connection failure, missing config, etc.).
// =============================================================================

"use strict";

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

/**
 * Sanitizes a MongoDB connection URI into safe logging identifiers.
 * Strips credentials, auth query params, and extracts safe host/db info.
 */
function sanitizeConnectionTarget(rawUri) {
  if (!rawUri || typeof rawUri !== "string") {
    return { valid: false, error: "No connection string provided" };
  }

  try {
    const parsed = new URL(rawUri);
    return {
      valid: true,
      protocol: parsed.protocol,
      host: parsed.host,
      database: (parsed.pathname || "/").replace(/^\//, "") || "(default)",
      hasAuth: Boolean(parsed.username || parsed.password),
    };
  } catch {
    // If standard URL parsing fails on mongodb+srv custom format
    const sanitized = rawUri.replace(
      /\/\/(?:[^:@]+(?::[^@]*)?@)?([^/?#]+)/,
      "//[REDACTED_CREDENTIALS]@$1"
    );
    const hostMatch = sanitized.match(/@([^/?#]+)/);
    const dbMatch = sanitized.match(/\/([^?#]+)/);
    return {
      valid: true,
      protocol: "mongodb/srv",
      host: hostMatch ? hostMatch[1] : "[unknown-host]",
      database: dbMatch ? dbMatch[1] : "(default)",
      hasAuth: true,
    };
  }
}

/**
 * Validates that an index options object matches the desired target specification.
 */
function isDesiredIndex(idx, keyPattern, partialFilter = null, sparse = false) {
  const keyMatch = JSON.stringify(idx.key) === JSON.stringify(keyPattern);
  if (!keyMatch) return false;

  if (partialFilter !== null) {
    return Boolean(
      idx.unique === true &&
      idx.partialFilterExpression &&
      JSON.stringify(idx.partialFilterExpression) ===
        JSON.stringify(partialFilter)
    );
  }

  if (sparse) {
    return Boolean(idx.unique === true && idx.sparse === true);
  }

  return Boolean(idx.unique === true);
}

/**
 * Pure analysis runner that executes read-only inspections against a MongoDB Database instance.
 * Accepts an optional logger to facilitate deterministic unit testing.
 */
async function analyzeShopIndexes(db, options = {}) {
  const logger = options.logger || console;
  const timeoutMs = options.timeoutMs || 10000;

  const results = {
    timestamp: new Date().toISOString(),
    environment: options.environmentIdentifier || "configured-target",
    collectionsFound: {},
    indexes: {},
    blockers: [],
    warnings: [],
    checks: {
      products: {},
      categories: {},
      orders: {},
    },
    satisfiedConstraints: [],
    actionItems: [],
  };

  // ─── 1. Check Collection Names ──────────────────────────────────────────────
  const collectionsList = await db.listCollections().toArray();
  const existingCollectionNames = new Set(collectionsList.map((c) => c.name));

  const targetCollections = {
    products: "shop_products",
    categories: "shop_categories",
    orders: "ShopOrder",
    analytics: "ShopAnalyticsEvent",
  };

  for (const [key, expectedName] of Object.entries(targetCollections)) {
    const exists = existingCollectionNames.has(expectedName);
    results.collectionsFound[expectedName] = exists;
    if (!exists) {
      results.warnings.push(
        `Expected collection '${expectedName}' (${key}) not found in database.`
      );
    }
  }

  // ─── 2. Inspect Existing Indexes ───────────────────────────────────────────
  for (const collName of Object.values(targetCollections)) {
    if (!existingCollectionNames.has(collName)) continue;

    const rawIndexes = await db.collection(collName).indexes();
    results.indexes[collName] = rawIndexes.map((idx) => ({
      name: idx.name,
      key: idx.key,
      unique: Boolean(idx.unique),
      sparse: Boolean(idx.sparse),
      partialFilterExpression: idx.partialFilterExpression || null,
    }));
  }

  // ─── 3. Inspect shop_products ───────────────────────────────────────────────
  if (existingCollectionNames.has("shop_products")) {
    const col = db.collection("shop_products");

    // A. Count del_flag distributions
    const totalProd = await col.countDocuments({});
    const activeProd = await col.countDocuments({ del_flag: 0 });
    const deletedProd = await col.countDocuments({ del_flag: 1 });
    const nonNumericDelFlag = await col.countDocuments({
      del_flag: { $not: { $type: "number" } },
    });

    results.checks.products.total = totalProd;
    results.checks.products.active = activeProd;
    results.checks.products.deleted = deletedProd;
    results.checks.products.nonNumericDelFlag = nonNumericDelFlag;

    if (nonNumericDelFlag > 0) {
      results.blockers.push(
        `shop_products has ${nonNumericDelFlag} record(s) where del_flag is not a numeric type.`
      );
    }

    // B. Check duplicate active SKUs
    const skuDups = await col
      .aggregate([
        { $match: { del_flag: 0 } },
        { $group: { _id: "$sku", count: { $sum: 1 }, docIds: { $push: "$_id" } } },
        { $match: { count: { $gt: 1 }, _id: { $ne: null } } },
      ])
      .toArray();

    results.checks.products.duplicateActiveSkus = skuDups.map((d) => ({
      sku: d._id,
      count: d.count,
      sampleIds: d.docIds.slice(0, 3).map((id) => String(id)),
    }));

    if (skuDups.length > 0) {
      results.blockers.push(
        `shop_products has ${skuDups.length} duplicate active SKU group(s). Partial unique index on sku will fail.`
      );
    }

    // C. Check duplicate active Slugs
    const slugDups = await col
      .aggregate([
        { $match: { del_flag: 0 } },
        { $group: { _id: "$slug", count: { $sum: 1 }, docIds: { $push: "$_id" } } },
        { $match: { count: { $gt: 1 }, _id: { $ne: null } } },
      ])
      .toArray();

    results.checks.products.duplicateActiveSlugs = slugDups.map((d) => ({
      slug: d._id,
      count: d.count,
      sampleIds: d.docIds.slice(0, 3).map((id) => String(id)),
    }));

    if (slugDups.length > 0) {
      results.blockers.push(
        `shop_products has ${slugDups.length} duplicate active slug group(s). Partial unique index on slug will fail.`
      );
    }

    // D. Check missing/empty active SKUs or slugs
    const emptyActiveSkus = await col.countDocuments({
      del_flag: 0,
      $or: [{ sku: null }, { sku: "" }, { sku: { $exists: false } }],
    });
    const emptyActiveSlugs = await col.countDocuments({
      del_flag: 0,
      $or: [{ slug: null }, { slug: "" }, { slug: { $exists: false } }],
    });
    results.checks.products.emptyActiveSkus = emptyActiveSkus;
    results.checks.products.emptyActiveSlugs = emptyActiveSlugs;

    if (emptyActiveSkus > 1) {
      results.blockers.push(
        `shop_products has ${emptyActiveSkus} active document(s) with null/empty SKU. Unique index will conflict.`
      );
    }
    if (emptyActiveSlugs > 1) {
      results.blockers.push(
        `shop_products has ${emptyActiveSlugs} active document(s) with null/empty slug. Unique index will conflict.`
      );
    }

    // E. Index Compatibility: evaluate sku & slug
    const prodIndexes = results.indexes["shop_products"] || [];
    const hasDesiredSku = prodIndexes.some((i) =>
      isDesiredIndex(i, { sku: 1 }, { del_flag: 0 })
    );
    const hasDesiredSlug = prodIndexes.some((i) =>
      isDesiredIndex(i, { slug: 1 }, { del_flag: 0 })
    );

    const legacySku = prodIndexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ sku: 1 }) && !hasDesiredSku
    );
    const legacySlug = prodIndexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ slug: 1 }) && !hasDesiredSlug
    );

    results.checks.products.hasDesiredSkuIndex = hasDesiredSku;
    results.checks.products.hasDesiredSlugIndex = hasDesiredSlug;

    if (!hasDesiredSku) {
      results.actionItems.push({
        collection: "shop_products",
        action: "REPLACE_INDEX",
        target: "{ sku: 1 }",
        current: legacySku ? legacySku.name : "none",
        desired: "{ unique: true, partialFilterExpression: { del_flag: 0 } }",
      });
    } else {
      results.satisfiedConstraints.push("shop_products.sku partial unique index is already satisfied.");
    }

    if (!hasDesiredSlug) {
      results.actionItems.push({
        collection: "shop_products",
        action: "REPLACE_INDEX",
        target: "{ slug: 1 }",
        current: legacySlug ? legacySlug.name : "none",
        desired: "{ unique: true, partialFilterExpression: { del_flag: 0 } }",
      });
    } else {
      results.satisfiedConstraints.push("shop_products.slug partial unique index is already satisfied.");
    }
  }

  // ─── 4. Inspect shop_categories ─────────────────────────────────────────────
  if (existingCollectionNames.has("shop_categories")) {
    const col = db.collection("shop_categories");

    const totalCat = await col.countDocuments({});
    const activeCat = await col.countDocuments({ del_flag: 0 });
    const deletedCat = await col.countDocuments({ del_flag: 1 });
    const nonNumericDelFlagCat = await col.countDocuments({
      del_flag: { $not: { $type: "number" } },
    });

    results.checks.categories.total = totalCat;
    results.checks.categories.active = activeCat;
    results.checks.categories.deleted = deletedCat;
    results.checks.categories.nonNumericDelFlag = nonNumericDelFlagCat;

    if (nonNumericDelFlagCat > 0) {
      results.blockers.push(
        `shop_categories has ${nonNumericDelFlagCat} record(s) where del_flag is not a numeric type.`
      );
    }

    const catSlugDups = await col
      .aggregate([
        { $match: { del_flag: 0 } },
        { $group: { _id: "$slug", count: { $sum: 1 }, docIds: { $push: "$_id" } } },
        { $match: { count: { $gt: 1 }, _id: { $ne: null } } },
      ])
      .toArray();

    results.checks.categories.duplicateActiveSlugs = catSlugDups.map((d) => ({
      slug: d._id,
      count: d.count,
      sampleIds: d.docIds.slice(0, 3).map((id) => String(id)),
    }));

    if (catSlugDups.length > 0) {
      results.blockers.push(
        `shop_categories has ${catSlugDups.length} duplicate active slug group(s). Partial unique index on slug will fail.`
      );
    }

    const emptyActiveCatSlugs = await col.countDocuments({
      del_flag: 0,
      $or: [{ slug: null }, { slug: "" }, { slug: { $exists: false } }],
    });
    results.checks.categories.emptyActiveSlugs = emptyActiveCatSlugs;

    if (emptyActiveCatSlugs > 1) {
      results.blockers.push(
        `shop_categories has ${emptyActiveCatSlugs} active document(s) with null/empty slug. Unique index will conflict.`
      );
    }

    const catIndexes = results.indexes["shop_categories"] || [];
    const hasDesiredCatSlug = catIndexes.some((i) =>
      isDesiredIndex(i, { slug: 1 }, { del_flag: 0 })
    );
    const legacyCatSlug = catIndexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ slug: 1 }) && !hasDesiredCatSlug
    );

    results.checks.categories.hasDesiredSlugIndex = hasDesiredCatSlug;

    if (!hasDesiredCatSlug) {
      results.actionItems.push({
        collection: "shop_categories",
        action: "REPLACE_INDEX",
        target: "{ slug: 1 }",
        current: legacyCatSlug ? legacyCatSlug.name : "none",
        desired: "{ unique: true, partialFilterExpression: { del_flag: 0 } }",
      });
    } else {
      results.satisfiedConstraints.push("shop_categories.slug partial unique index is already satisfied.");
    }
  }

  // ─── 5. Inspect ShopOrder ───────────────────────────────────────────────────
  if (existingCollectionNames.has("ShopOrder")) {
    const col = db.collection("ShopOrder");

    const totalOrders = await col.countDocuments({});
    const withKey = await col.countDocuments({
      idempotencyKey: { $exists: true, $type: "string", $nin: ["", null] },
    });
    const explicitNullKey = await col.countDocuments({ idempotencyKey: null });
    const missingKey = await col.countDocuments({ idempotencyKey: { $exists: false } });
    const emptyStringKey = await col.countDocuments({ idempotencyKey: "" });

    results.checks.orders.total = totalOrders;
    results.checks.orders.withValidKey = withKey;
    results.checks.orders.explicitNullKey = explicitNullKey;
    results.checks.orders.missingKey = missingKey;
    results.checks.orders.emptyStringKey = emptyStringKey;

    // Check duplicate non-empty idempotencyKey values
    const keyDups = await col
      .aggregate([
        {
          $match: {
            idempotencyKey: { $exists: true, $type: "string", $nin: ["", null] },
          },
        },
        {
          $group: {
            _id: "$idempotencyKey",
            count: { $sum: 1 },
            orderRefs: { $push: "$orderReference" },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();

    // Redact raw key if it could be sensitive, only report anonymized hash / length
    results.checks.orders.duplicateKeyCount = keyDups.length;
    results.checks.orders.duplicateKeyGroups = keyDups.map((d) => ({
      keyLength: String(d._id).length,
      count: d.count,
      orderReferences: d.orderRefs.slice(0, 3),
    }));

    if (keyDups.length > 0) {
      results.blockers.push(
        `ShopOrder has ${keyDups.length} duplicate idempotencyKey group(s). Unique index will fail.`
      );
    }

    if (explicitNullKey > 1) {
      results.warnings.push(
        `ShopOrder has ${explicitNullKey} orders with explicit null idempotencyKey. A sparse unique index indexes literal null, creating a duplicate-key conflict on null!`
      );
    }

    if (emptyStringKey > 1) {
      results.warnings.push(
        `ShopOrder has ${emptyStringKey} orders with empty string ("") idempotencyKey. Unique index will collide on empty strings.`
      );
    }

    const orderIndexes = results.indexes["ShopOrder"] || [];
    const desiredOrderKey = orderIndexes.find((i) =>
      isDesiredIndex(i, { idempotencyKey: 1 }, null, true)
    );
    const existingOrderKey = orderIndexes.find(
      (i) => JSON.stringify(i.key) === JSON.stringify({ idempotencyKey: 1 })
    );

    const isDesiredSatisfied = Boolean(desiredOrderKey);
    results.checks.orders.hasDesiredIdempotencyIndex = isDesiredSatisfied;

    if (!isDesiredSatisfied) {
      results.actionItems.push({
        collection: "ShopOrder",
        action: "REPLACE_INDEX",
        target: "{ idempotencyKey: 1 }",
        current: existingOrderKey
          ? `${existingOrderKey.name} (unique: ${Boolean(existingOrderKey.unique)}, sparse: ${Boolean(existingOrderKey.sparse)})`
          : "none",
        desired: "{ unique: true, sparse: true }",
      });
    } else {
      results.satisfiedConstraints.push("ShopOrder.idempotencyKey sparse unique index is already satisfied.");
    }
  }

  return results;
}

/**
 * CLI Entrypoint
 */
async function main() {
  const rawUri = process.env.MONGO_URL || process.env.MONGODB_URI;
  const targetInfo = sanitizeConnectionTarget(rawUri);

  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — READ-ONLY PRODUCTION INDEX PREFLIGHT");
  console.log("==================================================================");

  if (!targetInfo.valid) {
    console.error("❌ FATAL: Ambiguous or missing database configuration.");
    console.error("Please configure MONGO_URL in the backend environment.");
    process.exit(2);
  }

  console.log(`Target Host:     ${targetInfo.host}`);
  console.log(`Target Database: ${targetInfo.database}`);
  console.log(`Authentication:  ${targetInfo.hasAuth ? "Configured (Credentials Redacted)" : "None"}`);
  console.log("Mode:            STRICTLY READ-ONLY (No writes will be performed)");
  console.log("------------------------------------------------------------------");

  let connection = null;
  try {
    connection = await mongoose.createConnection(rawUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 15000,
    }).asPromise();

    const db = connection.db;
    const results = await analyzeShopIndexes(db, {
      environmentIdentifier: `${targetInfo.host}/${targetInfo.database}`,
    });

    console.log("\n[1] COLLECTION DISCOVERY:");
    for (const [coll, exists] of Object.entries(results.collectionsFound)) {
      console.log(`  ${exists ? "✓" : "✗"} Collection '${coll}': ${exists ? "Present" : "Missing"}`);
    }

    console.log("\n[2] DATA INTEGRITY CHECKS:");
    if (results.checks.products.total !== undefined) {
      console.log(`  - shop_products:`);
      console.log(`      Total: ${results.checks.products.total} | Active: ${results.checks.products.active} | Deleted: ${results.checks.products.deleted}`);
      console.log(`      Duplicate Active SKUs:   ${results.checks.products.duplicateActiveSkus.length}`);
      console.log(`      Duplicate Active Slugs:  ${results.checks.products.duplicateActiveSlugs.length}`);
      console.log(`      Non-numeric del_flag:    ${results.checks.products.nonNumericDelFlag}`);
      console.log(`      Empty/Missing Active SKU: ${results.checks.products.emptyActiveSkus}`);
      console.log(`      Empty/Missing Active Slug: ${results.checks.products.emptyActiveSlugs}`);
    }

    if (results.checks.categories.total !== undefined) {
      console.log(`  - shop_categories:`);
      console.log(`      Total: ${results.checks.categories.total} | Active: ${results.checks.categories.active} | Deleted: ${results.checks.categories.deleted}`);
      console.log(`      Duplicate Active Slugs:  ${results.checks.categories.duplicateActiveSlugs.length}`);
      console.log(`      Non-numeric del_flag:    ${results.checks.categories.nonNumericDelFlag}`);
      console.log(`      Empty/Missing Active Slug: ${results.checks.categories.emptyActiveSlugs}`);
    }

    if (results.checks.orders.total !== undefined) {
      console.log(`  - ShopOrder:`);
      console.log(`      Total Orders:            ${results.checks.orders.total}`);
      console.log(`      With Valid Key:          ${results.checks.orders.withValidKey}`);
      console.log(`      Explicit null Keys:      ${results.checks.orders.explicitNullKey}`);
      console.log(`      Missing Key Fields:      ${results.checks.orders.missingKey}`);
      console.log(`      Empty String Keys:       ${results.checks.orders.emptyStringKey}`);
      console.log(`      Duplicate Key Groups:    ${results.checks.orders.duplicateKeyCount}`);
    }

    console.log("\n[3] INDEX COMPATIBILITY & ACTIONS NEEDED:");
    if (results.actionItems.length === 0) {
      console.log("  ✓ All desired indexes already match target specifications.");
    } else {
      for (const item of results.actionItems) {
        console.log(`  • [${item.collection}] ${item.action} on ${item.target}`);
        console.log(`      Current: ${item.current}`);
        console.log(`      Desired: ${item.desired}`);
      }
    }

    console.log("\n==================================================================");
    console.log("  PREFLIGHT VERDICT");
    console.log("==================================================================");

    if (results.blockers.length > 0) {
      console.log(`❌ STATUS: BLOCKED (${results.blockers.length} blocker(s) detected)`);
      for (const b of results.blockers) {
        console.log(`   - [BLOCKER] ${b}`);
      }
      if (results.warnings.length > 0) {
        for (const w of results.warnings) {
          console.log(`   - [WARNING] ${w}`);
        }
      }
      process.exit(1);
    } else if (results.warnings.length > 0) {
      console.log(`⚠️ STATUS: WARNINGS DETECTED (${results.warnings.length} warning(s))`);
      for (const w of results.warnings) {
        console.log(`   - [WARNING] ${w}`);
      }
      process.exit(1);
    } else {
      console.log("✅ STATUS: READY FOR OWNER REVIEW (0 blockers, 0 warnings)");
      console.log("   Data satisfies all intended unique constraints.");
      console.log("   Migration script can proceed to operator approval.");
      process.exit(0);
    }
  } catch (err) {
    console.error(`❌ FATAL ERROR running preflight: ${err.message}`);
    process.exit(2);
  } finally {
    if (connection) {
      await connection.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  sanitizeConnectionTarget,
  isDesiredIndex,
  analyzeShopIndexes,
};
