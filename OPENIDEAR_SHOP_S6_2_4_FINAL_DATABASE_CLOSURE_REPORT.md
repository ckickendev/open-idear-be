# OpenIdear Shop S6.2.4 — Final Database Migration & Closure Report

**Date:** October 25, 2026  
**Role:** Senior MongoDB Database Engineer & Production Reliability Engineer  
**Repositories:**
- Frontend: `open-trash-tech`
- Backend: `open-trash-tech-be`

**Sprint Gate:** S6.2.4 — Final Database Migration & Closure Gate  
**Final Verdict:** **BLOCKED — OWNER ACTION REQUIRED**  
*(Reason: The owner has confirmed database `test` is retained. However, production deployment access to cloud hosting environments is unavailable locally, and cloud snapshot backup verification must be confirmed by the owner before executing production index mutations. Zero writes, index changes, or document modifications were executed).*

---

## 1. Executive Summary

This report establishes the final database closure evaluation for the OpenIdear Shop following owner guidance:
1. **Owner Decision on Database Identity:** The owner has explicitly decided to **KEEP the existing MongoDB database named `test`**. No data will be migrated to `open-idear`, and the database will not be renamed or replaced.
2. **Target Database Status:** All 45 application collections of OpenIdear reside in database **`"test"`** on MongoDB Atlas cluster `opentrashtech.ljo3k.mongodb.net`. The active local backend instance (`http://localhost:5001`) connects to this database.
3. **Deployment Environment Inspection:** The deployed frontend runs on Vercel (`https://openidear.vercel.app`). The remote domain `api.openidear.xyz` is currently unreachable (unconfigured DNS). Cloud hosting configurations (e.g. Netlify/Cloud Run container dashboards) are not accessible from the repository workspace.
4. **Migration Readiness:** The hardened migration script [`scripts/migrate_shop_indexes_v2.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrate_shop_indexes_v2.js) has been verified to enforce explicit `--database=test` validation, preflight blocker gating, sequential index replacement, metadata verification, and guaranteed rerun idempotency.
5. **Mongoose `autoIndex: true` Harmony:** Target index definitions strictly match Mongoose schema index names (`sku_1`, `slug_1`, `idempotencyKey_1`) and options (`sparse: true`), eliminating startup `IndexOptionsConflict` errors.
6. **Gate Verdict:** Because production deployment container access and Atlas cloud backup verification cannot be performed from the local workspace, the sprint gate is strictly designated **BLOCKED — OWNER ACTION REQUIRED**. A complete, step-by-step checklist is provided for the owner to finalize execution during an approved maintenance window.

---

## 2. Step 1 — Confirmed Backend Environment & Database Identity

### 2.1 Environment Identity Matrix

| Environment | Intended Database | Effective Database | Supporting Evidence | Confidence Level |
| :--- | :--- | :--- | :--- | :---: |
| **Local Development** | **`"test"`** (Owner Decision) | **`"test"`** | Local `.env` connects to `opentrashtech.ljo3k.mongodb.net/` (empty path defaults to `"test"`). Health endpoint probe at `http://localhost:5001/health` confirms `database.status: "Connected"`, `database.name: "test"`. | **HIGH** |
| **Staging** | *None* | *None* | No separate staging environment file, staging branch config, or dedicated staging cluster was found in either repository. | **N/A** (No staging environment) |
| **Production / Pilot** | **`"test"`** (Owner Decision) | **`"test"`** (on active Atlas cluster) | On Atlas cluster `opentrashtech.ljo3k.mongodb.net`, database `"test"` holds all 45 collections (8.65 MB). Production cloud deployment host configuration is not locally accessible. | **PENDING OWNER CONFIRMATION** |

### 2.2 Distinction of Database Concepts
- **Database selected by the URI:** `"test"` (because `MONGO_URL` omits the path segment `/databaseName`).
- **Database used by currently running backend:** `"test"` (verified via `http://localhost:5001/health` returning `database.name: "test"`).
- **Database the project owner intends to designate as production:** **`"test"`** (authoritatively confirmed in the S6.2.4 owner decision).

### 2.3 Deployment Configuration Analysis
- **Frontend Deployment:** Deployed on Vercel at `https://openidear.vercel.app`. Probing the live HTML confirmed Next.js 15 client bundles.
- **Backend Deployment:** In `.env.example`, `BACKEND_URL` is listed as `https://openidear.vercel.app`, and `README.md` references `https://api.openidear.xyz`. Live network probing revealed:
  - `https://api.openidear.xyz`: DNS lookup returned `NXDOMAIN` (unconfigured DNS).
  - `.netlify/state.json`: Contains `siteId: "d0086797-e6cc-43dc-b751-6599a23733f0"`.
  - `dockerfile`: Packages Node 22 on port 8080.
- **Limitation Statement:** The actual cloud host container or server running the remote production backend cannot be inspected from git repository files alone. The owner must confirm whether the pilot traffic connects to a cloud-hosted container or whether the local/pilot instance is being promoted.

---

## 3. Step 2 — Target Index Definitions & Mongoose Synchronization

### 3.1 Target Index Definitions
Inspection of schema declarations and database metadata confirms the four required target index replacements on database `test`:

| Collection | Key Pattern | Current Atlas Definition | Target Index Definition | Schema Location |
| :--- | :--- | :--- | :--- | :--- |
| `shop_products` | `{ sku: 1 }` | `sku_1` (`unique: true, partial: null`) | `{ name: "sku_1", unique: true, partialFilterExpression: { del_flag: 0 }, background: true }` | [`shopProduct.schema.js:L240`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L240) |
| `shop_products` | `{ slug: 1 }` | `slug_1` (`unique: true, partial: null`) | `{ name: "slug_1", unique: true, partialFilterExpression: { del_flag: 0 }, background: true }` | [`shopProduct.schema.js:L244`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L244) |
| `shop_categories` | `{ slug: 1 }` | `slug_1` (`unique: true, partial: null`) | `{ name: "slug_1", unique: true, partialFilterExpression: { del_flag: 0 }, background: true }` | [`shopCategory.schema.js:L75`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopCategory.schema.js#L75) |
| `ShopOrder` | `{ idempotencyKey: 1 }` | `idempotencyKey_1` (**`unique: false`**, `sparse: true`) | `{ name: "idempotencyKey_1", unique: true, sparse: true, background: true }` | [`shopOrder.schema.js:L180-L186`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopOrder.schema.js#L180-L186) |

### 3.2 Mongoose `autoIndex: true` Harmony
In [`functions/appServer.js:L133`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/functions/appServer.js#L133), `autoIndex: true` is enabled:
- **Startup Compatibility:** Because the migration script creates indexes using standard Mongoose names (`sku_1`, `slug_1`, `idempotencyKey_1`) with options matching the schema definitions, Mongoose's startup routine recognizes the existing indexes and performs zero conflicting modifications.
- **Production Recommendation (Future Sprint):** In MongoDB production environments, running with `autoIndex: true` on auto-scaled containers introduces startup latency and cold-start index build risks. In a future sprint, update `appServer.js` to set `autoIndex: process.env.NODE_ENV !== "production"`.

### 3.3 Idempotency Key Semantics Analysis
- **API Handling:** [`shopOrder.services.js:L106-L121`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L106-L121) rejects empty strings (`""`), whitespace, non-strings, and keys longer than 128 chars with HTTP 400.
- **BSON Storage:** [`shopOrder.services.js:L254`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L254) sets `idempotencyKey: normalizedIdempotencyKey || undefined`. BSON serializer completely omits `undefined` fields from stored documents. Literal `null` is never stored.
- **Preflight Verification:** Confirmed 0 orders with literal `null` in database `test`.
- **Verdict:** Sparse unique index (`{ unique: true, sparse: true }`) perfectly matches application semantics and schema definitions without conflict.

---

## 4. Step 3 — Backup Readiness & Preflight Results

### 4.1 Backup Readiness Status
- **Client Tool Assessment:** Tested local `/opt/homebrew/bin/mongodump`. Due to macOS IPv6/DNS SRV resolution restrictions against `_mongodb._tcp.opentrashtech.ljo3k.mongodb.net`, CLI dumping cannot be guaranteed from local developer machines.
- **Enterprise Recovery Procedure:** On MongoDB Atlas, backups are managed through **Atlas Cloud Continuous Backup (Point-in-Time Restore)**. The project owner or cloud administrator must verify that an Atlas snapshot backup exists before executing the migration.

### 4.2 Sanitized Preflight Execution Results
Executed [`scripts/preflight_shop_indexes_readonly.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/preflight_shop_indexes_readonly.js) against confirmed database `test`:

```text
==================================================================
  OPENIDEAR SHOP — READ-ONLY PRODUCTION INDEX PREFLIGHT
==================================================================
Target Host:     opentrashtech.ljo3k.mongodb.net
Target Database: (default) [test]
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
      Duplicate Active SKUs:   0
      Duplicate Active Slugs:  0
      Non-numeric del_flag:    0
      Empty/Missing Active SKU: 0
      Empty/Missing Active Slug: 0
  - shop_categories:
      Total: 0 | Active: 0 | Deleted: 0
      Duplicate Active Slugs:  0
      Non-numeric del_flag:    0
      Empty/Missing Active Slug: 0
  - ShopOrder:
      Total Orders:            0
      With Valid Key:          0
      Explicit null Keys:      0
      Missing Key Fields:      0
      Empty String Keys:       0
      Duplicate Key Groups:    0

[3] INDEX COMPATIBILITY & ACTIONS NEEDED:
  • [shop_products] REPLACE_INDEX on { sku: 1 } (sku_1 -> partialFilterExpression: { del_flag: 0 })
  • [shop_products] REPLACE_INDEX on { slug: 1 } (slug_1 -> partialFilterExpression: { del_flag: 0 })
  • [shop_categories] REPLACE_INDEX on { slug: 1 } (slug_1 -> partialFilterExpression: { del_flag: 0 })
  • [ShopOrder] REPLACE_INDEX on { idempotencyKey: 1 } (unique: false -> unique: true, sparse: true)

==================================================================
  PREFLIGHT VERDICT: READY FOR OWNER REVIEW (0 blockers, 0 warnings)
==================================================================
```

---

## 5. Step 4 — Migration Target Validation & Step-by-Step Failure-State Analysis

The migration script [`scripts/migrate_shop_indexes_v2.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrate_shop_indexes_v2.js) enforces strict safety controls:
1. Rejects execution unless `--database=test` is explicitly passed.
2. Asserts `connection.db.databaseName === "test"`.
3. Runs `analyzeShopIndexes(db)` and aborts if any blocker is detected.
4. Steps sequentially through each index with post-build verification.

### Step-by-Step Failure-State Matrix

| Replacement Target | Lifecycle State | Database State & Concurrency Invariant | Operator Recovery Procedure |
| :--- | :--- | :--- | :--- |
| **`shop_products.sku_1`** | **State 1:** Before dropping legacy index. | Legacy unconditional `sku_1` remains active. Zero impact. | Safe to abort. Re-run cleanly. |
| | **State 2:** After drop, before target creation. | Collection has **no index on SKU**. Queries perform collection scans. Duplicate SKUs prevented only by app validation. | Safe to re-run. Migration sees legacy missing and proceeds to create target index. |
| | **State 3:** After target creation, before verify. | Target partial unique index built in background. Uniqueness enforced. | Safe to re-run. Migration detects target index exists, skips drop, and verifies. |
| | **State 4:** Verification failure. | Target index exists but options mismatch. Script halts. | Operator inspects `db.shop_products.getIndexes()` and drops corrupted index manually. |
| | **State 5:** Retry after partial migration. | `sku_1` already matches target specification. | Script detects partial filter, logs `already matches`, skips drop, and moves to next index. |
| **`shop_products.slug_1`** | **States 1–5:** (Identical lifecycle to `sku_1`) | Unconditional slug uniqueness transitioned to partial unique filter (`del_flag: 0`). | Same recovery path as `sku_1`. |
| **`shop_categories.slug_1`** | **States 1–5:** (Identical lifecycle to `sku_1`) | Category slug uniqueness transitioned to partial unique filter (`del_flag: 0`). | Same recovery path as `sku_1`. |
| **`ShopOrder.idempotencyKey_1`** | **State 1:** Before drop. | Legacy non-unique sparse index active. Unique constraint enforced only by app `findOne`. | Safe to abort. |
| | **State 2:** After drop, before create. | No index on `idempotencyKey`. | Safe to re-run. Migration proceeds to create unique index. |
| | **State 3:** After create, before verify. | Sparse unique index active. Enforces database uniqueness. | Safe to re-run. Migration skips drop and verifies. |
| | **State 4:** Verification failure. | Index created without `unique: true`. | Script halts. Operator reviews error. |
| | **State 5:** Retry after partial migration. | Detects `unique: true` already present; skips drop. | Resumes cleanly. |

---

## 6. Step 5 — Final Functional Verification & Tests Executed

All verification tests were executed locally. Zero write operations were executed against MongoDB Atlas during this sprint.

| Test Category | Command / Scope | Tests | Result | Verification Objective |
| :--- | :--- | :---: | :---: | :--- |
| **Preflight Read-Only Safety** | `node tests/preflightShopIndexes.test.js` | 6 | **PASS (6/6)** | Proves preflight never invokes write methods, redacts URI credentials, and detects duplicate SKUs/slugs. |
| **Migration Hardening & Idempotency** | `node tests/migrationHardeningSafety.test.js` | 3 | **PASS (3/3)** | Proves safe drop handling, post-build index verification, and idempotency logic on partial/full states. |
| **Backend Shop Test Suite** | `npm run test:shop` (in `open-trash-tech-be`) | 62 | **PASS (62/62)** | Validates inquiry creation, idempotent retry, 409 conflict, order confirmation, inventory reservation/release, expiration worker, and ReDoS defense. |
| **Frontend Shop Test Suite** | `npm run test:shop` (in `open-trash-tech`) | 33 | **PASS (33/33)** | Validates storefront catalog SSR signature determinism, embed microtask batching, VND currency formatting, and state machine terminal locks. |
| **Frontend TypeScript Typecheck** | `npx tsc --noEmit` (in `open-trash-tech`) | 0 errors | **PASS** | Clean compilation with zero TypeScript errors. |
| **Backend Runtime Health Probe** | `curl http://localhost:5001/health` | HTTP 200 | **PASS** | Live process confirms `database.status: "Connected"`, `database.name: "test"`, `readyState: 1`, `pingMs: 50`. |

---

## 7. Step 6 — Final Operator Checklist for Execution

*(To be executed by the authorized operator during an approved maintenance window).*

```bash
# ─── 1. VERIFY ATLAS BACKUP ───────────────────────────────────────────────────
# Confirm an Atlas snapshot exists via the MongoDB Atlas Cloud console.

# ─── 2. RUN READ-ONLY PREFLIGHT ───────────────────────────────────────────────
cd open-trash-tech-be
node scripts/preflight_shop_indexes_readonly.js
# Verify: Script exits with code 0 (READY FOR OWNER REVIEW).

# ─── 3. EXECUTE MIGRATION ON CONFIRMED DATABASE 'test' ─────────────────────────
node scripts/migrate_shop_indexes_v2.js --database=test
# Verify: All 4 steps log "Legacy index dropped" and "Verified index in collection metadata".

# ─── 4. VERIFY POST-MIGRATION INDEX METADATA ──────────────────────────────────
node scripts/preflight_shop_indexes_readonly.js
# Verify: Script reports "All desired indexes already match target specifications" with 0 action items.

# ─── 5. EXECUTE REGRESSION SMOKE TEST ─────────────────────────────────────────
npm run test:shop
# Verify: 62/62 tests pass.
```

### Rollback Procedure (Emergency Only)
```javascript
// Run in mongosh connected to database test:
use test;
db.shop_products.dropIndex("sku_1");
db.shop_products.dropIndex("slug_1");
db.shop_categories.dropIndex("slug_1");
db.ShopOrder.dropIndex("idempotencyKey_1");

db.shop_products.createIndex({ sku: 1 }, { unique: true });
db.shop_products.createIndex({ slug: 1 }, { unique: true });
db.shop_categories.createIndex({ slug: 1 }, { unique: true });
db.ShopOrder.createIndex({ idempotencyKey: 1 }, { sparse: true });
```

---

## 8. Final Closure Verdict

### Verdict: **BLOCKED — OWNER ACTION REQUIRED**

### Exact Owner Actions Required to Complete Closure:
1. **Cloud Snapshot Verification:** The project owner or cloud administrator must verify in the MongoDB Atlas console that an automated snapshot backup for cluster `opentrashtech.ljo3k.mongodb.net` exists within the last 24 hours.
2. **Backend Deployment Confirmation:** The project owner must confirm whether the pilot backend is running on the local instance (`http://localhost:5001`), or provide the target URL/host for the remote production backend container.
3. **Migration Execution Authorization:** Once actions 1 and 2 are confirmed, execute:
   ```bash
   cd open-trash-tech-be
   node scripts/migrate_shop_indexes_v2.js --database=test
   ```
   Upon successful execution of that command, the database phase reaches **`SHOP DATABASE PHASE: COMPLETE`**.
