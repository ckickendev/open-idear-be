require("ts-node/register");
const assert = require("assert");
const mongoose = require("mongoose");
const { shopOrderService, shopAnalyticsService } = require("../services");
const { ShopOrder, ShopProduct, ShopAnalyticsEvent, Post } = require("../models");
const { BadRequestException, NotFoundException, ConflictException } = require("../exceptions");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — S6.1 PRODUCTION VERIFICATION & CONCURRENCY TESTS");
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

  // Preserve originals
  const origOrderFindOne = ShopOrder.findOne;
  const origOrderFind = ShopOrder.find;
  const origOrderUpdateOne = ShopOrder.updateOne;
  const origProductFindOne = ShopProduct.findOne;
  const origProductFindOneAndUpdate = ShopProduct.findOneAndUpdate;
  const origProductUpdateOne = ShopProduct.updateOne;
  const origProductFind = ShopProduct.find;
  const origPostFindOne = Post.findOne;
  const origAnalyticsEventCreate = ShopAnalyticsEvent.create;

  function restoreAll() {
    ShopOrder.findOne = origOrderFindOne;
    ShopOrder.find = origOrderFind;
    ShopOrder.updateOne = origOrderUpdateOne;
    ShopProduct.findOne = origProductFindOne;
    ShopProduct.findOneAndUpdate = origProductFindOneAndUpdate;
    ShopProduct.updateOne = origProductUpdateOne;
    ShopProduct.find = origProductFind;
    Post.findOne = origPostFindOne;
    ShopAnalyticsEvent.create = origAnalyticsEventCreate;
  }

  function mockQuery(val) {
    return {
      select: function () {
        return this;
      },
      sort: function () {
        return this;
      },
      limit: function () {
        return this;
      },
      lean: async () => val,
      then: function (resolve, reject) {
        return Promise.resolve(val).then(resolve, reject);
      },
    };
  }

  try {
    // 1. Competing orders for the last available units
    await test("1. Competing orders for last available units: first succeeds, second rejected with Insufficient Stock", async () => {
      const prodId = new mongoose.Types.ObjectId();
      const orderAId = new mongoose.Types.ObjectId();
      const orderBId = new mongoose.Types.ObjectId();

      let stockQuantity = 3;
      let reservedQuantity = 2; // Only 1 available unit!

      ShopProduct.findOneAndUpdate = async (filter, update) => {
        const reqQty = update.$inc?.reservedQuantity || 0;
        const available = stockQuantity - reservedQuantity;
        if (available >= reqQty) {
          reservedQuantity += reqQty;
          return { _id: prodId, stockQuantity, reservedQuantity, availabilityStatus: "out_of_stock" };
        }
        return null;
      };

      ShopProduct.findOne = () => mockQuery({ _id: prodId, stockQuantity, reservedQuantity });
      ShopProduct.updateOne = async () => ({ acknowledged: true });

      const createMockOrder = (id, ref) => ({
        _id: id,
        orderReference: ref,
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [{ product: prodId, name: "Ryzen 9", sku: "CPU-R9", quantity: 1, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      });

      const orderA = createMockOrder(orderAId, "ORD-COMPETE-A");
      const orderB = createMockOrder(orderBId, "ORD-COMPETE-B");

      ShopOrder.findOne = async (filter) => {
        if (filter._id.toString() === orderAId.toString()) return orderA;
        if (filter._id.toString() === orderBId.toString()) return orderB;
        return null;
      };

      // Order A requests the last unit (1)
      const resA = await shopOrderService.updateOrderStatus(orderAId.toString(), "confirmed");
      assert.strictEqual(resA.status, "confirmed");
      assert.strictEqual(resA.inventoryReserved, true);
      assert.strictEqual(reservedQuantity, 3); // 3 reserved, 0 available

      // Order B requests 1 unit when available is now 0
      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(orderBId.toString(), "confirmed");
        },
        (err) => err instanceof BadRequestException && err.message.includes("Insufficient stock available")
      );

      assert.strictEqual(orderB.status, "awaiting_customer_confirmation", "Order B must remain unconfirmed");
      assert.strictEqual(orderB.inventoryReserved, false);
      assert.strictEqual(reservedQuantity, 3, "Reserved quantity must not exceed on-hand stock");
    });

    // 2. Multi-product reservation rollback on partial failure
    await test("2. Multi-product reservation rolls back successfully reserved item when subsequent item fails", async () => {
      const prod1Id = new mongoose.Types.ObjectId();
      const prod2Id = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      let prod1Reserved = 0;
      let prod2Reserved = 5; // prod 2 has 0 available

      ShopProduct.findOneAndUpdate = async (filter, update) => {
        if (filter._id.toString() === prod1Id.toString()) {
          prod1Reserved += update.$inc.reservedQuantity;
          return { _id: prod1Id, stockQuantity: 10, reservedQuantity: prod1Reserved };
        }
        if (filter._id.toString() === prod2Id.toString()) {
          // prod 2 has insufficient stock!
          return null;
        }
        return null;
      };

      let prod1RollbackExecuted = false;
      ShopProduct.updateOne = async (filter, update) => {
        if (filter._id.toString() === prod1Id.toString() && update.$inc?.reservedQuantity < 0) {
          prod1Reserved += update.$inc.reservedQuantity;
          prod1RollbackExecuted = true;
        }
        return { acknowledged: true };
      };

      ShopProduct.findOne = (filter) => mockQuery({ _id: filter._id, stockQuantity: 5, reservedQuantity: 5 });

      const multiItemOrder = {
        _id: orderId,
        orderReference: "ORD-MULTI-FAIL",
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [
          { product: prod1Id, name: "CPU Cooler", sku: "FAN-01", quantity: 2, fulfillmentMode: "stock" },
          { product: prod2Id, name: "Rare GPU", sku: "GPU-RARE", quantity: 1, fulfillmentMode: "stock" },
        ],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => multiItemOrder;

      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(orderId.toString(), "confirmed");
        },
        (err) => err instanceof BadRequestException && err.message.includes("Insufficient stock available")
      );

      assert.strictEqual(prod1RollbackExecuted, true, "Product 1 must be rolled back");
      assert.strictEqual(prod1Reserved, 0, "Product 1 reserved quantity must return to 0");
      assert.strictEqual(multiItemOrder.inventoryReserved, false);
      assert.strictEqual(multiItemOrder.status, "awaiting_customer_confirmation");
    });

    // 3. Confirmation racing with cancellation
    await test("3. Terminal cancellation locks order: confirmation rejected once cancelled", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const order = {
        _id: orderId,
        orderReference: "ORD-CANCEL-FIRST",
        status: "cancelled",
        inventoryReserved: false,
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 1, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => order;

      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(orderId.toString(), "confirmed");
        },
        (err) => err instanceof BadRequestException && err.message.includes("terminal state")
      );
    });

    // 4. Duplicate confirmation attempt is idempotent
    await test("4. Duplicate confirmation attempt is idempotent and does not double-reserve", async () => {
      const orderId = new mongoose.Types.ObjectId();
      let reserveCallCount = 0;

      ShopProduct.findOneAndUpdate = async () => {
        reserveCallCount++;
        return { stockQuantity: 10, reservedQuantity: 1 };
      };

      const order = {
        _id: orderId,
        orderReference: "ORD-CONFIRM-ONCE",
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 1, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => order;

      // First confirmation
      await shopOrderService.updateOrderStatus(orderId.toString(), "confirmed");
      assert.strictEqual(order.status, "confirmed");
      assert.strictEqual(order.inventoryReserved, true);
      assert.strictEqual(reserveCallCount, 1);

      // Second confirmation (duplicate call)
      const res2 = await shopOrderService.updateOrderStatus(orderId.toString(), "confirmed");
      assert.strictEqual(res2.status, "confirmed");
      assert.strictEqual(reserveCallCount, 1, "Must NOT reserve inventory a second time");
    });

    // 5. Inventory reconciliation detects orphan reservations
    await test("5. reconcileInventory correctly flags healthy inventory and pinpoints orphan discrepancies", async () => {
      const prodAId = new mongoose.Types.ObjectId();
      const prodBId = new mongoose.Types.ObjectId();

      ShopOrder.find = () => mockQuery([
        {
          orderReference: "ORD-CONF-1",
          status: "confirmed",
          inventoryReserved: true,
          items: [{ product: prodAId, quantity: 2, fulfillmentMode: "stock" }],
        },
      ]);

      ShopProduct.find = () => mockQuery([
        { _id: prodAId, name: "Product A", sku: "SKU-A", fulfillmentMode: "stock", reservedQuantity: 2 },
        { _id: prodBId, name: "Product B", sku: "SKU-B", fulfillmentMode: "stock", reservedQuantity: 1 }, // Discrepancy! No confirmed order
      ]);

      const report = await shopOrderService.reconcileInventory();
      assert.strictEqual(report.healthy, false);
      assert.strictEqual(report.discrepancies.length, 1);
      assert.strictEqual(report.discrepancies[0].sku, "SKU-B");
      assert.strictEqual(report.discrepancies[0].expectedReserved, 0);
      assert.strictEqual(report.discrepancies[0].actualReserved, 1);
      assert.strictEqual(report.discrepancies[0].discrepancy, 1);
    });

    // 6. Attribution validation rejects fake article slugs
    await test("6. Attribution pipeline validates article references and strips fake slugs", async () => {
      const prodId = new mongoose.Types.ObjectId();
      ShopProduct.findOne = () => mockQuery({
        _id: prodId,
        name: "Test Product",
        sku: "TEST-SKU",
        sellingPrice: 1000000,
        fulfillmentMode: "stock",
        availabilityStatus: "in_stock",
        status: "published",
      });
      ShopProduct.updateOne = async () => ({ acknowledged: true });
      ShopOrder.findOne = () => mockQuery(null);

      // Post.findOne returns null for fake slug
      Post.findOne = () => mockQuery(null);

      let savedDoc = null;
      ShopOrder.prototype.save = async function () {
        savedDoc = this;
        return this;
      };

      const result = await shopOrderService.createInquiry({
        productId: prodId.toString(),
        quantity: 1,
        customer: { name: "Attribution Tester", contactMethod: "test@domain.com" },
        attribution: {
          articleSlug: "fake-unregistered-article-slug",
          embedId: "emb-fake",
          source: "article_embed",
        },
      });

      assert.ok(result.orderReference);
      assert.strictEqual(savedDoc.attribution, undefined, "Attribution with fake article must be rejected");
    });
  } finally {
    restoreAll();
  }

  console.log("==================================================================");
  if (failed === 0) {
    console.log(`  ALL S6.1 VERIFICATION & CONCURRENCY TESTS PASSED (${passed}/${passed})`);
  } else {
    console.log(`  TESTS COMPLETED WITH FAILURES: ${passed} passed, ${failed} failed`);
  }
  console.log("==================================================================\n");

  if (failed > 0) process.exit(1);
}

runTests();
