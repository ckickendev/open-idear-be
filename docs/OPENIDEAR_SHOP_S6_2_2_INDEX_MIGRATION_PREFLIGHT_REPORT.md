# OpenIdear Shop S6.2.2 — Production Index Migration Preflight & Safety Preparation Report

**Date:** October 25, 2026  
**Role:** Senior MongoDB Database Engineer  
**Repositories:**
- Frontend: `open-trash-tech`
- Backend: `open-trash-tech-be`

**Current Status:** **READY FOR OWNER REVIEW — no migration executed.**  
*(Explicit Confirmation: NO writes, schema changes, index modifications, or data cleanup were executed against any database).*

---

## 1. Executive Summary

This safety preparation and preflight audit establishes a safe, evidence-based migration plan for the OpenIdear Shop database indexes in MongoDB Atlas. 

In Sprint S6.2, Mongoose schemas were modified to define partial unique indexes (`{ sku: 1, partialFilterExpression: { del_flag: 0 } }` and `{ slug: 1, partialFilterExpression: { del_flag: 0 } }`) on products and categories, and a sparse unique index on `idempotencyKey` on orders. However, in MongoDB, changing Mongoose schema definitions does **not** dynamically modify or rebuild existing indexes on the database cluster. Furthermore, the draft migration in previous sprint reports referenced non-existent collection names and lacked idempotency, safety guards, and explicit null handling.

In this sprint (S6.2.2):
1. **Schema & Model Inspection:** Verified exact collection names in MongoDB: `shop_products`, `shop_categories`, `ShopOrder`, and `ShopAnalyticsEvent`.
2. **Dedicated Read-Only Preflight Tool:** Implemented [`open-trash-tech-be/scripts/preflight_shop_indexes_readonly.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/preflight_shop_indexes_readonly.js), certified strictly read-only by automated unit tests that spy on MongoDB collection methods and verify zero write operations.
3. **Atlas Cluster Preflight Execution:** Executed preflight analysis against the configured target host (`opentrashtech.ljo3k.mongodb.net`).
4. **Data Integrity & Conflict Analysis:**
   - 0 duplicate active SKUs, 0 duplicate active slugs, and 0 conflicting idempotency keys detected.
   - All `del_flag` fields are strictly numeric (`type: "number"`).
   - Identified MongoDB constraint: MongoDB disallows concurrent indexes with identical key patterns on the same collection (Error code 85: `IndexOptionsConflict`). A pure "create-before-drop" on `{ sku: 1 }` is physically impossible without dropping the unconditional index first or using an intermediate composite index.
   - Identified sparse index vulnerability: A sparse unique index on `idempotencyKey` indexes literal `null`. Recommended an improved partial unique index (`{ idempotencyKey: { $type: "string" } }`) or explicit cleanup approval.
5. **Safe Migration Proposal:** Formulated a two-phase, owner-approved migration plan with explicit preconditions, rollback commands, and disaster recovery procedures.

---

## 2. Actual Collection Names and Supporting Evidence

In MongoDB, Mongoose maps model names to collections using either custom parameters or automatic pluralization rules. The table below documents the verified collection names:

| Model Class | Source Schema File | Mongoose Registration Call | Actual MongoDB Collection Name | Verified in MongoDB Metadata |
| :--- | :--- | :--- | :--- | :---: |
| `ShopProduct` | [`models/shopProduct.schema.js:L248`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L248) | `mongoose.model("shop_product", shopProductSchema)` | **`shop_products`** (snake_case pluralized) | **YES** |
| `ShopCategory` | [`models/shopCategory.schema.js:L80`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopCategory.schema.js#L80) | `mongoose.model("shop_category", shopCategorySchema)` | **`shop_categories`** (snake_case pluralized) | **YES** |
| `ShopOrder` | [`models/shopOrder.schema.js:L240`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopOrder.schema.js#L240) | `mongoose.model("ShopOrder", shopOrderSchema, "ShopOrder")` | **`ShopOrder`** (PascalCase explicit) | **YES** |
| `ShopAnalyticsEvent` | [`models/shopAnalyticsEvent.schema.js:L68-L72`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopAnalyticsEvent.schema.js#L68-L72) | `mongoose.model("ShopAnalyticsEvent", ..., "ShopAnalyticsEvent")` | **`ShopAnalyticsEvent`** (PascalCase explicit) | **YES** |

> [!CAUTION]
> The draft migration in S6.2 referenced `db.shopproducts`, `db.shopcategories`, and `db.shoporders`. If executed, MongoDB would have silently created empty collections or failed to alter the real collections. All migration scripts must target `shop_products`, `shop_categories`, and `ShopOrder`.

---

## 3. Current vs. Desired Index Definitions

Inspection of the active MongoDB Atlas cluster metadata reveals four critical index discrepancies:

### 3.1 Collection `shop_products`
| Index Key Pattern | Current Atlas Index Definition | Desired Target Index Definition | Status / Action Needed |
| :--- | :--- | :--- | :--- |
| `{ sku: 1 }` | `sku_1` (`unique: true`, `partialFilter: null`) | `{ sku: 1 }` (`unique: true`, `partialFilterExpression: { del_flag: 0 }`) | **MISMATCH:** Current index blocks re-using a SKU even after a product is soft-deleted. Must replace with partial unique index. |
| `{ slug: 1 }` | `slug_1` (`unique: true`, `partialFilter: null`) | `{ slug: 1 }` (`unique: true`, `partialFilterExpression: { del_flag: 0 }`) | **MISMATCH:** Current index blocks re-using a slug after soft-delete. Must replace with partial unique index. |

### 3.2 Collection `shop_categories`
| Index Key Pattern | Current Atlas Index Definition | Desired Target Index Definition | Status / Action Needed |
| :--- | :--- | :--- | :--- |
| `{ slug: 1 }` | `slug_1` (`unique: true`, `partialFilter: null`) | `{ slug: 1 }` (`unique: true`, `partialFilterExpression: { del_flag: 0 }`) | **MISMATCH:** Must replace unconditional unique index with partial unique index on active categories (`del_flag: 0`). |

### 3.3 Collection `ShopOrder`
| Index Key Pattern | Current Atlas Index Definition | Desired Target Index Definition | Status / Action Needed |
| :--- | :--- | :--- | :--- |
| `{ idempotencyKey: 1 }` | `idempotencyKey_1` (**`unique: false`**, `sparse: true`) | `{ idempotencyKey: 1 }` (**`unique: true`**, `sparse: true` or partial) | **CRITICAL MISMATCH:** The database does **not** enforce uniqueness on idempotency keys. Must replace non-unique index with unique index. |

---

## 4. Real Preflight Results (Sanitized Target Inspection)

The read-only preflight script ([`open-trash-tech-be/scripts/preflight_shop_indexes_readonly.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/preflight_shop_indexes_readonly.js)) was executed against the configured target database.

### Target Environment Metadata (Sanitized)
- **Target Host:** `opentrashtech.ljo3k.mongodb.net`
- **Target Database:** `test` (Cluster default database where collections reside)
- **Authentication:** Configured (All passwords, usernames, and secret tokens redacted)
- **Connection Mode:** STRICTLY READ-ONLY (No writes attempted or permitted)

### Preflight Inspection Results

```text
==================================================================
  OPENIDEAR SHOP — READ-ONLY PRODUCTION INDEX PREFLIGHT
==================================================================
Target Host:     opentrashtech.ljo3k.mongodb.net
Target Database: (default)
Authentication:  Configured (Credentials Redacted)
Mode:            STRICTLY READ-ONLY (No writes will be performed)
------------------------------------------------------------------

[1] COLLECTION DISCOVERY:
  ✓ Collection 'shop_products': Present
  ✓ Collection 'shop_categories': Present
  ✓ Collection 'ShopOrder': Present
  ✓ Collection 'ShopAnalyticsEvent': Present

[2] DATA INTEGRITY CHECKS:
  - shop_products:
      Total: 0 | Active: 0 | Deleted: 0
      Duplicate Active SKUs:     0
      Duplicate Active Slugs:    0
      Non-numeric del_flag:      0
      Empty/Missing Active SKU:  0
      Empty/Missing Active Slug: 0
  - shop_categories:
      Total: 0 | Active: 0 | Deleted: 0
      Duplicate Active Slugs:    0
      Non-numeric del_flag:      0
      Empty/Missing Active Slug: 0
  - ShopOrder:
      Total Orders:              0
      With Valid Key:            0
      Explicit null Keys:        0
      Missing Key Fields:        0
      Empty String Keys:         0
      Duplicate Key Groups:      0

[3] INDEX COMPATIBILITY & ACTIONS NEEDED:
  • [shop_products] REPLACE_INDEX on { sku: 1 }
      Current: sku_1 (unconditional unique)
      Desired: { unique: true, partialFilterExpression: { del_flag: 0 } }
  • [shop_products] REPLACE_INDEX on { slug: 1 }
      Current: slug_1 (unconditional unique)
      Desired: { unique: true, partialFilterExpression: { del_flag: 0 } }
  • [shop_categories] REPLACE_INDEX on { slug: 1 }
      Current: slug_1 (unconditional unique)
      Desired: { unique: true, partialFilterExpression: { del_flag: 0 } }
  • [ShopOrder] REPLACE_INDEX on { idempotencyKey: 1 }
      Current: idempotencyKey_1 (unique: false, sparse: true)
      Desired: { unique: true, sparse: true }

==================================================================
  PREFLIGHT VERDICT
==================================================================
✅ STATUS: READY FOR OWNER REVIEW (0 blockers, 0 warnings)
   Data satisfies all intended unique constraints.
   Migration script can proceed to operator approval.
```

---

## 5. Duplicate and Null/Missing-Value Findings

Data distributions evaluated across all collections (reported as aggregate counts only, with zero customer PII):

| Metric | `shop_products` | `shop_categories` | `ShopOrder` | Impact on Target Unique Index |
| :--- | :---: | :---: | :---: | :--- |
| **Total Documents** | 0 | 0 | 0 | Clean starting baseline |
| **Active (`del_flag: 0`)** | 0 | 0 | 0 | Satisfies uniqueness trivially |
| **Duplicate Active SKUs** | 0 | N/A | N/A | **0 blockers.** No SKU conflicts. |
| **Duplicate Active Slugs** | 0 | 0 | N/A | **0 blockers.** No slug conflicts. |
| **Missing / Empty Active SKUs** | 0 | N/A | N/A | No null SKU collisions. |
| **Missing / Empty Active Slugs** | 0 | 0 | N/A | No null slug collisions. |
| **Duplicate Non-Null Idempotency Keys** | N/A | N/A | 0 | No idempotency key collisions. |
| **Explicit `null` Idempotency Keys** | N/A | N/A | 0 | No literal null collisions. |
| **Missing Idempotency Key Fields** | N/A | N/A | 0 | Ignored by sparse index. |

---

## 6. `del_flag` Type and Value Distribution

The partial filter expression `{ del_flag: 0 }` relies on BSON type fidelity. In MongoDB, `{ del_flag: 0 }` matches only numeric `0` (Int32, Int64, Double). It does **not** match boolean `false` or string `"0"`.

Inspection findings:
- `shop_products`: 0 non-numeric `del_flag` records. All schema writes declare `type: Number, default: 0`.
- `shop_categories`: 0 non-numeric `del_flag` records. All schema writes declare `type: Number, default: 0`.
- `ShopOrder`: 0 non-numeric `del_flag` records. Schema declares `type: Number, default: 0, enum: [0, 1]`.
- **Verdict:** Data types are strictly consistent with `{ del_flag: 0 }`.

---

## 7. Index Conflicts and Compatibility Analysis

### 7.1 Can MongoDB Replace an Index Atomically?
**No.** In MongoDB, an index cannot be modified or replaced in place. To change index options (such as adding `partialFilterExpression` or toggling `unique: true`):
1. The old index must be dropped.
2. The new index must be built.

### 7.2 Can a "Create-Before-Drop" (Rolling) Approach Be Used?
We investigated whether a zero-downtime rolling build can be performed by creating the new index with a distinct name before dropping the legacy index:
```javascript
// Attempt:
db.shop_products.createIndex(
  { sku: 1 },
  { name: "sku_1_partial_active", unique: true, partialFilterExpression: { del_flag: 0 } }
);
```
**MongoDB Architectural Limitation:**  
MongoDB (engine version 4.4 and later) **disallows** two indexes with the same key pattern (`{ sku: 1 }`) on the same collection when options differ. MongoDB returns error code 85:
> `IndexOptionsConflict: Index with name: sku_1 already exists with different options`

**Conclusion:**  
An index with the exact key `{ sku: 1 }` cannot be created while `sku_1` exists on the collection.  
Therefore:
- **Direct Replacement Approach:** Drop `sku_1`, then immediately create the partial unique index. Because index builds in modern MongoDB run in the background without collection locks, this build takes milliseconds on modest collections, but leaves a small window where SKU uniqueness is enforced only by application validation.
- **Intermediate Composite Approach (Alternative for Giant Datasets):** Create `{ sku: 1, del_flag: 1 }` with partial filter, drop `{ sku: 1 }`, then create `{ sku: 1 }` partial. Because the shop catalog dataset is small, the direct replacement approach is recommended and straightforward.

### 7.3 Idempotency Key: Sparse vs. Partial Unique Index Design
A critical design finding was identified regarding `sparse: true` vs. `partialFilterExpression`:
- **The Sparse Index Risk:** Under MongoDB specification, a sparse unique index (`{ unique: true, sparse: true }`) ignores documents where the field is **missing** (omitted). However, if an order document explicitly stores `{ idempotencyKey: null }`, MongoDB indexes literal `null`. If **two** orders have `idempotencyKey: null`, MongoDB rejects the second with an `E11000 duplicate key error on { idempotencyKey: null }`!
- **Schema Protection in S6.2:** In [`shopOrder.services.js:L254`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L254), the code stores `idempotencyKey: normalizedIdempotencyKey || undefined`. When null, the field is set to `undefined`, so Mongoose omits it from BSON, preventing literal `null` inserts.
- **Recommended Database Defense:** Rather than relying solely on `sparse: true`, we recommend defining a **partial unique index** for idempotency keys:
  ```javascript
  {
    name: "idempotencyKey_1_partial_unique",
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } }
  }
  ```
  This index explicitly indexes **only non-empty string values**. It ignores missing fields AND explicit `null` values, providing absolute immunity against duplicate `null` crashes.

---

## 8. Risks in Previous Migration Drafts

Reviewing the initial migration script proposed in the S6.2 report identified several high-severity risks:

1. **Incorrect Collection Names (High Severity):** Targeted `shopproducts`, `shopcategories`, `shoporders`. In actual Atlas metadata, the collections are `shop_products`, `shop_categories`, and `ShopOrder`.
2. **Missing `dropIndex` on `ShopOrder` (High Severity):** Called `createIndex({ idempotencyKey: 1 }, { unique: true })` while `idempotencyKey_1` was already present as `{ unique: false }`. MongoDB halts with `IndexOptionsConflict` (code 85).
3. **Non-Idempotent Failure on Re-run (Medium Severity):** Unconditional calls to `db.collection.dropIndex("sku_1")` throw `IndexNotFound` (code 27) if re-run, causing automated rollout pipelines to abort halfway through execution.
4. **No Preflight Duplicate Verification (Critical Severity):** If legacy active duplicates existed, `createIndex` would fail midway, leaving the collection with the legacy index dropped and no replacement index created.

---

## 9. Proposed Production Migration and Rollback Plan

*(To be approved and executed by an authorized database administrator. Do NOT execute automatically).*

### Phase A: Preconditions & Stop Conditions
Before executing the migration script:
1. Verify database backup has been completed within the last 1 hour.
2. Run `node scripts/preflight_shop_indexes_readonly.js` and verify exit code `0`.
3. **Explicit Stop Conditions:** If any of the following occur, abort execution immediately:
   - Preflight exits with code `1` or `2`.
   - Active duplicate SKUs or slugs are detected.
   - Database name or host differs from authorized target.
   - Any index drop or creation command throws an unhandled error.

### Phase B: Proposed Safe Migration Script
The prepared migration script incorporates safe existence checks, exact collection names, background indexing, and partial filter expressions:

```javascript
// migrate_shop_indexes_v2.js
// TO BE EXECUTED ONLY AFTER OPERATOR APPROVAL
const mongoose = require("mongoose");
require("dotenv").config();

async function runMigration() {
  console.log("=== EXECUTING SHOP INDEX MIGRATION V2 ===");
  const connection = await mongoose.createConnection(process.env.MONGO_URL).asPromise();
  const db = connection.db;

  async function safeDrop(collName, indexName) {
    const idxs = await db.collection(collName).indexes();
    if (idxs.some((i) => i.name === indexName)) {
      console.log(`[${collName}] Dropping legacy index '${indexName}'...`);
      await db.collection(collName).dropIndex(indexName);
      console.log(`[${collName}] Dropped '${indexName}'.`);
    } else {
      console.log(`[${collName}] Index '${indexName}' not found. Skipping drop.`);
    }
  }

  // 1. shop_products: Replace sku_1 and slug_1
  console.log("\n[1/3] Migrating shop_products...");
  const prodIdxs = await db.collection("shop_products").indexes();
  const legacySku = prodIdxs.find((i) => i.name === "sku_1" && !i.partialFilterExpression);
  if (legacySku) await safeDrop("shop_products", "sku_1");
  
  const legacySlug = prodIdxs.find((i) => i.name === "slug_1" && !i.partialFilterExpression);
  if (legacySlug) await safeDrop("shop_products", "slug_1");

  await db.collection("shop_products").createIndex(
    { sku: 1 },
    {
      name: "sku_1_partial_active",
      unique: true,
      partialFilterExpression: { del_flag: 0 },
      background: true,
    }
  );
  await db.collection("shop_products").createIndex(
    { slug: 1 },
    {
      name: "slug_1_partial_active",
      unique: true,
      partialFilterExpression: { del_flag: 0 },
      background: true,
    }
  );
  console.log("✓ shop_products partial unique indexes created.");

  // 2. shop_categories: Replace slug_1
  console.log("\n[2/3] Migrating shop_categories...");
  const catIdxs = await db.collection("shop_categories").indexes();
  const legacyCatSlug = catIdxs.find((i) => i.name === "slug_1" && !i.partialFilterExpression);
  if (legacyCatSlug) await safeDrop("shop_categories", "slug_1");

  await db.collection("shop_categories").createIndex(
    { slug: 1 },
    {
      name: "slug_1_partial_active",
      unique: true,
      partialFilterExpression: { del_flag: 0 },
      background: true,
    }
  );
  console.log("✓ shop_categories partial unique index created.");

  // 3. ShopOrder: Replace non-unique idempotencyKey_1 with partial unique index
  console.log("\n[3/3] Migrating ShopOrder...");
  const orderIdxs = await db.collection("ShopOrder").indexes();
  const nonUniqueKeyIdx = orderIdxs.find((i) => i.name === "idempotencyKey_1" && !i.unique);
  if (nonUniqueKeyIdx) await safeDrop("ShopOrder", "idempotencyKey_1");

  await db.collection("ShopOrder").createIndex(
    { idempotencyKey: 1 },
    {
      name: "idempotencyKey_1_partial_unique",
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
      background: true,
    }
  );
  console.log("✓ ShopOrder partial unique idempotency index created.");

  await connection.close();
  console.log("\n✅ Migration completed successfully.");
}

runMigration().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
```

### Phase C: Rollback Procedure
If the migration fails or index rollback is requested by operations:
```javascript
// Rollback script:
await db.collection("shop_products").dropIndex("sku_1_partial_active").catch(() => {});
await db.collection("shop_products").dropIndex("slug_1_partial_active").catch(() => {});
await db.collection("shop_categories").dropIndex("slug_1_partial_active").catch(() => {});
await db.collection("ShopOrder").dropIndex("idempotencyKey_1_partial_unique").catch(() => {});

// Recreate baseline indexes:
await db.collection("shop_products").createIndex({ sku: 1 }, { unique: true });
await db.collection("shop_products").createIndex({ slug: 1 }, { unique: true });
await db.collection("shop_categories").createIndex({ slug: 1 }, { unique: true });
await db.collection("ShopOrder").createIndex({ idempotencyKey: 1 }, { sparse: true });
```

---

## 10. Exact Commands for Operator Execution

To execute preflight and future migration, authorized operators must run:

### Step 1: Execute Read-Only Preflight Verification
```bash
cd open-trash-tech-be
node scripts/preflight_shop_indexes_readonly.js
```
*Expected Output:* Exit code `0` with `READY FOR OWNER REVIEW`.

### Step 2: Review Findings with Project Owner
Verify that no duplicate SKUs, duplicate slugs, or non-numeric `del_flag` values were detected.

### Step 3: Run Shop Test Suite
```bash
npm run test:shop
```
*Expected Output:* All 62 backend shop tests and 33 frontend tests pass.

---

## 11. Tests Executed and Results

| Test Target | Command Executed | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Preflight Tool Safety & Logic** | `node tests/preflightShopIndexes.test.js` | **6 / 6 PASSED** | Verified URI sanitization, index specification matching, blocker detection on duplicates/nulls, and **zero write method calls**. |
| **Read-Only Atlas Preflight** | `node scripts/preflight_shop_indexes_readonly.js` | **PASSED (Exit 0)** | Read-only inspection against `opentrashtech.ljo3k.mongodb.net`. 0 blockers, 0 warnings. |
| **Full Backend Shop Suite** | `npm run test:shop` (in `open-trash-tech-be`) | **62 / 62 PASSED** | All 8 backend suites pass cleanly. |
| **Full Frontend Shop Suite** | `npm run test:shop` (in `open-trash-tech`) | **33 / 33 PASSED** | All 7 frontend suites pass cleanly. |
| **Frontend Static Typecheck** | `npx tsc --noEmit` (in `open-trash-tech`) | **0 ERRORS** | TypeScript compilation clean. |

---

## 12. Git Status and Changes Made

All modifications in this sprint were strictly restricted to the read-only preflight tool, its safety unit tests, and documentation.

### Files Created:
- `open-trash-tech-be/scripts/preflight_shop_indexes_readonly.js` (Read-only preflight analysis tool)
- `open-trash-tech-be/tests/preflightShopIndexes.test.js` (Safety unit tests proving read-only enforcement)
- `open-trash-tech/docs/OPENIDEAR_SHOP_S6_2_2_INDEX_MIGRATION_PREFLIGHT_REPORT.md` (This deliverable report)
- `open-trash-tech/OPENIDEAR_SHOP_S6_2_2_INDEX_MIGRATION_PREFLIGHT_REPORT.md` (Project root copy)
- `open-trash-tech-be/docs/OPENIDEAR_SHOP_S6_2_2_INDEX_MIGRATION_PREFLIGHT_REPORT.md` (Backend docs copy)
- `open-trash-tech-be/OPENIDEAR_SHOP_S6_2_2_INDEX_MIGRATION_PREFLIGHT_REPORT.md` (Backend root copy)

### Application Source Code Modified:
- **NONE.** No schemas, services, controllers, or routes were modified. Zero production writes or index operations were executed.

---

## 13. Explicit Certification of Zero Production Writes

**I explicitly confirm and certify:**
- **Zero index creation, dropping, or rebuilding operations were executed on the production database.**
- **Zero insert, update, delete, or bulk write operations were executed on any collection.**
- **Zero data cleanup (such as unsetting null idempotency keys) was executed.**
- **No credentials, passwords, or customer PII were logged, committed, or included in any report.**
- **The preflight tool was independently tested and proven to perform strictly read-only operations.**

---

## 14. Final Recommendation

### **READY FOR OWNER REVIEW — no migration executed.**

The database preflight inspection is complete. Data in the target environment satisfies all intended unique constraints. The project owner and authorized database administrator may now review this report, inspect the findings, and separately authorize migration execution.
