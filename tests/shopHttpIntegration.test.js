// =============================================================================
//  OPENIDEAR SHOP — S6.2 HTTP INTEGRATION & AUDIT REMEDIATION TESTS
//  tests/shopHttpIntegration.test.js
// =============================================================================

require("ts-node/register");
require("dotenv").config();
const http = require("http");
const assert = require("assert");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const {
  ShopAnalyticsController,
  ShopProductController,
  ShopOrderController,
} = require("../controllers");
const {
  shopAnalyticsService,
  shopOrderService,
  shopProductService,
} = require("../services");
const {
  ShopOrder,
  ShopProduct,
  ShopCategory,
  ShopAnalyticsEvent,
  User,
  Post,
} = require("../models");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — S6.2 HTTP INTEGRATION & AUDIT REMEDIATION TESTS");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      failed++;
    }
  }

  // Preserve model originals for mocking during unit/integration tests
  const origOrderFindOne = ShopOrder.findOne;
  const origOrderFind = ShopOrder.find;
  const origOrderFindOneAndUpdate = ShopOrder.findOneAndUpdate;
  const origOrderUpdateOne = ShopOrder.updateOne;
  const origProductFindOne = ShopProduct.findOne;
  const origProductFindOneAndUpdate = ShopProduct.findOneAndUpdate;
  const origProductUpdateOne = ShopProduct.updateOne;
  const origProductFind = ShopProduct.find;
  const origProductCreate = ShopProduct.create;
  const origAnalyticsEventCreate = ShopAnalyticsEvent.create;
  const origUserFindById = User.findById;

  function restoreAll() {
    ShopOrder.findOne = origOrderFindOne;
    ShopOrder.find = origOrderFind;
    ShopOrder.findOneAndUpdate = origOrderFindOneAndUpdate;
    ShopOrder.updateOne = origOrderUpdateOne;
    ShopProduct.findOne = origProductFindOne;
    ShopProduct.findOneAndUpdate = origProductFindOneAndUpdate;
    ShopProduct.updateOne = origProductUpdateOne;
    ShopProduct.find = origProductFind;
    ShopProduct.create = origProductCreate;
    ShopAnalyticsEvent.create = origAnalyticsEventCreate;
    User.findById = origUserFindById;
  }

  // Set up real Express app mounting the controllers exactly as AppServer does
  const app = express();
  app.use(express.json());

  // Mount real controllers matching AppServer's loadControllers: app.use("/", controller._router)
  const analyticsController = new ShopAnalyticsController();
  const productController = new ShopProductController();
  const orderController = new ShopOrderController();

  app.use("/", analyticsController._router);
  app.use("/", productController._router);
  app.use("/", orderController._router);

  // Error handling middleware
  app.use((err, req, res, next) => {
    if (err.status !== 400 && err.status !== 401 && err.status !== 403 && err.status !== 404 && err.status !== 409) {
      console.error("DEBUG TEST SERVER ERROR:", err);
    }
    const status = err.status || 500;
    res.status(status).json({
      status: "error",
      message: err.message,
    });
  });

  // Start ephemeral HTTP server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Helper to generate a valid admin JWT
  const secret = process.env.SECRET_KEY || "test-secret-key-12345";
  process.env.SECRET_KEY = secret;
  const adminUser = {
    _id: new mongoose.Types.ObjectId(),
    email: "admin@openidear.com",
    role: "admin",
    del_flag: 0,
  };
  const adminToken = jwt.sign(
    { _id: adminUser._id.toString(), role: "admin", email: adminUser.email },
    secret,
    { expiresIn: "1h" }
  );

  try {
    // =========================================================================
    //  SECTION 1: AUDIT-ROUTE-01 — ANALYTICS ROUTE REGISTRATION & PATHS
    // =========================================================================

    await test("1. [ROUTE-01] POST /shop/analytics/event reaches handler and validates payload", async () => {
      // 1a. Missing product ID should return 400 Bad Request
      const badRes = await fetch(`${baseUrl}/shop/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "impression" }),
      });
      assert.strictEqual(badRes.status, 400, "Should return 400 when productId is missing");

      // 1b. Valid event reaches service
      let recordedEvent = null;
      ShopAnalyticsEvent.create = async (doc) => {
        recordedEvent = doc;
        return doc;
      };
      ShopProduct.findOne = () => ({
        select: () => ({
          _id: new mongoose.Types.ObjectId(),
          status: "published",
          del_flag: 0,
        }),
        lean: async () => ({
          _id: new mongoose.Types.ObjectId(),
          status: "published",
          del_flag: 0,
        }),
      });
      ShopProduct.updateOne = async () => ({ modifiedCount: 1 });

      const testPid = new mongoose.Types.ObjectId().toString();
      const goodRes = await fetch(`${baseUrl}/shop/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "impression",
          productId: testPid,
          articleSlug: "rtx-5090-analysis",
        }),
      });
      assert.strictEqual(goodRes.status, 200, "Valid event must return 200 OK");
      const goodJson = await goodRes.json();
      assert.strictEqual(goodJson.status, "success");
      assert.strictEqual(goodJson.data.success, true);
    });

    await test("2. [ROUTE-01] GET /shop/analytics/overview requires authentication and authorization", async () => {
      // 2a. Unauthenticated request must return 401/403
      const unauthRes = await fetch(`${baseUrl}/shop/analytics/overview`);
      assert.ok(
        unauthRes.status === 401 || unauthRes.status === 403,
        `Expected 401/403 for unauthenticated analytics overview, got ${unauthRes.status}`
      );

      // 2b. Authenticated with admin token reaches handler
      User.findOne = () => ({
        select: () => ({
          _id: adminUser._id,
          role: "admin",
          email: adminUser.email,
          username: "admin",
          activate: true,
        }),
      });

      ShopAnalyticsEvent.aggregate = async () => [];
      ShopProduct.aggregate = async () => [];
      const mockQueryChain = (val) => ({
        select: function () { return this; },
        sort: function () { return this; },
        limit: function () { return this; },
        lean: async () => val,
      });
      ShopProduct.find = () => mockQueryChain([]);
      ShopOrder.aggregate = async () => [];

      const authRes = await fetch(`${baseUrl}/shop/analytics/overview`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(authRes.status, 200, "Admin request to /shop/analytics/overview must return 200 OK");
      const authJson = await authRes.json();
      assert.strictEqual(authJson.status, "success");
      assert.ok(authJson.data.funnel, "Must return funnel metrics");
    });

    await test("3. [ROUTE-01] Accidental root-level aliases /event and /overview return 404", async () => {
      const rootEventRes = await fetch(`${baseUrl}/event`, { method: "POST" });
      assert.strictEqual(rootEventRes.status, 404, "Accidental root /event must return 404");

      const rootOverviewRes = await fetch(`${baseUrl}/overview`);
      assert.strictEqual(rootOverviewRes.status, 404, "Accidental root /overview must return 404");
    });

    // =========================================================================
    //  SECTION 2: AUDIT-SEC-01 — SAFE INQUIRY IDEMPOTENCY & PRIVACY
    // =========================================================================

    const testProductId = new mongoose.Types.ObjectId();
    const mockProduct = {
      _id: testProductId,
      name: "GeForce RTX 5090 FE",
      sku: "NV-RTX5090-FE",
      sellingPrice: 49990000,
      stockQuantity: 10,
      reservedQuantity: 0,
      status: "published",
      fulfillmentMode: "stock",
      del_flag: 0,
    };

    const initialInquiryPayload = {
      productId: testProductId.toString(),
      quantity: 1,
      customer: {
        name: "Nguyen Van A",
        contactMethod: "nguyen.a@example.com",
        deliveryArea: "Quan 1, TP. Ho Chi Minh",
      },
      customerNote: "Please pack carefully in retail box",
      idempotencyKey: "test-idem-key-001",
    };

    let savedOrders = [];
    ShopOrder.prototype.save = async function () {
      // Check unique constraint on idempotencyKey
      if (this.idempotencyKey) {
        const dup = savedOrders.find((o) => o.idempotencyKey === this.idempotencyKey);
        if (dup) {
          const err = new Error("E11000 duplicate key error collection: shoporders index: idempotencyKey_1 dup key");
          err.code = 11000;
          throw err;
        }
      }
      savedOrders.push(this);
      return this;
    };

    ShopOrder.find = () => ({
      lean: async () => savedOrders,
    });

    ShopOrder.findOne = (filter) => {
      if (filter.idempotencyKey) {
        const found = savedOrders.find(
          (o) => o.idempotencyKey === filter.idempotencyKey && o.del_flag === 0
        );
        return {
          lean: async () => found ? JSON.parse(JSON.stringify(found)) : null,
        };
      }
      if (filter.orderReference) {
        const found = savedOrders.find((o) => o.orderReference === filter.orderReference);
        return found ? Promise.resolve(found) : Promise.resolve(null);
      }
      return {
        lean: async () => null,
      };
    };

    ShopProduct.findOne = () => mockProduct;
    ShopProduct.updateOne = async () => ({ modifiedCount: 1 });

    await test("4. [SEC-01] First inquiry request creates order with canonical payload hash", async () => {
      savedOrders = [];
      const res = await fetch(`${baseUrl}/shop/orders/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialInquiryPayload),
      });

      assert.strictEqual(res.status, 201, "First inquiry creation must succeed with 201 Created");
      const json = await res.json();
      assert.strictEqual(savedOrders.length, 1, "Exactly one order persisted in database");
      assert.ok(savedOrders[0].idempotencyPayloadHash, "Canonical payload hash must be stored");
      assert.strictEqual(json.data.orderReference, savedOrders[0].orderReference);
      assert.strictEqual(json.data.customer.name, "Nguyen Van A");
    });

    await test("5. [SEC-01] Identical retry returns 200 with matching reference and redacts customer PII", async () => {
      const res = await fetch(`${baseUrl}/shop/orders/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialInquiryPayload),
      });

      assert.strictEqual(res.status, 200, "Identical retry must succeed with 200");
      const json = await res.json();
      assert.strictEqual(savedOrders.length, 1, "Must NOT create a duplicate order");
      assert.strictEqual(json.data.orderReference, savedOrders[0].orderReference);
      assert.strictEqual(json.data.isIdempotentRetry, true);

      // Customer PII protection on retry
      assert.strictEqual(
        json.data.customer.name,
        "[Redacted for Privacy]",
        "Customer name must be redacted on retry response"
      );
      assert.ok(
        json.data.customer.contactMethod.includes("***"),
        "Customer contact method must be masked on retry response"
      );
      assert.strictEqual(json.data.customer.deliveryArea, null, "Delivery area must be omitted on retry");
      assert.strictEqual(json.data.customerNote, null, "Customer note must be omitted on retry");
    });

    await test("6. [SEC-01] Reused idempotency key with different payload returns 409 Conflict", async () => {
      const conflictingPayload = {
        ...initialInquiryPayload,
        quantity: 2, // Changed payload
      };

      const res = await fetch(`${baseUrl}/shop/orders/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conflictingPayload),
      });

      assert.strictEqual(res.status, 409, "Reused key with different payload must return 409 Conflict");
      const json = await res.json();
      assert.ok(json.message.includes("Idempotency key has already been used"));
    });

    await test("7. [SEC-01] Malformed or overly long idempotency keys are rejected with 400 Bad Request", async () => {
      const invalidKeyPayload = {
        ...initialInquiryPayload,
        idempotencyKey: "x".repeat(150), // Exceeds 128 chars
      };

      const res = await fetch(`${baseUrl}/shop/orders/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invalidKeyPayload),
      });

      assert.strictEqual(res.status, 400, "Oversized idempotency key must return 400");
    });

    // =========================================================================
    //  SECTION 3: AUDIT-SEC-02 — SEARCH REGEX SAFETY
    // =========================================================================

    await test("8. [SEC-02] Product search with unescaped regex metacharacters does not throw 500", async () => {
      ShopProduct.find = () => ({
        select: function () { return this; },
        populate: function () { return this; },
        sort: function () { return this; },
        skip: function () { return this; },
        limit: function () { return this; },
        lean: async () => [],
      });
      ShopProduct.countDocuments = async () => 0;

      // Unescaped brackets and parens that would crash new RegExp("[(a+", "i")
      const dangerousQueries = ["[(a+", "[a-z", "(test", "++", "*error*"];
      for (const q of dangerousQueries) {
        const res = await fetch(`${baseUrl}/shop/products?search=${encodeURIComponent(q)}`);
        assert.strictEqual(
          res.status,
          200,
          `Dangerous regex query '${q}' must return 200 and not crash with 500`
        );
      }
    });

    // =========================================================================
    //  SECTION 4: AUDIT-CONC-01 — CONCURRENCY-SAFE RESERVATION EXPIRATION
    // =========================================================================

    await test("9. [CONC-01] Concurrent workers cannot double-release the same expired reservation", async () => {
      let physicalInventoryReserved = 5;
      const expiredOrderId = new mongoose.Types.ObjectId();

      let orderRecord = {
        _id: expiredOrderId,
        orderReference: "ORD-CONC-TEST-01",
        status: "confirmed",
        inventoryReserved: true,
        reservationExpiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        items: [
          {
            product: testProductId,
            name: "RTX 5090",
            sku: "RTX5090",
            quantity: 2,
            fulfillmentMode: "stock",
          },
        ],
        statusHistory: [],
      };

      // Mock ShopOrder.find candidates query
      ShopOrder.find = () => ({
        lean: async () => [orderRecord],
      });

      // Atomic claim simulation: Only the first caller matching status="confirmed" succeeds
      ShopOrder.findOneAndUpdate = async (query, update) => {
        if (
          query._id.toString() === expiredOrderId.toString() &&
          query.status === "confirmed" &&
          query.inventoryReserved === true
        ) {
          if (orderRecord.status === "confirmed" && orderRecord.inventoryReserved === true) {
            const previous = JSON.parse(JSON.stringify(orderRecord));
            orderRecord.status = update.$set.status;
            orderRecord.inventoryReserved = update.$set.inventoryReserved;
            return previous;
          }
        }
        return null; // Atomic CAS failed for second worker
      };

      ShopProduct.findOneAndUpdate = async (query, update) => {
        if (query.reservedQuantity.$gte <= physicalInventoryReserved) {
          physicalInventoryReserved += update.$inc.reservedQuantity;
          return { reservedQuantity: physicalInventoryReserved, stockQuantity: 10 };
        }
        return null;
      };

      // Two expiration workers execute simultaneously
      const [res1, res2] = await Promise.all([
        shopOrderService.releaseExpiredReservations(),
        shopOrderService.releaseExpiredReservations(),
      ]);

      const totalReleased = res1.count + res2.count;
      assert.strictEqual(totalReleased, 1, "Exactly one worker must claim and release the reservation");
      assert.strictEqual(orderRecord.status, "cancelled", "Order must transition to cancelled");
      assert.strictEqual(orderRecord.inventoryReserved, false);
      assert.strictEqual(
        physicalInventoryReserved,
        3, // 5 - 2 = 3
        "Physical inventory must be decremented exactly once, never twice"
      );
    });

    await test("10. [CONC-01] Expiration racing with admin order completion preserves invariants", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const racingOrder = {
        _id: orderId,
        orderReference: "ORD-RACE-01",
        status: "cancelled", // Already claimed and cancelled by expiration worker
        inventoryReserved: false,
        statusHistory: [],
      };

      ShopOrder.findOne = () => ({
        session: function () { return this; },
        then: function (resolve) { return resolve(racingOrder); },
      });

      // Admin attempts to transition the cancelled order to completed
      let caughtError = null;
      try {
        await shopOrderService.updateOrderStatus(orderId, "completed", adminUser._id);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError, "Must reject transition from cancelled to completed");
      assert.strictEqual(caughtError.status, 400);
      assert.ok(caughtError.message.includes("Cannot transition order from 'cancelled' to 'completed'"));
    });

    await test("11. [CONC-01] Partial failure during multi-item release safely rolls back released items", async () => {
      let item1Reserved = 10;
      let item2Reserved = 5;

      const multiItemOrder = {
        _id: new mongoose.Types.ObjectId(),
        items: [
          { product: new mongoose.Types.ObjectId(), quantity: 3, fulfillmentMode: "stock" },
          { product: new mongoose.Types.ObjectId(), quantity: 4, fulfillmentMode: "stock" },
        ],
      };

      // Simulate item 1 succeeding, but item 2 crashing with a database error
      let attempt = 0;
      ShopProduct.findOneAndUpdate = async (query, update) => {
        attempt++;
        if (attempt === 1) {
          item1Reserved += update.$inc.reservedQuantity; // Decrements by 3
          return { stockQuantity: 20, reservedQuantity: item1Reserved };
        }
        throw new Error("Simulated database timeout on product 2");
      };

      // Mock updateOne for rollback
      ShopProduct.updateOne = async (query, update) => {
        if (update.$inc && update.$inc.reservedQuantity) {
          item1Reserved += update.$inc.reservedQuantity; // Re-increments by 3 on rollback
        }
        return { modifiedCount: 1 };
      };

      let releaseFailed = false;
      try {
        await shopOrderService._releaseOrderInventory(multiItemOrder, null);
      } catch (err) {
        releaseFailed = true;
      }

      assert.strictEqual(releaseFailed, true, "Multi-item release must throw when item 2 fails");
      assert.strictEqual(item1Reserved, 10, "Item 1 reserved inventory must be rolled back to original level (10)");
    });

    // =========================================================================
    //  SECTION 5: AUDIT-DATA-01 — SOFT-DELETE AND PARTIAL UNIQUE INDEXES
    // =========================================================================

    await test("12. [DATA-01] ShopProduct and ShopCategory schemas define partial unique indexes for del_flag: 0", async () => {
      const productIndexes = ShopProduct.schema.indexes();
      const categoryIndexes = ShopCategory.schema.indexes();

      // Verify partial unique index on product sku
      const skuIndex = productIndexes.find((idx) => idx[0].sku !== undefined);
      assert.ok(skuIndex, "Product schema must define an index on sku");
      assert.strictEqual(skuIndex[1].unique, true, "Product sku index must be unique");
      assert.deepStrictEqual(
        skuIndex[1].partialFilterExpression,
        { del_flag: 0 },
        "Product sku index must have partialFilterExpression: { del_flag: 0 }"
      );

      // Verify partial unique index on product slug
      const slugIndex = productIndexes.find((idx) => idx[0].slug !== undefined);
      assert.ok(slugIndex, "Product schema must define an index on slug");
      assert.strictEqual(slugIndex[1].unique, true, "Product slug index must be unique");
      assert.deepStrictEqual(
        slugIndex[1].partialFilterExpression,
        { del_flag: 0 },
        "Product slug index must have partialFilterExpression: { del_flag: 0 }"
      );

      // Verify partial unique index on category slug
      const catSlugIndex = categoryIndexes.find((idx) => idx[0].slug !== undefined);
      assert.ok(catSlugIndex, "Category schema must define an index on slug");
      assert.strictEqual(catSlugIndex[1].unique, true, "Category slug index must be unique");
      assert.deepStrictEqual(
        catSlugIndex[1].partialFilterExpression,
        { del_flag: 0 },
        "Category slug index must have partialFilterExpression: { del_flag: 0 }"
      );
    });

  } finally {
    restoreAll();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log("------------------------------------------------------------------");
  console.log(`  Sprint S6.2 HTTP Integration Tests: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
