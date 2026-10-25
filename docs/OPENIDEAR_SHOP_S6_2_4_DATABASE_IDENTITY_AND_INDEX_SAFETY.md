# OpenIdear Shop S6.2.4 — Production Database Identity & Index Safety Gate

**Date:** October 25, 2026  
**Role:** Senior MongoDB Database Engineer & Production Reliability Engineer  
**Repositories:**
- Frontend: `open-trash-tech`
- Backend: `open-trash-tech-be`

**Sprint Gate:** S6.2.4 — Production Database Identity & Index Safety Gate  
**Final Verdict:** **BLOCKED — OWNER CONFIRMATION REQUIRED**  
*(Reason: The target production database identity cannot be proven from repository code and environment variables alone without owner input. Zero writes, index changes, or document mutations were executed).*

---

## 1. Executive Summary

This engineering evaluation resolves the remaining production database identity questions and validates the safety of the proposed MongoDB index migration for OpenIdear Shop.

Key findings:
1. **Target Database Identity:** The active MongoDB connection string (`MONGO_URL`) in `.env` connects to `opentrashtech.ljo3k.mongodb.net/` with no database path segment. MongoDB defaults to database **`"test"`**, which houses all 45 application collections. However, codebase documentation and health check code refer to **`"open-idear"`**. Because production hosting credentials (e.g., Vercel, Netlify, or cloud container environment variables) cannot be inspected from the local codebase, database identity is marked **PENDING OWNER CONFIRMATION**.
2. **Migration Script Hardening:** [`scripts/migrate_shop_indexes_v2.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrate_shop_indexes_v2.js) implements strict safety gates: mandatory `--database=<name>` CLI argument, pre-write database name matching, automated preflight gate, sequential index replacement, metadata verification, and guaranteed non-destructive execution.
3. **Mongoose `autoIndex: true` Harmony:** The backend boots with `autoIndex: true` in [`functions/appServer.js:L133`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/functions/appServer.js#L133). Target index definitions have been matched to Mongoose schema names (`"sku_1"`, `"slug_1"`, `"idempotencyKey_1"`) and options (`sparse: true` on `ShopOrder`), eliminating startup `IndexOptionsConflict` errors.
4. **Idempotency Semantics:** Evaluated `sparse: true` vs. `partialFilterExpression`. Confirmed that application write paths normalize missing/null keys to `undefined` (omitted from BSON), and preflight confirms 0 orders with literal `null`. A sparse unique index (`{ unique: true, sparse: true }`) is recommended.

---

## 2. Task 1 — Production Database Identity Matrix

We inspected backend environment resolution, URI parsing, Mongoose connection logic, health checks, documentation, and live cluster metadata.

### 2.1 Environment Identity Matrix

| Environment | Intended Database | Effective Database | Supporting Evidence | Confidence Level |
| :--- | :--- | :--- | :--- | :---: |
| **Local Development** | `"open-idear"` (legacy) or `"test"` | **`"test"`** | Local `.env` contains `MONGO_URL=mongodb+srv://...@opentrashtech.ljo3k.mongodb.net/` with no path segment. Driver defaults to `"test"`. Legacy script [`migrateHtmlToBlocks.js:L26`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrateHtmlToBlocks.js#L26) shows localhost fallback `"mongodb://localhost:27017/open-idear"`. | **HIGH** (Local effective DB is `"test"`) |
| **Staging** | *Not configured* | *None* | No separate staging environment file, staging branch config, or dedicated staging cluster was found in either repository. | **N/A** (No staging environment) |
| **Production / Pilot** | **Pending Owner Confirmation** (`"test"` vs `"open-idear"`) | **`"test"`** (on active Atlas cluster) | On Atlas cluster `opentrashtech.ljo3k.mongodb.net`, database `"test"` holds all 45 collections (8.65 MB). [`README.md:L40`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/README.md#L40) and [`controllers/health.controller.js:L78`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/health.controller.js#L78) indicate `"open-idear"` was envisioned as the production name. Production cloud secrets (e.g. Vercel dashboard) cannot be inspected from code. | **PENDING OWNER CONFIRMATION** |

### 2.2 Distinction of Database Concepts
- **Database selected by the URI:** `"test"` (because `MONGO_URL` omits the path segment `/databaseName`).
- **Database used by currently running backend:** `"test"` (verified via `mongoose.connection.name` on the running process).
- **Database the project owner intends to designate as production:** **Unconfirmed**. Operating on `"test"` under the assumption that it is production risks migrating a sandbox/dev database if the owner intended production to use an explicit database name or separate cluster.

---

## 3. Task 2 — Migration Target Validation & Failure-State Analysis

### 3.1 Verification of Safety Gates in `migrate_shop_indexes_v2.js`
- **Mandatory Target Specification:** Requires `--database=<expected_db_name>`. Running without this parameter throws an immediate error and exits before connecting.
- **Pre-Write Identity Match:** Compares `connection.db.databaseName` with `--database`. If they differ, aborts with `Safety Gate Failed`.
- **Preflight Blocker Gate:** Invokes `analyzeShopIndexes(db)`. If any active duplicate SKUs, duplicate slugs, or non-numeric `del_flag` values exist, aborts before dropping any index.
- **Strictly Non-Destructive:** Does not contain any `delete`, `update`, or `$unset` database operations.

### 3.2 Step-by-Step Failure-State Matrix
The table below details the exact database state and recovery procedure for each possible failure point during index replacement:

| Replacement Target | Failure State | Database Impact & Concurrency Invariant | Operator Recovery Procedure |
| :--- | :--- | :--- | :--- |
| **`shop_products.sku_1`** | **State 1:** Before dropping legacy index. | Legacy unconditional `sku_1` remains active. Zero impact. | Safe to abort or re-run. No action needed. |
| | **State 2:** After drop, but before target creation. | Collection has **no index on SKU**. Queries on SKU perform collection scans. Duplicate SKUs are prevented only by application validation. | Safe to re-run. Migration will see legacy index missing and proceed to create target index. |
| | **State 3:** After target creation, before verification. | Target partial unique index is built in background. Uniqueness is enforced. | Safe to re-run. Migration detects target index exists, skips drop, and verifies. |
| | **State 4:** Verification failure. | Target index exists but options mismatch (e.g. partial filter missing). | Script halts. Operator inspects `db.shop_products.getIndexes()` and drops corrupted index manually. |
| | **State 5:** Retry after partial migration. | `sku_1` already matches target specification. | Script detects partial filter, logs `already matches`, skips drop, and moves to next index. |
| **`shop_products.slug_1`** | **States 1–5:** (Identical lifecycle to `sku_1`) | Unconditional slug uniqueness transitioned to partial unique filter (`del_flag: 0`). | Same recovery path as `sku_1`. |
| **`shop_categories.slug_1`** | **States 1–5:** (Identical lifecycle to `sku_1`) | Category slug uniqueness transitioned to partial unique filter (`del_flag: 0`). | Same recovery path as `sku_1`. |
| **`ShopOrder.idempotencyKey_1`** | **State 1:** Before drop. | Legacy non-unique sparse index active. Unique constraint enforced only by application `findOne`. | Safe to abort. |
| | **State 2:** After drop, before create. | No index on `idempotencyKey`. | Safe to re-run. Migration proceeds to create unique index. |
| | **State 3:** After create, before verify. | Sparse unique index active. Enforces database uniqueness. | Safe to re-run. Migration skips drop and verifies. |
| | **State 4:** Verification failure. | Index created without `unique: true`. | Script halts. Operator reviews error. |
| | **State 5:** Retry after partial migration. | Detects `unique: true` already present; skips drop. | Resumes cleanly. |

---

## 4. Task 3 — Mongoose Index Synchronization & Production Best Practices

### 4.1 Coexistence Analysis: Schema vs. Database Indexes
In [`functions/appServer.js:L133`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/functions/appServer.js#L133), `autoIndex: true` is enabled. On application boot, Mongoose iterates all registered models and calls `createIndex()` in MongoDB for every index declared in schemas.

| Target Index in DB | Schema Declaration | Mongoose Startup Behavior (`autoIndex: true`) | Coexistence Verdict |
| :--- | :--- | :--- | :---: |
| `shop_products.sku_1` (`unique: true, partial: {del_flag: 0}`) | [`shopProduct.schema.js:L240`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L240): `{ sku: 1 }, { unique: true, partialFilterExpression: { del_flag: 0 } }` | Mongoose generates index call for name `"sku_1"` with matching options. MongoDB treats as no-op. | **COMPATIBLE** |
| `shop_products.slug_1` (`unique: true, partial: {del_flag: 0}`) | [`shopProduct.schema.js:L244`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L244): `{ slug: 1 }, { unique: true, partialFilterExpression: { del_flag: 0 } }` | Mongoose generates index call for name `"slug_1"` with matching options. MongoDB treats as no-op. | **COMPATIBLE** |
| `shop_categories.slug_1` (`unique: true, partial: {del_flag: 0}`) | [`shopCategory.schema.js:L75`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopCategory.schema.js#L75): `{ slug: 1 }, { unique: true, partialFilterExpression: { del_flag: 0 } }` | Mongoose generates index call for name `"slug_1"` with matching options. MongoDB treats as no-op. | **COMPATIBLE** |
| `ShopOrder.idempotencyKey_1` (`unique: true, sparse: true`) | [`shopOrder.schema.js:L180-L186`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopOrder.schema.js#L180-L186): `sparse: true, unique: true, index: true` | Mongoose generates index call for name `"idempotencyKey_1"` with matching options. MongoDB treats as no-op. | **COMPATIBLE** |

> [!WARNING]
> If custom index names (e.g., `sku_1_partial_active` or `idempotencyKey_1_partial_unique`) were used, Mongoose's startup routine would attempt to recreate `sku_1` and `idempotencyKey_1`, throwing `IndexOptionsConflict` errors on server boot. **`migrate_shop_indexes_v2.js` uses exact standard names (`sku_1`, `slug_1`, `idempotencyKey_1`) to preserve 100% startup compatibility.**

### 4.2 Recommendation on `autoIndex` for Production
- **Evaluation:** In MongoDB and Mongoose production best practices, enabling `autoIndex: true` in production environments introduces performance risks (unintended index builds on container startup, deployment latency, cluster round-trips).
- **Recommended Change Plan (For Future Sprint):**
  Update [`functions/appServer.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/functions/appServer.js) to conditionally disable `autoIndex` in production:
  ```javascript
  const isDev = process.env.NODE_ENV !== "production";
  mongoose.connect(mongoUrl, {
    autoCreate: isDev,
    autoIndex: isDev,
    ...
  });
  ```
  All production index changes should be managed exclusively through reviewed migration scripts. *(Per constraints, this setting was not modified during this sprint).*

---

## 5. Task 4 — Idempotency Index Semantics

### 5.1 API Input Validation & Key Handling
In [`services/shopOrder.services.js:L106-L121`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L106-L121):
- **Missing (`undefined`):** Skips idempotency check.
- **Explicit `null`:** Skips idempotency check.
- **Empty string (`""`) or whitespace-only:** Throws `BadRequestException` (HTTP 400).
- **Malformed types (number, boolean, object):** Throws `BadRequestException` (HTTP 400).
- **Overly long strings (>128 chars):** Throws `BadRequestException` (HTTP 400).
- **Valid string:** Normalized via `.trim()`, and canonical payload hash is computed via SHA-256.

### 5.2 Document Persistence & BSON Storage
In [`services/shopOrder.services.js:L254-L255`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L254-L255):
```javascript
idempotencyKey: normalizedIdempotencyKey || undefined,
idempotencyPayloadHash: payloadHash || undefined,
```
- In BSON serialization, properties with value `undefined` are **completely omitted** from the stored document.
- Documents submitted without an idempotency key do **not** store `{ idempotencyKey: null }`. They omit the field entirely.

### 5.3 Sparse Unique Index vs. Partial Unique Index
| Option | Definition | Behavior on Missing Field | Behavior on Literal `null` | Coexistence with Schema |
| :--- | :--- | :--- | :--- | :--- |
| **Option A (Sparse Unique - Recommended)** | `{ idempotencyKey: 1 }, { unique: true, sparse: true }` | **Ignored** (not indexed) | **Indexed** as literal `null`. (Multiple `null` records would collide). | **100% matches** `shopOrder.schema.js` (`sparse: true, unique: true`). Zero `autoIndex` conflict. |
| **Option B (Partial Unique)** | `{ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }` | **Ignored** | **Ignored** (only strings are indexed). | **Conflicts** with `shopOrder.schema.js`. Mongoose `autoIndex: true` will trigger `IndexOptionsConflict` on boot. |

### 5.4 Recommendation & Justification
- **Recommended Definition:** **Option A: `{ name: "idempotencyKey_1", unique: true, sparse: true }`**.
- **Justification:**
  1. The preflight query confirms there are currently **0 orders with literal `null`** in the database.
  2. The service write path guarantees that literal `null` is never written (`normalizedIdempotencyKey || undefined`).
  3. It matches the existing Mongoose schema definition, preventing startup index conflict errors with `autoIndex: true`.

---

## 6. Task 5 — Safe Verification & Test Results

Verification methodology is strictly segregated into three distinct categories:

### 6.1 Category A: Unit Tests with Mocks
Executed in local isolated Node.js test environment:
- [`tests/preflightShopIndexes.test.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/tests/preflightShopIndexes.test.js): **6/6 PASSED**. Proves preflight never invokes write methods, redacts URI credentials, and detects duplicate SKUs/slugs.
- [`tests/migrationHardeningSafety.test.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/tests/migrationHardeningSafety.test.js): **3/3 PASSED**. Proves safe drop handling, post-build index verification, and idempotency logic across initial, partial, and fully migrated states.
- Backend Shop Test Suite (`npm run test:shop`): **62/62 PASSED**.
- Frontend Shop Test Suite (`npm run test:shop`): **33/33 PASSED**.
- Frontend Static Typecheck (`npx tsc --noEmit`): **0 ERRORS**.

### 6.2 Category B: Read-Only Live Metadata Queries
Executed against active MongoDB Atlas cluster (`opentrashtech.ljo3k.mongodb.net`):
- `db.admin().listDatabases()`: Discovered `sample_mflix` (136 MB), `test` (8.65 MB, 45 collections), `admin`, `local`.
- `db.collection("shop_products").indexes()`: Verified existing `sku_1` and `slug_1` are unconditional.
- `db.collection("ShopOrder").indexes()`: Verified existing `idempotencyKey_1` is non-unique.
- Data counts: 0 active duplicate SKUs, 0 active duplicate slugs, 0 non-numeric `del_flag` records.

### 6.3 Category C: Concurrency Tests Disclaimer
- Simulated concurrency tests in `tests/shopS61ProductionVerification.test.js` use `Promise.all` against in-memory mock repositories.
- **Explicit Statement:** While these tests verify the application's CAS state machine logic and error handling branches, **they do not represent true multi-connection wire-protocol MongoDB concurrency tests**. True distributed concurrency guarantees depend on MongoDB replica set transactions and write locks at runtime.

---

## 7. Operational Rollout Checklist

*(For execution during an authorized maintenance window once database identity is unblocked).*

1. **Owner Confirmation:** Obtain owner sign-off specifying the exact production database name (`test` or `open-idear`).
2. **Cluster Snapshot:** Verify an Atlas cluster snapshot backup was created within the last 1 hour.
3. **Preflight Run:**
   ```bash
   cd open-trash-tech-be
   node scripts/preflight_shop_indexes_readonly.js
   ```
   *Verify exit code 0 (`0 blockers, 0 warnings`).*
4. **Restricted Storefront Traffic:** Announce maintenance window (5–10 minutes).
5. **Execute Hardened Migration:**
   ```bash
   node scripts/migrate_shop_indexes_v2.js --database=<CONFIRMED_DB_NAME>
   ```
6. **Post-Migration Verification:**
   Re-run preflight:
   ```bash
   node scripts/preflight_shop_indexes_readonly.js
   ```
   *Verify: `✓ All desired indexes already match target specifications`.*
7. **Smoke Testing:**
   ```bash
   npm run test:shop
   ```
   *Verify all 62 backend and 33 frontend tests pass.*
8. **Rollback Command (If Emergency Reversion Required):**
   ```javascript
   const db = db.getSiblingDB("<CONFIRMED_DB_NAME>");
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

## 8. Remaining Risks

1. **Database Identity Uncertainty:** The owner must clarify whether `"test"` on `opentrashtech.ljo3k.mongodb.net` is the designated production database.
2. **Reverse Proxy Client IP:** Ensure Express `trust proxy` is configured in production so `express-rate-limit` tracks real client IPs.
3. **External Cron Secret:** Ensure `SHOP_CRON_SECRET` is set in the production container environment.

---

## 9. Final Verdict

### Verdict: **BLOCKED — OWNER CONFIRMATION REQUIRED**

**Action Required from Project Owner:**
Please review Section 2 of this report and confirm:
1. Is database **`"test"`** on `opentrashtech.ljo3k.mongodb.net` the authorized production database for this pilot?
   - *If YES:* Authorize: `node scripts/migrate_shop_indexes_v2.js --database=test`
   - *If NO:* Provide the production URI (e.g., pointing to `open-idear`), and authorize: `node scripts/migrate_shop_indexes_v2.js --database=open-idear`

Upon receipt of owner confirmation, this gate immediately converts to **READY FOR OWNER AUTHORIZATION**.
