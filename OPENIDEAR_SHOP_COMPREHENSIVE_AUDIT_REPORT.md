# OpenIdear Shop — Comprehensive Technical Code Audit Report
**Repository:** Backend (`open-trash-tech-be`)  
**Cross-Reference Frontend:** [`open-trash-tech`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech/OPENIDEAR_SHOP_COMPREHENSIVE_AUDIT_REPORT.md)  
**Audit Date:** October 25, 2026  
**Auditor:** Senior / Staff Independent Software Architect  
**Audit Status:** Complete (Strict Read-Only Mode Maintained)  
**Pilot Recommendation:** **CONDITIONAL GO (P0 / P1 Remediation Required Prior to Traffic)**

---

## 1. Executive Summary

This independent technical audit evaluates the complete backend implementation of **OpenIdear Shop** across Sprints S1 through S6.1 in [`open-trash-tech-be`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be).

The backend service layer is built on Node.js, Express, and MongoDB (Atlas Replica Set `atlas-8q6zvi-shard-0`). It manages catalog CRUD, customer inquiry ingestion, atomic inventory reservation, supplier-order verification, content-to-product attribution, and telemetry analytics.

### Key Audit Highlights:
- **12 Canonical Findings** were identified across 8 audit dimensions (3 High, 6 Medium, 3 Low, 0 Critical).
- **Architecture Strengths:**
  - Strict authoritative server-side pricing on inquiry ingestion (tampered client prices are ignored).
  - Explicit state machine transitions (`ALLOWED_TRANSITIONS`) with terminal locks (`cancelled`, `completed`).
  - Zero PII storage in analytics events, utilizing salted 64-character SHA-256 session digests (`_hashSession`).
  - Role-based authorization (`AdminMiddleware`) protecting admin routes and stripping internal supplier cost margins from non-admin payloads.
- **Three Material Pre-Pilot Defects Identified:**
  1. [`AUDIT-ROUTE-01`](#audit-route-01): `ShopAnalyticsController` omitted `this._rootPath` from its route registrations, mounting `/overview` and `/event` on the root application namespace and causing **404 Not Found** on `GET /shop/analytics/overview`.
  2. [`AUDIT-CONC-01`](#audit-conc-01): `releaseExpiredReservations` checks reservation status only in memory before releasing stock. Under concurrent execution, two cron runners can double-release inventory and deplete reserved counters belonging to other active confirmed orders.
  3. [`AUDIT-SEC-01`](#audit-sec-01): Idempotency key lookup returns the previous order's formatted confirmation without checking payload hash or client identity, leaking prior customer names, contact info, and delivery areas upon key collision.
- **Testing Integrity Gap:** Existing test suites rely on in-memory JavaScript mocks (`ShopProduct.findOne = ...`) without invoking Express router layers or real MongoDB transaction sessions. This allowed `AUDIT-ROUTE-01` and `AUDIT-CONC-01` to pass unnoticed with an artificial 100% pass count.

---

## 2. Audited Scope & Code Modules Inspected

### Backend Files & Modules Inspected:
- **Controllers:**
  - [`controllers/shopProduct.controller.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopProduct.controller.js): Catalog CRUD, batch lookup, public projection, embed event endpoint.
  - [`controllers/shopOrder.controller.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopOrder.controller.js): Inquiry submission, order lifecycle transitions, supplier verification, expired reservation release.
  - [`controllers/shopAnalytics.controller.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopAnalytics.controller.js): Telemetry ingestion, unified commerce analytics dashboard.
  - [`controllers/shopCategory.controller.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopCategory.controller.js): Category hierarchy and management.
- **Services:**
  - [`services/shopProduct.services.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopProduct.services.js): Product validation, slugification, stock adjustments, public filtering.
  - [`services/shopOrder.services.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js): Order snapshots, reference generation, replica set transaction execution, reservation lifecycle, inventory reconciliation.
  - [`services/shopAnalytics.services.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopAnalytics.services.js): Event logging, UTC range calculation, funnel aggregation, financial breakdown, contribution margin calculation.
  - [`services/shopCategory.services.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopCategory.services.js): Category tree validation and soft-deletion constraints.
- **Data Models:**
  - [`models/shopProduct.schema.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js): Compound indexes, virtual `availableQuantity`, normalization pre-hooks.
  - [`models/shopOrder.schema.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopOrder.schema.js): Item snapshots, status history audit trail, subdocument attribution.
  - [`models/shopAnalyticsEvent.schema.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopAnalyticsEvent.schema.js): 90-day TTL index, compound query indexes.
  - [`models/shopCategory.schema.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopCategory.schema.js): Hierarchy and display order.
- **Infrastructure & Middlewares:**
  - [`middlewares/auth.middleware.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/middlewares/auth.middleware.js): `AdminMiddleware`, `isAdminUser` role checks.
  - [`middlewares/shopRateLimit.middleware.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/middlewares/shopRateLimit.middleware.js): Telemetry rate limiter (120 req/min/IP).
  - [`functions/appServer.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/functions/appServer.js): CORS options, helmet headers, error handlers, controller loading.
  - [`index.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/index.js): Fail-fast environment variable validation.

---

## 3. Actual Backend Architecture Map

```mermaid
flowchart TD
    subgraph HTTP [HTTP Requests & Routing]
        R1["Public Storefront / Embeds"] -->|GET /shop/products*| C1["ShopProductController"]
        R2["Public Inquiry Form"] -->|POST /shop/orders/inquiries| C2["ShopOrderController"]
        R3["Public Telemetry"] -->|POST /shop/products/analytics/event| C1
        R4["Admin Dashboard"] -->|Admin Routes (AdminMiddleware)| C1
        R4 -->|Admin Routes (AdminMiddleware)| C2
        R4 -->|Admin Routes (AdminMiddleware)| C3["ShopCategoryController"]
        R4 -.->|GET /shop/analytics/overview (404 BUG!)| C4["ShopAnalyticsController"]
        R5["Cloud Cron Worker"] -->|POST /shop/orders/admin/release-expired (x-cron-secret)| C2
    end

    subgraph Controllers [Controllers & Middleware Layer]
        C1 --> S1["ShopProductService"]
        C2 --> S2["ShopOrderService"]
        C3 --> S3["ShopCategoryService"]
        C4 --> S4["ShopAnalyticsService"]
    end

    subgraph Services [Business Logic & Data Integrity]
        S2 -->|ACID Multi-Document Transactions| TX["_withTransaction(session)"]
        S2 -->|Inventory Locks| S1
        S4 -->|Aggregation Pipelines| AGG["Funnel & Financial Aggregations"]
    end

    subgraph Models [MongoDB Collections]
        S1 --> M1[("shop_product")]
        S2 --> M2[("ShopOrder")]
        S3 --> M3[("shop_category")]
        S4 --> M4[("ShopAnalyticsEvent (90d TTL)")]
        S4 --> M5[("Post (Attribution Validation)")]
    end
```

---

## 4. Findings Matrix

| Finding ID | Severity | Category | File & Location | Summary | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUDIT-ROUTE-01** | **High** | API / Routing | `controllers/shopAnalytics.controller.js:63` | Controller routes mount at `/overview` and `/event` instead of `/shop/analytics/*`, causing 404 on admin dashboard. | Confirmed |
| **AUDIT-CONC-01** | **High** | Concurrency | `services/shopOrder.services.js:675-716` | `releaseExpiredReservations` lacks atomic claim; concurrent cron calls double-release stock. | Confirmed |
| **AUDIT-SEC-01** | **High** | Security / Privacy | `services/shopOrder.services.js:82-91` | Reused idempotency key returns prior customer PII without payload verification or conflict check. | Confirmed |
| **AUDIT-SEC-02** | **Medium** | Security | `services/shopProduct.services.js:520` | Unescaped user query in `new RegExp(query.search)` causes 500 errors and ReDoS risk. | Confirmed |
| **AUDIT-DATA-01** | **Medium** | Data Integrity | `models/shopProduct.schema.js:59,66` | Soft-deleted products permanently lock SKUs and slugs due to lack of partial unique indexes. | Confirmed |
| **AUDIT-PERF-01** | **Medium** | Performance | `StorefrontCatalog.tsx:105-109` | Redundant client-side fetch on initial page mount duplicates SSR data loading. | Confirmed |
| **AUDIT-PERF-02** | **Medium** | Performance | `ArticleProductEmbed.tsx:70` | N+1 individual HTTP requests fired for multiple product embeds in a single article. | Confirmed |
| **AUDIT-DATA-02** | **Medium** | Analytics | `models/shopAnalyticsEvent.schema.js:62` | 90-day TTL index on events causes funnel ratios to distort for queries older than 90 days. | Confirmed |
| **AUDIT-TEST-01** | **Medium** | Testing | `open-trash-tech-be/tests/*.test.js` | Test suites rely exclusively on in-memory query mocks, concealing routing and concurrency defects. | Confirmed |
| **AUDIT-SEC-03** | **Low** | Security | `controllers/shopOrder.controller.js:29` | Non-constant time string comparison on `x-cron-secret`. | Confirmed |
| **AUDIT-MAINT-01** | **Low** | Maintainability | `services/index.js:6` | Circular dependency warnings emitted during module resolution on startup. | Confirmed |
| **AUDIT-MAINT-02** | **Low** | Maintainability | `ProductManagement.tsx:34` | Re-declared `formatVND` instead of importing canonical utility from `formatters.ts`. | Confirmed |

---

## 5. Detailed Findings & Backend Remediation

<a id="audit-route-01"></a>
### [AUDIT-ROUTE-01] High: `ShopAnalyticsController` Route Prefix Omission (404 on Dashboard & Root Namespace Pollution)
- **File:** [`controllers/shopAnalytics.controller.js:61-71`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopAnalytics.controller.js#L61-L71)
- **Code Evidence:**
  ```javascript
  class ShopAnalyticsController extends Controller {
    _rootPath = "/shop/analytics";
    ...
    initController = () => {
      // Missing this._rootPath in route registrations!
      this._router.post("/event", analyticsEventRateLimiter, this.recordEvent);
      this._router.get("/overview", AdminMiddleware, this.getCommerceOverview);
    };
  }
  ```
- **Execution Path:**
  1. `appServer.js:53` loads controllers with `this._app.use("/", controller._router)`.
  2. Because `ShopAnalyticsController` omitted `${this._rootPath}`, the routes registered on Express are `POST /event` and `GET /overview`.
  3. When the admin frontend requests `GET /shop/analytics/overview`, Express returns `HTTP 404 Not Found`.
  4. Root endpoints `/overview` and `/event` pollute the root path and conflict with existing root API conventions.
- **Remediation:** Prefix route paths with `${this._rootPath}`:
  ```javascript
  initController = () => {
    this._router.post(`${this._rootPath}/event`, analyticsEventRateLimiter, this.recordEvent);
    this._router.get(`${this._rootPath}/overview`, AdminMiddleware, this.getCommerceOverview);
  };
  ```

---

<a id="audit-conc-01"></a>
### [AUDIT-CONC-01] High: Missing Atomic Claim in `releaseExpiredReservations` (Race Condition & Reserved Inventory Depletion)
- **File:** [`services/shopOrder.services.js:675-716`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L675-L716)
- **Code Evidence:**
  ```javascript
  const expiredOrders = await ShopOrder.find({
    status: "confirmed",
    inventoryReserved: true,
    reservationExpiresAt: { $lt: now },
    del_flag: 0,
  });

  for (const order of expiredOrders || []) {
    if (order.status !== "confirmed" || !order.inventoryReserved) {
      continue; // In-memory check only!
    }
    await this._releaseOrderInventory(order);
    order.status = "cancelled";
    await order.save();
  }
  ```
- **Failure Scenario:**
  1. Scheduler A and Scheduler B invoke `POST /shop/orders/admin/release-expired` simultaneously.
  2. Both query `ShopOrder.find(...)` and receive the same expired order.
  3. Both workers enter the loop. Because `order` is a separate in-memory object in each worker process, neither sees the other's status change.
  4. Worker A runs `_releaseOrderInventory(order)`: `$inc: { reservedQuantity: -qty }`.
  5. Worker B ALSO runs `_releaseOrderInventory(order)`: `$inc: { reservedQuantity: -qty }` a second time!
  6. If other customers have active confirmed orders for the same SKU, Worker B's redundant update steals and decrements their reserved allocation, causing available stock to be oversold!
- **Remediation:** Enforce a database-level atomic claim before releasing inventory:
  ```javascript
  for (const order of expiredOrders || []) {
    const claimedOrder = await ShopOrder.findOneAndUpdate(
      { _id: order._id, status: "confirmed", inventoryReserved: true },
      {
        $set: { status: "cancelled", inventoryReserved: false },
        $push: {
          statusHistory: {
            status: "cancelled",
            changedAt: new Date(),
            changedBy: null,
            note: "System automated operational cancellation: 72-hour inventory reservation expired.",
          },
        },
      },
      { new: false }
    );

    if (!claimedOrder) continue; // Already claimed and released by another worker
    await this._releaseOrderInventory(claimedOrder);
  }
  ```

---

<a id="audit-sec-01"></a>
### [AUDIT-SEC-01] High: Idempotency Key Reuse Returns Prior Customer PII Without Payload Verification
- **File:** [`services/shopOrder.services.js:82-91`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L82-L91)
- **Code Evidence:**
  ```javascript
  if (idempotencyKey && typeof idempotencyKey === "string") {
    const existing = await ShopOrder.findOne({
      idempotencyKey: idempotencyKey.trim(),
      del_flag: 0,
    }).lean();

    if (existing) {
      return this._formatCustomerConfirmation(existing);
    }
  }
  ```
- **Vulnerability Scenario:**
  - An attacker sends an inquiry with `idempotencyKey: "ORD-TEST-001"` (or common UUID patterns).
  - The server returns `_formatCustomerConfirmation(existing)`, disclosing the existing customer's:
    - Full Name (`customer.name`)
    - Phone number / Email (`customer.contactMethod`)
    - Delivery Area (`customer.deliveryArea`)
    - Customer Notes (`customerNote`)
  - Furthermore, if a customer legitimately retries with a modified quantity or item under the same idempotency key, the server silently returns the stale order confirmation without updating or alerting the customer.
- **Remediation:**
  1. Hash the canonical request payload:
     `const requestHash = crypto.createHash("sha256").update(JSON.stringify({ productId, quantity, customer })).digest("hex");`
  2. If an order with that `idempotencyKey` exists, compare `existing.requestHash === requestHash`.
  3. If the hash differs, throw `409 Conflict: Idempotency Key payload mismatch`.

---

<a id="audit-sec-02"></a>
### [AUDIT-SEC-02] Medium: Unescaped User Input in RegExp Constructors (ReDoS & 500 Error Disclosure)
- **File:** [`services/shopProduct.services.js:267, 520`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopProduct.services.js#L520), [`services/shopOrder.services.js:271`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopOrder.services.js#L271)
- **Code Evidence:**
  ```javascript
  if (query.search && typeof query.search === "string" && query.search.trim()) {
    const searchRegex = new RegExp(query.search.trim(), "i");
    filter.$or = [{ name: searchRegex }, { summary: searchRegex }];
  }
  ```
- **Remediation:** Escape regex metacharacters:
  ```javascript
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const searchRegex = new RegExp(escapeRegex(query.search.trim()), "i");
  ```

---

<a id="audit-data-01"></a>
### [AUDIT-DATA-01] Medium: Soft-Deleted Products Permanently Lock SKUs and Slugs
- **File:** [`models/shopProduct.schema.js:59, 66`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopProduct.schema.js#L59), [`models/shopCategory.schema.js:22`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopCategory.schema.js#L22)
- **Code Evidence:**
  ```javascript
  slug: { type: String, required: true, unique: true },
  sku: { type: String, required: true, unique: true }
  ```
- **Remediation:** In MongoDB, unique indexes span all documents including `{ del_flag: 1 }`. Replace with partial filter indexes:
  ```javascript
  shopProductSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { del_flag: 0 } });
  shopProductSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { del_flag: 0 } });
  ```

---

<a id="audit-data-02"></a>
### [AUDIT-DATA-02] Medium: 90-Day Event TTL Distorts Conversion Ratios & Product Table Ignores Time Filters
- **File:** [`models/shopAnalyticsEvent.schema.js:62-65`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/models/shopAnalyticsEvent.schema.js#L62), [`services/shopAnalytics.services.js:454-475`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/shopAnalytics.services.js#L454)
- **Code Evidence:**
  - `ShopAnalyticsEvent` expires after 90 days via `{ expireAfterSeconds: 7776000 }`.
  - In `getCommerceAnalyticsOverview`, `productPerformance` queries `ShopProduct.find({ del_flag: 0 }).sort({ orderCount: -1 })`, returning all-time counters regardless of whether `range="7d"` or `range="30d"` was selected.
- **Remediation:** Document in API metadata that product leaderboard metrics are lifetime counters, and cap event queries to within 90 days.

---

<a id="audit-test-01"></a>
### [AUDIT-TEST-01] Medium: Test Suites Rely Exclusively on In-Memory Query Mocks
- **File:** [`tests/shopLaunchReadinessAnalytics.test.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/tests/shopLaunchReadinessAnalytics.test.js), [`tests/shopOrderWorkflow.test.js`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/tests/shopOrderWorkflow.test.js)
- **Actual Impact:** Mocks (`ShopProduct.findOne = () => ...`) bypass Express HTTP routing, request parsing, authentication middleware, and database write locks. This caused `AUDIT-ROUTE-01` and `AUDIT-CONC-01` to pass unnoticed.
- **Remediation:** Add Supertest HTTP tests (`supertest(appServer._app)`) to verify route registration and status codes.

---

<a id="audit-sec-03"></a>
### [AUDIT-SEC-03] Low: Non-Constant Time String Comparison for Cron Shared Secret
- **File:** [`controllers/shopOrder.controller.js:29`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/controllers/shopOrder.controller.js#L29)
- **Remediation:** Use `crypto.timingSafeEqual` with length matching.

---

<a id="audit-maint-01"></a>
### [AUDIT-MAINT-01] Low: Circular Dependency Warnings Emitted on Startup
- **File:** [`services/index.js:6, 17, 24`](file:///Users/mac/Documents/workspace/workspace_coding/open-trash-tech-be/services/index.js#L6)
- **Remediation:** Direct module imports for internal service dependencies.

---

## 6. Execution Evidence & Verification Commands

All checks were executed in read-only mode on the host environment:

### 1. Backend Test Suite Run
- **Command:** `npm run test:shop` (in `open-trash-tech-be`)
- **Result:** **49 passed, 0 failed** across S1, S2, S3, S4, S5, S6, and S6.1 suites.
- **Analysis:** 100% pass rate confirms internal business logic methods conform to existing unit mocks, but highlights the blindspot in route mounting and real concurrency.

### 2. Admin Authorization Regression Suite
- **Command:** `node tests/adminAuthorization.test.js` (in `open-trash-tech-be`)
- **Result:** **9 passed, 0 failed**. Verified `AdminMiddleware` protects existing core admin routes.

### 3. Git Status Verification
- **Command:** `git status -s`
- **Result:** Verified zero application source code files were mutated or deleted during this audit.

---

## 7. Prioritized Remediation Roadmap

### Phase 1: P0 — Mandatory Pre-Pilot Fixes (Effort: 0.5 Day)
1. **Fix `ShopAnalyticsController` Route Prefix (`AUDIT-ROUTE-01`):** Ensure `GET /shop/analytics/overview` returns 200 to admin dashboard.
2. **Implement Atomic Claim in Expiration Worker (`AUDIT-CONC-01`):** Prevent multi-worker double-release race condition.
3. **Idempotency Key Payload Hash Verification (`AUDIT-SEC-01`):** Prevent cross-customer PII leakage on key collisions.

### Phase 2: P1 — Pre-Traffic Hardening (Effort: 1 Day)
4. **Escape RegExp Search Queries (`AUDIT-SEC-02`):** Prevent 500 errors and ReDoS on public search.
5. **Partial Filter Expressions on Unique Indexes (`AUDIT-DATA-01`):** Permit SKU reuse after soft deletion.

### Phase 3: P2 — Post-Pilot Architectural Enhancements
6. **Supertest HTTP Integration Suite (`AUDIT-TEST-01`):** Validate HTTP route mounting and middleware chains.
7. **Timing-Safe Cron Comparison (`AUDIT-SEC-03`):** Hardening against timing attacks.
8. **Circular Dependency Cleanup (`AUDIT-MAINT-01`):** Clean service export graph.

---

## 8. Final Pilot Recommendation

### Verdict: **CONDITIONAL GO (REMEDIATION REQUIRED BEFORE PILOT TRAFFIC)**

**Required Actions Prior to Pilot Opening:**
1. Fix `ShopAnalyticsController` route paths (`AUDIT-ROUTE-01`).
2. Implement atomic `findOneAndUpdate` claim in `releaseExpiredReservations` (`AUDIT-CONC-01`).
3. Add payload hash validation to `createInquiry` idempotency checks (`AUDIT-SEC-01`).

Once these 3 items are resolved, the backend is architecturally sound and production-ready for the controlled 10–20 product pilot.
