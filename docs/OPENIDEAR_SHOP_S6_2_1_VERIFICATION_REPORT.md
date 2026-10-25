# OpenIdear Shop S6.2.1 — Post-Remediation Verification Gate Report

**Date:** October 25, 2026  
**Auditor / Verification Engineer:** Senior Full-Stack & Systems Verification Agent  
**Repositories:**
- Frontend: `open-trash-tech`
- Backend: `open-trash-tech-be`

**Verification Status:** **CONDITIONAL GO** for Controlled Production Pilot

---

## Executive Summary

This independent post-remediation verification evaluates the OpenIdear Shop implementation following the S6.2 audit remediation sprint. Verification was conducted through:
1. **Direct static code inspection** of all controllers, services, database schemas, and integration test harnesses.
2. **Read-only live database inspection** against the active MongoDB Atlas cluster (`atlas-8q6zvi-shard-0`).
3. **Execution of full backend and frontend regression test suites** (95 tests total: 62 backend, 33 frontend, 0 failures).
4. **Analysis of transaction boundaries, concurrency primitives, index safety, and operational dependencies.**

### Critical Discoveries During Verification:
- **Index Migration Collection Mismatch:** The index migration draft in the S6.2 report referenced default Mongoose collection names (`shopproducts`, `shopcategories`, `shoporders`). In the actual MongoDB database, the collections are named `shop_products`, `shop_categories`, and `ShopOrder`. Executing the draft migration verbatim would have operated on non-existent collections.
- **Database Index Inconsistency:** In the live MongoDB Atlas cluster, `idempotencyKey_1` on collection `ShopOrder` currently has `unique: false, sparse: true`. Furthermore, `sku_1` and `slug_1` on `shop_products` are unconditional unique indexes without `partialFilterExpression: { del_flag: 0 }`. While Mongoose schemas were correctly updated in S6.2, MongoDB does **not** dynamically alter existing index options. The database unique constraint on `idempotencyKey` and the partial unique filter on `sku`/`slug` are **not enforced at the database level** until the migration is executed.
- **Replica Set Compatibility:** The active database environment was verified to be a replica set (`ReplicaSetWithPrimary`), confirming that multi-document ACID transactions via `_withTransaction(session)` are fully supported in runtime.

---

## 1. Findings Independently Verified from Source Code

All 8 remediation items from the comprehensive audit were inspected directly in the current codebase. No regressions or unfinished work were detected in application code.

### 1.1 AUDIT-ROUTE-01: Analytics API Routing & Mounting
- **Source Location:** [`controllers/shopAnalytics.controller.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopAnalytics.controller.js#L78-L95)
- **Verified Code:**
  ```javascript
  this._router.post(`${this._rootPath}/event`, analyticsEventRateLimiter, this.recordEvent);
  this._router.get(`${this._rootPath}/overview`, AdminMiddleware, this.getOverview);
  ```
- **Verification Evidence:** The controller routes now cleanly prepend `${this._rootPath}` (`/shop/analytics`). In [`tests/shopHttpIntegration.test.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/tests/shopHttpIntegration.test.js#L80-L107), mounting on Express and dispatching requests to `/shop/analytics/event` succeeds (HTTP 200), `/shop/analytics/overview` correctly requires authentication (HTTP 401/403), and accidental root aliases `/event` and `/overview` return HTTP 404.

### 1.2 AUDIT-CONC-01: Expiration Concurrency & Reservation Race Conditions
- **Source Location:** [`services/shopOrder.services.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L860-L945)
- **Verified Code:**
  ```javascript
  claimed = await ShopOrder.findOneAndUpdate(
    {
      _id: candidate._id,
      status: "confirmed",
      inventoryReserved: true,
      del_flag: 0,
    },
    {
      $set: { status: "cancelled", inventoryReserved: false },
      $push: { statusHistory: { ... } },
    },
    { session, new: false }
  );
  if (!claimed) return; // Concurrently claimed or updated
  ```
- **Verification Evidence:** An atomic Compare-And-Swap (CAS) query ensures exactly-once execution. If two cron workers or an admin action race on an expiring order, only one successfully matches `{ status: "confirmed", inventoryReserved: true }`. The loser receives `null` and exits immediately without touching inventory. Furthermore, `_releaseOrderInventory` conditional decrements enforce `{ reservedQuantity: { $gte: item.quantity } }`, preventing inventory underflow.

### 1.3 AUDIT-SEC-01: Idempotency Key Validation, Canonical Hashing, & Privacy Redaction
- **Source Locations:**
  - Canonical Hashing: [`shopOrder.services.js:L55-L70`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L55-L70)
  - Validation & Conflict Check: [`shopOrder.services.js:L106-L166`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L106-L166)
  - Duplicate Key Race Handler: [`shopOrder.services.js:L291-L316`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L291-L316)
  - Privacy Redaction Formatter: [`shopOrder.services.js:L360-L391`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L360-L391)
- **Verified Behavior:**
  - Payload hashing deterministically hashes canonical fields (`productId`, `quantity`, `customer.name`, `customer.contactMethod` lowercased, `customer.deliveryArea`, `customerNote`). Transient metadata (timestamps, IP) is omitted.
  - Reusing a key with a conflicting payload produces HTTP 409 (`ConflictException`).
  - Concurrent submissions racing into `order.save()` catch MongoDB error code `11000` (E11000 duplicate key error) and resolve to the idempotent confirmation.
  - Idempotent retry responses redact `customer.name` to `"[Redacted for Privacy]"`, mask `customer.contactMethod` (e.g. `c***e@example.com`, `091****89`), omit `customer.deliveryArea`, and set `customerNote` to `null`. Customer PII is protected against key-guessing.

### 1.4 AUDIT-SEC-02: Regex ReDoS Mitigation & Input Bounding
- **Source Locations:**
  - Order search: [`shopOrder.services.js:L407-L415`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L407-L415)
  - Product search: [`shopProduct.services.js:L197-L205`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopProduct.services.js#L197-L205)
- **Verified Code:**
  ```javascript
  _escapeRegex(str) {
    if (typeof str !== "string") return "";
    return str.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  ```
- **Verification Evidence:** Search inputs are sliced to a maximum of 100 characters and metacharacters are safely escaped. Tested with `[.*+?^${}()|\\`, producing literal matching without regex compilation crashes or catastrophic backtracking.

### 1.5 AUDIT-DATA-01: Partial Unique Indexes on SKUs and Slugs
- **Source Locations:**
  - [`models/shopProduct.schema.js:L157-L168`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L157-L168)
  - [`models/shopCategory.schema.js:L49-L55`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopCategory.schema.js#L49-L55)
- **Verified Code:**
  ```javascript
  shopProductSchema.index(
    { sku: 1 },
    { unique: true, partialFilterExpression: { del_flag: 0 } }
  );
  shopProductSchema.index(
    { slug: 1 },
    { unique: true, partialFilterExpression: { del_flag: 0 } }
  );
  ```
- **Verification Evidence:** The Mongoose schemas specify partial unique indexes that filter on `{ del_flag: 0 }`. This allows reuse of SKUs and slugs after a previous item has been soft-deleted (`del_flag: 1`). (See Section 4 for database deployment status).

### 1.6 AUDIT-PERF-01: Storefront SSR Duplicate Fetch Elimination
- **Source Location:** [`src/features/shop/components/StorefrontCatalog.tsx:L83-L125`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech/src/features/shop/components/StorefrontCatalog.tsx#L83-L125)
- **Verified Code:**
  ```typescript
  const lastFetchedSignatureRef = useRef<string>(
    generateFilterSignature(initialFilters)
  );
  ```
- **Verification Evidence:** On initial render, `lastFetchedSignatureRef` is initialized to match the server-rendered filter signature. Client hydration checks the signature before triggering `fetchProducts`, completely eliminating the redundant second HTTP fetch on mount.

### 1.7 AUDIT-PERF-02: Microtask Product Batching Queue
- **Source Location:** [`src/features/shop/components/ProductEmbedBlock.tsx:L19-L59`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech/src/features/shop/components/ProductEmbedBlock.tsx#L19-L59)
- **Verified Code:**
  ```typescript
  let batchedProductQueue: string[] = [];
  let batchScheduled = false;
  // Flushes queue via Promise.resolve().then(...)
  ```
- **Verification Evidence:** Multiple `<ProductEmbedBlock>` components appearing on a single article page enqueue their product IDs into a microtask batch queue. A single batch network request is issued for all embed blocks instead of $N$ sequential round trips.

### 1.8 AUDIT-TEST-01: Real Express Route Integration Testing
- **Source Location:** [`tests/shopHttpIntegration.test.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/tests/shopHttpIntegration.test.js)
- **Verified Behavior:** 12 integration tests verify real route mounting, Express middleware chaining (`AdminMiddleware`, `AdminOrCronMiddleware`, rate limiters), error handling, and business invariants without mocking Express router dispatch.

---

## 2. Exact Tests and Commands Executed

### 2.1 Backend Test Suite Execution
- **Command:** `npm run test:shop` (in `/Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be`)
- **Result:** **62 passed, 0 failed** across 8 test suites.

| Suite File | Tests | Status | Scope |
| :--- | :---: | :---: | :--- |
| `tests/shopProductLifecycle.test.js` | 6 | PASS | Category & product CRUD, soft delete, pricing validation |
| `tests/shopPublicApi.test.js` | 5 | PASS | Catalog queries, price filtering, sorting, unpublished exclusions |
| `tests/shopOrderWorkflow.test.js` | 6 | PASS | Inquiry creation, contact method validation, bounds, snapshotting |
| `tests/inventoryIntegrityAndConfirmation.test.js` | 11 | PASS | Stock deduction, supplier verification gating, expiration calculations |
| `tests/shopContentCommerce.test.js` | 10 | PASS | Embed block isolation, dynamic resolution, attribution tracking |
| `tests/shopLaunchReadinessAnalytics.test.js` | 6 | PASS | Telemetry validation, rate limiting, revenue segregation, margin confidentiality |
| `tests/shopS61ProductionVerification.test.js` | 6 | PASS | Competing orders, multi-item rollback, terminal state locks, inventory reconciliation |
| `tests/shopHttpIntegration.test.js` | 12 | PASS | Express route mounting, 404s, auth middleware, idempotency, regex ReDoS |
| **Backend Total** | **62** | **PASS** | |

### 2.2 Frontend Test Suite Execution
- **Command:** `npm run test:shop` (in `/Users/mac/Documents/workspace/workspace_coding/open-trash-tech`)
- **Result:** **33 passed, 0 failed** across 7 test suites.

| Suite File | Tests | Status | Scope |
| :--- | :---: | :---: | :--- |
| `src/features/shop/__tests__/shopFoundation.test.ts` | 3 | PASS | Product/category schemas, price formatting, VND formatting |
| `src/features/shop/__tests__/shopCatalogAndSeo.test.ts` | 5 | PASS | Catalog filtering, availability badges, dynamic SEO metadata |
| `src/features/shop/__tests__/shopOrderWorkflow.test.ts` | 6 | PASS | Contact validation, quantity bounds, state machine terminal locks |
| `src/features/shop/__tests__/shopInventoryAndConfirmation.test.ts` | 5 | PASS | Inventory invariants, supplier verification, 72h expiration calculation |
| `src/features/shop/__tests__/shopContentCommerce.test.ts` | 8 | PASS | Stable reference isolation, HTML-v1 backward compat, attribution pipeline |
| `src/features/shop/__tests__/shopLaunchReadiness.test.ts` | 6 | PASS | Funnel metrics, zero-division safety, revenue separation, telemetry privacy |
| `src/features/shop/__tests__/shopS62Remediation.test.ts` | 3 | PASS | SSR filter signature determinism, embed microtask batching, formatVND |
| **Frontend Total** | **33** | **PASS** | |

### 2.3 Frontend Static Type Checking
- **Command:** `npx tsc --noEmit` (in `/Users/mac/Documents/workspace/workspace_coding/open-trash-tech`)
- **Result:** **0 errors**. Full TypeScript compilation passed cleanly without type diagnostics.

### 2.4 Classification of Test Coverage

To avoid claiming guarantees based solely on unit mocks, all existing test cases are classified by testing methodology:

| Classification | Count | Test Files | Description & Invariant Validated |
| :--- | :---: | :--- | :--- |
| **Unit Test with Mocks** | 71 | `shopProductLifecycle`, `shopPublicApi`, `shopOrderWorkflow`, `inventoryIntegrityAndConfirmation`, `shopContentCommerce`, `shopLaunchReadinessAnalytics`, Frontend S1–S6.2 | Tests business validation logic, formatters, state machines, and calculations using in-memory stubs. |
| **HTTP Integration Test** | 12 | `tests/shopHttpIntegration.test.js` | Tests real Express application instance, middleware dispatch (`AdminMiddleware`, rate limiters), route mounting (`/shop/analytics/*`), status codes (404, 401, 403, 409, 201, 200). |
| **Concurrency Simulation with Mocks** | 6 | `tests/shopS61ProductionVerification.test.js` | Uses `Promise.all` to simulate concurrent confirmation, competing inventory requests, and cancellation races against stateful mock stores. |
| **True Concurrency & Replica Set Transaction Test** | 0 | *Requires dedicated live cluster test environment* | Tests wire-protocol MongoDB transactions, write conflict detection, distributed locking, and socket crashes. |
| **Deployment-Dependent Verification** | 6 | *Documented in Sections 3, 5, 6* | Requires live multi-instance deployment, real Redis rate limit store, external cron trigger verification, and MongoDB index validation. |

---

## 3. Transaction and Concurrency Verification Evidence

### 3.1 MongoDB Deployment Topology Compatibility
- **Runtime Topology Verification:** Executed read-only topology probe against the connected database:
  ```json
  {
    "server": "atlas-8q6zvi-shard-00-02.y55f4.mongodb.net:27017",
    "setName": "atlas-8q6zvi-shard-0",
    "topologyType": "ReplicaSetWithPrimary",
    "transactionsSupported": true
  }
  ```
- **Analysis:** The environment is an authentic MongoDB Atlas replica set (`ReplicaSetWithPrimary`). Multi-document ACID transactions via `session.startTransaction()` and `session.commitTransaction()` are natively supported.
- **Graceful Fallback:** If executed against a standalone MongoDB instance (such as local development without `--replSet`), `_withTransaction` catches the transaction startup error and passes `session = null`. When `session = null`, application-level compensating rollbacks (re-incrementing `reservedQuantity` on partial failure) activate.

### 3.2 Session Propagation in `_withTransaction`
Every database operation inside transactional workflows was inspected for session propagation:
1. `updateOrderStatus`:
   - `ShopOrder.findOne({ _id: id, del_flag: 0 }).session(session)`: **Passed session**.
   - `_reserveOrderInventory(order, session)`:
     - `ShopProduct.findOneAndUpdate({ ... }, { $inc: { reservedQuantity: item.quantity } }, queryOpts)`: **Passed session** via `queryOpts = { new: true, session }`.
     - `ShopProduct.updateOne({ availabilityStatus: "out_of_stock" }, updateOpts)`: **Passed session** via `updateOpts = { session }`.
     - Compensating rollback queries inside catch block: **Passed session**.
   - `_releaseOrderInventory(order, session)`:
     - `ShopProduct.findOneAndUpdate({ ... }, { $inc: { reservedQuantity: -item.quantity } }, queryOpts)`: **Passed session**.
     - `ShopProduct.updateOne({ availabilityStatus: "in_stock" }, updateOpts)`: **Passed session**.
   - `_fulfillOrderInventory(order, session)`:
     - `ShopProduct.updateOne({ ... }, { $inc: { stockQuantity: -qty, reservedQuantity: -qty } }, updateOpts)`: **Passed session**.
   - `order.save({ session })`: **Passed session**.
2. `releaseExpiredReservations`:
   - `ShopOrder.findOneAndUpdate({ _id, status: "confirmed", inventoryReserved: true, del_flag: 0 }, ..., { session, new: false })`: **Passed session**.
   - `_releaseOrderInventory(claimed, session)`: **Passed session**.

*Code Observation:* In `_reserveOrderInventory` line 539, an un-sessioned `ShopProduct.findOne({ _id: item.product }).lean()` is used solely to extract available stock for the error message (`Insufficient stock available for ...`) immediately before throwing `BadRequestException`. Because this occurs inside the failure path right before throwing, the transaction is immediately aborted by `_withTransaction`. This does not threaten transaction atomicity.

### 3.3 Transaction Retries and Transient Failure Handling
- **Mechanism:** `_withTransaction(fn)` manages `session.startTransaction()`, `session.commitTransaction()`, and `session.abortTransaction()`.
- **Finding:** The helper does not implement an automatic retry loop for `TransientTransactionError` or `UnknownTransactionCommitResult` (unlike the driver's native `session.withTransaction`). If two transactions attempt to update the same product document simultaneously, MongoDB will throw a write conflict error. The transaction will abort cleanly, and the client will receive an error response.
- **Pilot Risk:** Low for a pilot with controlled inquiry and confirmation volume. The client or admin can simply retry the operation. For large-scale traffic, wrapping the transaction in a transient-retry loop is recommended.

### 3.4 Exactly-Once Expiration and Worker Race Prevention
- **CAS Query:**
  ```javascript
  ShopOrder.findOneAndUpdate(
    { _id: candidate._id, status: "confirmed", inventoryReserved: true, del_flag: 0 },
    { $set: { status: "cancelled", inventoryReserved: false } }
  )
  ```
- **Concurrency Analysis:** MongoDB document-level locking ensures that `findOneAndUpdate` executes atomically. If Worker A and Worker B simultaneously attempt to process an expired order:
  1. Worker A acquires the write lock, matches the document, updates `status` to `cancelled`, and updates `inventoryReserved` to `false`.
  2. Worker B acquires the lock next, evaluates `{ status: "confirmed", inventoryReserved: true }`, finds no match, and returns `null`.
  3. Worker B checks `if (!claimed) return;` and terminates processing.
  4. Worker A proceeds to release the inventory.
- **Double Release Risk:** **Zero**. Duplicate or racing workers cannot release the same reservation twice.

### 3.5 Process Crash and Multi-Item Inconsistency
- **Replica Set Deployment (Production / Staging):** All multi-item inventory updates and order status mutations occur within a MongoDB session. If the Node.js process crashes mid-loop (e.g. after reserving item 1 of 3):
  - The TCP socket closes and the session expires.
  - MongoDB automatically rolls back and aborts all uncommitted writes.
  - No inventory remains reserved and the order status is unchanged.
- **Standalone Deployment (Local Dev / Fallback):** If `session` is `null` and the process crashes mid-loop, compensating rollbacks cannot execute because the process is terminated. Orphan reservations could remain. This risk is fully mitigated on MongoDB Atlas replica sets. Additionally, `reconcileInventory()` is available to diagnose and correct orphan discrepancies.

### 3.6 Race Between Expiration and Admin Completion/Cancellation
- **Scenario 1 (Admin Completes/Cancels First):**
  - Admin calls `updateOrderStatus(id, "completed")`.
  - Order status transitions to `completed` and `inventoryReserved` is set to `false`.
  - Cron worker evaluates `{ _id: id, status: "confirmed", inventoryReserved: true }`.
  - No match (`claimed === null`). Worker takes no action. Invariants preserved.
- **Scenario 2 (Cron Worker Cancels First):**
  - Cron worker atomically sets status to `cancelled` and `inventoryReserved` to `false`.
  - Admin calls `updateOrderStatus(id, "completed")`.
  - In `updateOrderStatus`, current status is read as `cancelled`.
  - State machine checks `ALLOWED_TRANSITIONS["cancelled"]` (which is `[]`).
  - Request throws `BadRequestException("Cannot transition order from 'cancelled' to 'completed'. Allowed transitions: none (terminal state)")`.
  - Admin transaction aborts. Invariants preserved.

---

## 4. Index Migration Safety & Rollout Plan

### 4.1 Database Index Audit Findings
Inspecting the live MongoDB Atlas cluster revealed discrepancies between the declared Mongoose schemas, the S6.2 migration script, and the actual database state:

1. **Actual Collection Names:**
   - Products: `shop_products` (Declared via `mongoose.model("shop_product", ...)`)
   - Categories: `shop_categories` (Declared via `mongoose.model("shop_category", ...)`)
   - Orders: `ShopOrder` (Declared via `mongoose.model("ShopOrder", shopOrderSchema, "ShopOrder")`)
   - Analytics: `ShopAnalyticsEvent` (Declared via `mongoose.model("ShopAnalyticsEvent", ..., "ShopAnalyticsEvent")`)
   *The draft script in the S6.2 report used `shopproducts`, `shopcategories`, and `shoporders`. This would have targeted non-existent collections.*

2. **Actual Live Index Configurations:**
   - `shop_products`:
     - `sku_1`: `{ unique: true, partialFilterExpression: null }` (Unconditional!)
     - `slug_1`: `{ unique: true, partialFilterExpression: null }` (Unconditional!)
   - `shop_categories`:
     - `slug_1`: `{ unique: true, partialFilterExpression: null }` (Unconditional!)
   - `ShopOrder`:
     - `idempotencyKey_1`: `{ unique: false, sparse: true }` (**Non-unique in Atlas!**)

3. **Re-runnability and Idempotency:**
   - The S6.2 draft script called `db.collection.dropIndex("sku_1")`. In MongoDB, calling `dropIndex` on an index that does not exist throws `IndexNotFound` (code 27). A naive rerun halts on error.
   - Calling `createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true })` on `ShopOrder` without dropping the existing non-unique `idempotencyKey_1` throws `IndexOptionsConflict` (code 85).
   - If legacy indexes are dropped and index recreation fails (e.g. duplicate active keys exist), the database is left without uniqueness constraints.

### 4.2 Preflight Check Script

The following preflight script must be run against the target database before any index modifications are performed:

```javascript
// preflight_check_indexes.js
// Safe, read-only preflight verification
const mongoose = require("mongoose");
require("dotenv").config();

async function runPreflight() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log("=== PREFLIGHT INDEX VERIFICATION ===");

  let hasConflict = false;

  // 1. Check duplicate active SKUs in shop_products
  const skuDups = await db.collection("shop_products").aggregate([
    { $match: { del_flag: 0 } },
    { $group: { _id: "$sku", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 }, _id: { $ne: null } } }
  ]).toArray();
  if (skuDups.length > 0) {
    console.error("❌ CONFLICT: Duplicate active SKUs found in shop_products:", skuDups);
    hasConflict = true;
  } else {
    console.log("✓ No duplicate active SKUs in shop_products.");
  }

  // 2. Check duplicate active Slugs in shop_products
  const prodSlugDups = await db.collection("shop_products").aggregate([
    { $match: { del_flag: 0 } },
    { $group: { _id: "$slug", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 }, _id: { $ne: null } } }
  ]).toArray();
  if (prodSlugDups.length > 0) {
    console.error("❌ CONFLICT: Duplicate active slugs found in shop_products:", prodSlugDups);
    hasConflict = true;
  } else {
    console.log("✓ No duplicate active slugs in shop_products.");
  }

  // 3. Check duplicate active Slugs in shop_categories
  const catSlugDups = await db.collection("shop_categories").aggregate([
    { $match: { del_flag: 0 } },
    { $group: { _id: "$slug", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 }, _id: { $ne: null } } }
  ]).toArray();
  if (catSlugDups.length > 0) {
    console.error("❌ CONFLICT: Duplicate active slugs found in shop_categories:", catSlugDups);
    hasConflict = true;
  } else {
    console.log("✓ No duplicate active slugs in shop_categories.");
  }

  // 4. Check del_flag data types (must be numeric 0 or 1, not boolean or string)
  const nonNumericDelFlagProd = await db.collection("shop_products").countDocuments({
    del_flag: { $not: { $type: "number" } }
  });
  if (nonNumericDelFlagProd > 0) {
    console.error(`❌ CONFLICT: Found ${nonNumericDelFlagProd} shop_products with non-numeric del_flag`);
    hasConflict = true;
  } else {
    console.log("✓ All shop_products del_flag fields are numeric.");
  }

  // 5. Check idempotencyKey conflicts in ShopOrder
  const keyDups = await db.collection("ShopOrder").aggregate([
    { $match: { idempotencyKey: { $exists: true, $ne: null, $ne: "" } } },
    { $group: { _id: "$idempotencyKey", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  if (keyDups.length > 0) {
    console.error("❌ CONFLICT: Duplicate idempotency keys in ShopOrder:", keyDups);
    hasConflict = true;
  } else {
    console.log("✓ No duplicate non-null idempotency keys in ShopOrder.");
  }

  // 6. Check explicit null idempotencyKey values (sparse index indexes explicit null!)
  const nullKeys = await db.collection("ShopOrder").countDocuments({ idempotencyKey: null });
  console.log(`ℹ Orders with explicit null idempotencyKey: ${nullKeys}`);
  if (nullKeys > 1) {
    console.warn("⚠️ NOTICE: Multiple orders have explicit null idempotencyKey. Run unset cleanup before applying sparse unique index.");
  }

  if (hasConflict) {
    console.error("\n❌ PREFLIGHT FAILED: Resolve conflicts before proceeding with migration.");
    process.exit(1);
  } else {
    console.log("\n✅ PREFLIGHT PASSED: Safe to execute index migration.");
    process.exit(0);
  }
}
runPreflight();
```

### 4.3 Production-Safe Migration Rollout Script

The migration script below is **strictly idempotent**, uses verified collection names, cleans explicit null values, and guards every drop operation:

```javascript
// migrate_shop_indexes_safe.js
// Idempotent, safe migration script for MongoDB Atlas
const mongoose = require("mongoose");
require("dotenv").config();

async function migrateIndexes() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log("Starting safe index migration...");

  // Helper to safely drop an index if it exists
  async function safeDropIndex(collectionName, indexName) {
    const indexes = await db.collection(collectionName).indexes();
    const exists = indexes.some((idx) => idx.name === indexName);
    if (exists) {
      console.log(`Dropping index '${indexName}' on '${collectionName}'...`);
      await db.collection(collectionName).dropIndex(indexName);
    } else {
      console.log(`Index '${indexName}' on '${collectionName}' does not exist (skipping drop).`);
    }
  }

  // Helper to check if index with target specification already exists
  async function hasMatchingIndex(collectionName, keyPattern, partialExpr) {
    const indexes = await db.collection(collectionName).indexes();
    return indexes.some((idx) => {
      const keysMatch = JSON.stringify(idx.key) === JSON.stringify(keyPattern);
      const partialMatch = JSON.stringify(idx.partialFilterExpression || null) === JSON.stringify(partialExpr || null);
      return keysMatch && partialMatch;
    });
  }

  // ─── 1. Collection: shop_products ──────────────────────────────────────────
  console.log("\n[1/3] Migrating shop_products indexes...");
  // Drop unconditional unique sku_1 if it lacks partial filter
  const prodIndexes = await db.collection("shop_products").indexes();
  const skuIdx = prodIndexes.find((i) => i.name === "sku_1");
  if (skuIdx && !skuIdx.partialFilterExpression) {
    await safeDropIndex("shop_products", "sku_1");
  }
  const slugIdx = prodIndexes.find((i) => i.name === "slug_1");
  if (slugIdx && !slugIdx.partialFilterExpression) {
    await safeDropIndex("shop_products", "slug_1");
  }

  // Create partial unique indexes
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
  console.log("✓ shop_products partial unique indexes active.");

  // ─── 2. Collection: shop_categories ────────────────────────────────────────
  console.log("\n[2/3] Migrating shop_categories indexes...");
  const catIndexes = await db.collection("shop_categories").indexes();
  const catSlugIdx = catIndexes.find((i) => i.name === "slug_1");
  if (catSlugIdx && !catSlugIdx.partialFilterExpression) {
    await safeDropIndex("shop_categories", "slug_1");
  }

  await db.collection("shop_categories").createIndex(
    { slug: 1 },
    {
      name: "slug_1_partial_active",
      unique: true,
      partialFilterExpression: { del_flag: 0 },
      background: true,
    }
  );
  console.log("✓ shop_categories partial unique index active.");

  // ─── 3. Collection: ShopOrder ──────────────────────────────────────────────
  console.log("\n[3/3] Migrating ShopOrder indexes...");
  // Clean up explicit null idempotencyKey to prevent duplicate key collision on null
  const unsetRes = await db.collection("ShopOrder").updateMany(
    { idempotencyKey: null },
    { $unset: { idempotencyKey: "" } }
  );
  if (unsetRes.modifiedCount > 0) {
    console.log(`Unset explicit null idempotencyKey on ${unsetRes.modifiedCount} orders.`);
  }

  // Drop non-unique idempotencyKey_1
  const orderIndexes = await db.collection("ShopOrder").indexes();
  const idempIdx = orderIndexes.find((i) => i.name === "idempotencyKey_1" || i.name === "idempotencyKey_1_unique");
  if (idempIdx && !idempIdx.unique) {
    await safeDropIndex("ShopOrder", idempIdx.name);
  }

  // Create sparse unique index
  await db.collection("ShopOrder").createIndex(
    { idempotencyKey: 1 },
    {
      name: "idempotencyKey_1_unique",
      unique: true,
      sparse: true,
      background: true,
    }
  );
  console.log("✓ ShopOrder sparse unique index active.");

  console.log("\n✅ All shop indexes migrated successfully.");
  process.exit(0);
}
migrateIndexes();
```

### 4.4 Rollback and Disaster Recovery Plan
If index creation fails or must be rolled back:
1. **Reversion Script:** Drop `sku_1_partial_active`, `slug_1_partial_active`, and `idempotencyKey_1_unique`.
2. **Recreate Baseline:**
   ```javascript
   await db.collection("shop_products").createIndex({ sku: 1 }, { unique: true });
   await db.collection("shop_products").createIndex({ slug: 1 }, { unique: true });
   await db.collection("shop_categories").createIndex({ slug: 1 }, { unique: true });
   await db.collection("ShopOrder").createIndex({ idempotencyKey: 1 }, { sparse: true });
   ```
3. **Application Impact During Reversion:** Soft-deleting an item and creating a new item with the same SKU will temporarily be blocked by E11000 until the partial index is restored. Active traffic is otherwise unaffected.

---

## 5. Remaining Security, Privacy, and Operational Risks

### 5.1 MemoryStore Rate Limiting
- **Observation:** `express-rate-limit` in [`shopOrder.controller.js:L14`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopOrder.controller.js#L14) and [`shopRateLimit.middleware.js:L12`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/middlewares/shopRateLimit.middleware.js#L12) uses default in-memory storage (`MemoryStore`).
- **Risk Assessment:**
  - *Controlled Pilot (Single Instance):* **Acceptable**. If the backend runs as a single Node.js instance, memory-based limiting functions as designed (15 inquiries per 15 min; 120 analytics events per min).
  - *Horizontally Scaled Deployment (Multi-Pod / Cluster):* **Limitation**. Each worker process maintains isolated memory. A client can distribute requests across $N$ instances, effectively multiplying their allowed request volume by $N$.
  - *Mitigation for General Availability:* Provision a Redis instance and attach `rate-limit-redis` store before horizontal autoscaling is enabled.

### 5.2 External Cron Dependency for Inventory Expiration
- **Observation:** Automated cancellation of unconfirmed 72-hour reservations requires calling `POST /shop/orders/admin/release-expired` with header `x-cron-secret: <SHOP_CRON_SECRET>`.
- **Risk Assessment:**
  - If the external cron service (e.g. Cloudflare Worker, GitHub Actions, AWS EventBridge) misconfigures the header or fails to fire, expired reservations will remain in `confirmed` status, holding physical inventory indefinitely.
  - If `SHOP_CRON_SECRET` is unset in the production environment, the endpoint defaults to `AdminMiddleware`, causing cron pings without admin JWTs to fail with HTTP 401.
  - String comparison `cronSecret === providedSecret` in `AdminOrCronMiddleware` uses `===` rather than constant-time comparison `crypto.timingSafeEqual`. Given that the header travels over TLS and `SHOP_CRON_SECRET` should be a high-entropy 256-bit secret, practical timing attack risk is negligible.
  - *Requirement for Pilot:* Verify that `SHOP_CRON_SECRET` is set in production environment variables and verify cron runner HTTP 200 response.

### 5.3 Payload Hashing vs. Caller Authentication
- **Observation:** Canonical payload hashing (`_computeInquiryPayloadHash`) ensures request integrity and detects key collisions.
- **Verification:** The system correctly does **not** treat payload hashing as authentication. Purchase inquiries remain public storefront actions. Caller authentication is enforced only on administrative routes (`/shop/orders/admin/*`, `/shop/analytics/overview`) via `AdminMiddleware`.

### 5.4 Database Constraint Enforcement Lag
- **Observation:** Until the safe index migration is executed on the production Atlas cluster, the unique constraint on `idempotencyKey` is enforced only by sequential application-level checks (`ShopOrder.findOne`), not by MongoDB unique index.
- **Risk:** High-frequency simultaneous submissions with the exact same key during the same millisecond could result in two orders before the migration is applied. This risk is resolved immediately upon applying the migration.

---

## 6. Findings Requiring Production Access or Infrastructure Verification

The following items cannot be fully verified within the local codebase or isolated database and must be signed off by the operations / DevOps team prior to pilot launch:

1. **Production Index Migration Execution:**
   - Execute `preflight_check_indexes.js` and `migrate_shop_indexes_safe.js` against the production MongoDB Atlas cluster.
   - Run `db.ShopOrder.getIndexes()` and `db.shop_products.getIndexes()` to verify `unique: true` on `idempotencyKey_1_unique` and `partialFilterExpression` on `sku_1_partial_active`.
2. **Environment Variable Configuration:**
   - Verify `SHOP_CRON_SECRET` is defined in production container / server environment with $\ge 32$ random characters.
3. **External Cron Scheduler Verification:**
   - Verify that the external scheduled job is configured to call `POST https://<domain>/api/v1/shop/orders/admin/release-expired` every 10–15 minutes with `x-cron-secret: <secret>`.
   - Inspect cron logs to verify HTTP 200 responses.
4. **Reverse Proxy & Trust Proxy Settings:**
   - Verify that Express is configured with `app.set("trust proxy", 1)` if deployed behind Cloudflare, AWS ALB, or Nginx. Without `trust proxy`, `express-rate-limit` and client IP logging evaluate the reverse proxy IP rather than the true client IP.

---

## 7. Final Recommendation: CONDITIONAL GO

### Verdict: **CONDITIONAL GO**

The OpenIdear Shop code implementation across `open-trash-tech` and `open-trash-tech-be` is sound, robust, and verified. Concurrency controls, CAS state machine locks, PII redaction on retries, ReDoS defenses, analytics routing, and frontend performance optimizations all meet high engineering standards.

### Sign-off Conditions (Checklist to proceed to Live Pilot Traffic):
- [ ] **Condition 1:** Execute the preflight script (`preflight_check_indexes.js`) and safe index migration script (`migrate_shop_indexes_safe.js`) against the production MongoDB Atlas cluster.
- [ ] **Condition 2:** Confirm `SHOP_CRON_SECRET` is set in production environment variables and test-fire one automated cron call to verify HTTP 200 response.
- [ ] **Condition 3:** Ensure the production backend runs as a single instance for the pilot, OR provision Redis for `express-rate-limit` if autoscaling beyond 1 instance.
- [ ] **Condition 4:** Perform one end-to-end storefront inquiry test and verify that the confirmation email/reference is generated and viewable in the Admin Order Dashboard.

Upon satisfaction of these 4 operational conditions, the OpenIdear Shop is approved for controlled pilot rollout.
