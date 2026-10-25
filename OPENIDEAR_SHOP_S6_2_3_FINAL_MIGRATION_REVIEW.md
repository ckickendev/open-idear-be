# OpenIdear Shop S6.2.3 — Final Migration Approval Review

**Date:** October 25, 2026  
**Auditor / Database Engineer:** Senior MongoDB Database Engineer  
**Repositories:**
- Frontend: `open-trash-tech`
- Backend: `open-trash-tech-be`

**Sprint Gate:** S6.2.3 — Pre-Execution Approval Review  
**Final Verdict:** **BLOCKED**  
*(Reason: The target production database identity cannot be independently confirmed from environment configuration and codebase evidence alone. Zero production writes, index modifications, or data changes were executed).*

---

## 1. Executive Summary

This final pre-execution review investigates the proposed MongoDB index migration for OpenIdear Shop before owner authorization. 

The review evaluated:
1. Target database resolution and cluster database topology.
2. The hardened migration script ([`scripts/migrate_shop_indexes_v2.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrate_shop_indexes_v2.js)).
3. Index naming and option harmony with Mongoose schema declarations and `autoIndex: true`.
4. Partial-failure recovery, rerun safety, and operational rollout checklists.

### Key Finding: Target Database Identity Ambiguity
- The active MongoDB connection string (`MONGO_URL`) in `.env` points to `opentrashtech.ljo3k.mongodb.net/` with **no database path segment**.
- Under standard Node.js MongoDB driver behavior, omitting the database path defaults to the database named **`"test"`**.
- Live cluster inspection confirms that all 45 OpenIdear collections currently reside in database **`"test"`**.
- However, codebase documentation ([`README.md:L40`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/README.md#L40)), health check logic ([`health.controller.js:L78`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/health.controller.js#L78)), and legacy scripts ([`migrateHtmlToBlocks.js:L26`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrateHtmlToBlocks.js#L26)) reference **`"open-idear"`** as the intended service database name.
- Operating on a database named `"test"` under the assumption that it is production—without explicit owner confirmation—violates database engineering safety protocols. If production is intended to reside in an explicitly named database or separate cluster, executing an index migration on `"test"` would operate on the wrong environment.
- Therefore, pursuant to Task 1, **the migration is marked BLOCKED** until the project owner explicitly confirms whether `"test"` is the intended production database for this pilot or provides the production database name.

---

## 2. Task 1 — Production Database Identity Verification

### 2.1 Why the Previous Preflight Displayed `(default) [test]`
The preflight script [`scripts/preflight_shop_indexes_readonly.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/preflight_shop_indexes_readonly.js) parsed `process.env.MONGO_URL` using `new URL(rawUri)`.
1. In `rawUri`, the connection string was formatted as:  
   `mongodb+srv://<username>:<password>@opentrashtech.ljo3k.mongodb.net/?retryWrites=true&w=majority` (or with trailing slash `/`).
2. The URL parser resolved `parsed.pathname` to `"/"`.
3. In `sanitizeConnectionTarget`:
   ```javascript
   database: (parsed.pathname || "/").replace(/^\//, "") || "(default)"
   ```
   Evaluating `replace(/^\//, "")` on `"/"` produced `""` (empty string), causing the expression to display `"(default)"`.
4. When Mongoose / MongoDB driver opens a connection to a URI without a path segment, the driver specification automatically assigns `connection.name = "test"`.

### 2.2 Live Cluster Database Inspection
We executed a read-only cluster inspection using `db.admin().listDatabases()` against `opentrashtech.ljo3k.mongodb.net`. The cluster contains four databases:

| Database Name | Size on Disk | Collections Present | Nature of Data |
| :--- | :---: | :---: | :--- |
| `sample_mflix` | ~136 MB | `movies`, `comments`, `users` | Standard MongoDB Atlas sample tutorial dataset. |
| **`test`** | **~8.65 MB** | **45 collections** (`users`, `posts`, `chapters`, `shop_products`, `shop_categories`, `ShopOrder`, `ShopAnalyticsEvent`, `categories`, `courses`, etc.) | **Current active application data.** All OpenIdear models are instantiated here. |
| `admin` | < 1 MB | Internal | System authentication and routing metadata. |
| `local` | < 1 MB | Internal | Replica set oplog (`oplog.rs`). |

**Crucial Finding:** There is **no database named `open-idear`** on this Atlas cluster.

### 2.3 Evidence Comparison: Intended vs. Actual
| Source | Evidence for Intended Database Name | Evidence for Actual Database Name |
| :--- | :--- | :--- |
| [`.env`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/.env) | `MONGO_URL` has no database path segment. | Defaults to `"test"`. |
| [`appServer.js:L130`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/functions/appServer.js#L130) | Passes `process.env.MONGO_URL` directly to `mongoose.connect()`. | Connected database name is `"test"`. |
| [`health.controller.js:L78`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/health.controller.js#L78) | Fallback says `mongoose.connection.name \|\| "open-idear"`. | Evaluates to `"test"`. |
| [`README.md:L40`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/README.md#L40) | Documentation example says `mongodb.net/<database>`. | Suggests a named database was intended. |
| [`scripts/migrateHtmlToBlocks.js:L26`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrateHtmlToBlocks.js#L26) | Localhost fallback says `mongodb://localhost:27017/open-idear`. | Indicates project naming convention was `open-idear`. |

### 2.4 Task 1 Conclusion & Blocker
- **Actual Database:** `"test"` on `opentrashtech.ljo3k.mongodb.net`.
- **Intended Database:** Ambiguous. It is unknown whether the project owner intended to deploy the production pilot inside `"test"` or intended to specify `open-idear` in `MONGO_URL`.
- **Safety Protocol Rule:** *"If the actual production database name cannot be verified, mark the migration BLOCKED. Do not assume `test` is correct or incorrect without evidence."*
- **Verdict:** **BLOCKED**. The owner must confirm whether `"test"` is the authorized database for this pilot or provide the intended production URI before migration execution.

---

## 3. Task 2 — Migration Script Review (`migrate_shop_indexes_v2.js`)

We inspected and hardened [`scripts/migrate_shop_indexes_v2.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/scripts/migrate_shop_indexes_v2.js) to address all weaknesses identified in previous reviews.

### 3.1 Verification of Safety Gates & Error Paths

| Safety Requirement | Implementation in `migrate_shop_indexes_v2.js` | Status |
| :--- | :--- | :---: |
| **Explicit Target Validation** | Checks CLI argument `--database=<expected_db_name>`. If omitted, halts immediately before touching the database. | **VERIFIED** |
| **Refusal on Unexpected Database** | Compares `connection.db.databaseName` with `--database`. If they do not match, aborts with `Safety Gate Failed`. | **VERIFIED** |
| **Preflight Gate Check** | Automatically runs `analyzeShopIndexes(db)`. If any blocker exists (e.g. duplicate active SKUs/slugs), aborts immediately. | **VERIFIED** |
| **Controlled Replacement** | Steps through each index individually: verifies necessity, drops legacy index, creates target index, and calls `verifyIndexExists`. | **VERIFIED** |
| **Fail-Stop on Error** | Any index build or verification error throws and exits with code `1`, halting downstream operations. | **VERIFIED** |
| **Non-Destructive Guarantee** | Contains zero `deleteMany`, `deleteOne`, `updateMany`, `updateOne`, or `$unset` operations. | **VERIFIED** |

### 3.2 Idempotency Analysis Across Database States

The script was evaluated across three distinct database states:

```
                  ┌──────────────────────────────────────────────┐
                  │ 1. INITIAL STATE                             │
                  │ - sku_1 (unconditional)                      │
                  │ - slug_1 (unconditional)                     │
                  │ - idempotencyKey_1 (unique: false)           │
                  └──────────────────────┬───────────────────────┘
                                         │ Drops legacy & builds target
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 2. PARTIALLY MIGRATED (e.g. Products done)   │
                  │ - sku_1 (partialFilterExpression: {del_flag})│
                  │ - slug_1 (partialFilterExpression: {del_flag})│
                  │ - idempotencyKey_1 (unique: false)           │
                  └──────────────────────┬───────────────────────┘
                                         │ Detects existing partial filter;
                                         │ skips drop & no-ops build
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │ 3. FULLY MIGRATED                            │
                  │ - All indexes match target specifications    │
                  │ - Re-running script performs 0 drops         │
                  └──────────────────────────────────────────────┘
```

- **Initial State:** Detects legacy unconditional indexes, drops them cleanly, builds target partial indexes with `background: true`, and verifies metadata.
- **Partially Migrated State:** If the process was interrupted after migrating products, re-running detects that `sku_1` and `slug_1` already have `partialFilterExpression: { del_flag: 0 }`. It logs `already matches target specification`, skips dropping, and resumes with categories and orders.
- **Fully Migrated State:** Detects that all indexes match target options. Performs 0 drops, 0 creates, and exits cleanly with code `0`.
- **Verdict on Idempotency:** **Verified safe and idempotent.**

---

## 4. Task 3 — Validation of Target Index Definitions

### 4.1 Critical Discovery: Index Naming Harmony with Mongoose `autoIndex`
In [`functions/appServer.js:L133`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/functions/appServer.js#L133), the backend enables Mongoose index synchronization:
```javascript
mongoose.connect(mongoUrl, {
  autoCreate: true,
  autoIndex: true, // <--- Automatic index creation enabled on boot!
  ...
});
```

When Mongoose boots with `autoIndex: true`:
1. It reads schema definitions from `models/*.schema.js`.
2. For any schema index, if no `name` option is declared, Mongoose generates the standard name (e.g. `"sku_1"`, `"slug_1"`, `"idempotencyKey_1"`).
3. If the migration script had named the indexes with custom suffixes (e.g. `"sku_1_partial_active"` or `"idempotencyKey_1_partial_unique"`), Mongoose's startup routine would inspect the collection, fail to find `"sku_1"`, and issue a `createIndex` call for `"sku_1"`.
4. In MongoDB, creating `"sku_1"` while `"sku_1_partial_active"` exists on key `{ sku: 1 }` fails with `IndexOptionsConflict` or `IndexKeySpecsConflict`!
5. **Resolution in `migrate_shop_indexes_v2.js`:** The migration script explicitly names the indexes **`"sku_1"`**, **`"slug_1"`**, and **`"idempotencyKey_1"`**. When named identically to Mongoose's defaults, Mongoose's `autoIndex` detects that the index already exists with the exact matching options and takes no action, ensuring 100% startup harmony.

### 4.2 Exact Recommended Index Definitions

#### 1. Collection `shop_products`
```javascript
// A. SKU Index
db.collection("shop_products").createIndex(
  { sku: 1 },
  {
    name: "sku_1",
    unique: true,
    partialFilterExpression: { del_flag: 0 },
    background: true,
  }
);

// B. Slug Index
db.collection("shop_products").createIndex(
  { slug: 1 },
  {
    name: "slug_1",
    unique: true,
    partialFilterExpression: { del_flag: 0 },
    background: true,
  }
);
```
- **Fidelity with Schema:** Exactly matches [`models/shopProduct.schema.js:L239-L246`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L239-L246).
- **Semantics:** Active products (`del_flag: 0`) must have unique SKUs and slugs. Soft-deleted products (`del_flag: 1`) are excluded from the index, permitting SKU and slug re-use.

#### 2. Collection `shop_categories`
```javascript
db.collection("shop_categories").createIndex(
  { slug: 1 },
  {
    name: "slug_1",
    unique: true,
    partialFilterExpression: { del_flag: 0 },
    background: true,
  }
);
```
- **Fidelity with Schema:** Exactly matches [`models/shopCategory.schema.js:L75-L78`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopCategory.schema.js#L75-L78).

#### 3. Collection `ShopOrder`
```javascript
db.collection("ShopOrder").createIndex(
  { idempotencyKey: 1 },
  {
    name: "idempotencyKey_1",
    unique: true,
    sparse: true,
    background: true,
  }
);
```
- **Fidelity with Schema:** Exactly matches [`models/shopOrder.schema.js:L180-L186`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopOrder.schema.js#L180-L186):
  ```javascript
  idempotencyKey: {
    type: String,
    trim: true,
    sparse: true,
    unique: true,
    index: true,
  }
  ```
- **Why Sparse Unique Matches Codebase Reality:**
  - While a partial index with `{ idempotencyKey: { $type: "string" } }` was discussed, Mongoose's schema declares `sparse: true, unique: true`. Using a partial filter in MongoDB while Mongoose's schema declares `sparse: true` would cause Mongoose's `autoIndex: true` to trigger an `IndexOptionsConflict` on every application boot.
  - In [`shopOrder.services.js:L254`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L254), the code sets `idempotencyKey: normalizedIdempotencyKey || undefined`. Literal `null` is never written.
  - In preflight inspection, exactly 0 orders in the database contain literal `null`.
  - Therefore, `{ name: "idempotencyKey_1", unique: true, sparse: true }` is the exact, harmonious specification.

---

## 5. Task 4 — Operational Rollout Checklist

*(For execution during a separately authorized maintenance window after database identity confirmation).*

### Pre-Maintenance Window Checklist
- [ ] **Step 1: Confirm Production Database Identity.**  
  Project owner explicitly confirms target database name (e.g. `test` or `open-idear`).
- [ ] **Step 2: Confirm Backup Readiness.**  
  Verify that MongoDB Atlas snapshot backup completed successfully within the last 1 hour.
- [ ] **Step 3: Run Verified Read-Only Preflight.**  
  ```bash
  cd open-trash-tech-be
  node scripts/preflight_shop_indexes_readonly.js
  ```
- [ ] **Step 4: Review Preflight Verdict.**  
  Verify script exits with code `0` (`0 blockers, 0 warnings`). If blockers appear, stop immediately.

### Execution Window Checklist
- [ ] **Step 5: Restrict Storefront Writes (Optional/Recommended).**  
  Announce brief maintenance or temporarily set storefront inquiry submission to maintenance mode.
- [ ] **Step 6: Execute Hardened Migration.**  
  Execute the migration specifying the confirmed database:
  ```bash
  node scripts/migrate_shop_indexes_v2.js --database=<CONFIRMED_DB_NAME>
  ```
- [ ] **Step 7: Verify Execution Logging.**  
  Verify that all 4 steps log `✓ Legacy index dropped` and `✓ Verified index in collection metadata`.
- [ ] **Step 8: Post-Migration Metadata Verification.**  
  Run read-only preflight a second time:
  ```bash
  node scripts/preflight_shop_indexes_readonly.js
  ```
  *Expected Output:* Preflight logs `✓ All desired indexes already match target specifications` with 0 action items.
- [ ] **Step 9: Run Smoke Test.**  
  Run backend integration tests:
  ```bash
  npm run test:shop
  ```
  Verify all 62 backend and 33 frontend tests pass.

### Rollback Strategy & Clarification
> [!IMPORTANT]
> **Index Rollback vs. Data Restoration:**  
> Dropping or recreating an index does **not** alter collection documents. If the migration fails, reverting to legacy indexes restores previous querying behavior. However, if data had been corrupted or deleted by external operations, rolling back indexes would **not** restore data. The migration script performs zero data mutations.

If index rollback is required:
```javascript
// Run via mongo shell or emergency script:
const db = db.getSiblingDB("<CONFIRMED_DB_NAME>");
db.shop_products.dropIndex("sku_1");
db.shop_products.dropIndex("slug_1");
db.shop_categories.dropIndex("slug_1");
db.ShopOrder.dropIndex("idempotencyKey_1");

// Restore legacy baseline indexes:
db.shop_products.createIndex({ sku: 1 }, { unique: true });
db.shop_products.createIndex({ slug: 1 }, { unique: true });
db.shop_categories.createIndex({ slug: 1 }, { unique: true });
db.ShopOrder.createIndex({ idempotencyKey: 1 }, { sparse: true });
```

---

## 6. Task 5 — Verification & Test Results

All verification tests were executed locally. Zero write operations were executed against MongoDB Atlas.

| Test Suite | Command | Result | Verification Scope |
| :--- | :--- | :---: | :--- |
| **Preflight Read-Only Safety** | `node tests/preflightShopIndexes.test.js` | **6/6 PASSED** | Proves preflight never invokes write methods, redacts URI credentials, and detects duplicate SKUs/slugs. |
| **Migration Script Hardening** | `node tests/migrationHardeningSafety.test.js` | **3/3 PASSED** | Proves safe drop handling, post-build index verification, and idempotency logic on partial/full states. |
| **Full Backend Shop Suite** | `npm run test:shop` (in `open-trash-tech-be`) | **62/62 PASSED** | All 8 backend suites pass cleanly. |
| **Full Frontend Shop Suite** | `npm run test:shop` (in `open-trash-tech`) | **33/33 PASSED** | All 7 frontend suites pass cleanly. |
| **Frontend TypeScript Typecheck** | `npx tsc --noEmit` (in `open-trash-tech`) | **0 ERRORS** | Zero type diagnostics. |

---

## 7. Remaining Unknowns and Risks

1. **Database Identity Confirmation:** The owner must verify whether the pilot database is `"test"` or whether `MONGO_URL` in production should be updated to point to an explicit database (e.g. `open-idear`).
2. **Reverse Proxy Client IP Header:** Ensure production reverse proxies pass `x-forwarded-for` properly so that IP-based rate limiters on purchase inquiries function per client rather than per proxy.
3. **External Cron Provisioning:** Ensure `SHOP_CRON_SECRET` is configured in production environment variables before scheduling `POST /shop/orders/admin/release-expired`.

---

## 8. Final Verdict

### Verdict: **BLOCKED**

**Resolution Criteria to Unblock:**
1. The project owner reviews Section 2 of this report and confirms the authorized database name:
   - If the database is `"test"`, the owner approves running:
     `node scripts/migrate_shop_indexes_v2.js --database=test`
   - If the database is intended to be `"open-idear"`, the owner provisions `MONGO_URL` with `/open-idear` and approves:
     `node scripts/migrate_shop_indexes_v2.js --database=open-idear`
2. Once the target database identity is explicitly confirmed, the status immediately converts to **READY FOR OWNER AUTHORIZATION**.
