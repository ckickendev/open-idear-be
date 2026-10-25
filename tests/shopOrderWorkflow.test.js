require("ts-node/register");
const assert = require("assert");
const mongoose = require("mongoose");
const { shopOrderService } = require("../services");
const { ShopOrder, ShopProduct } = require("../models");
const { NotFoundException, BadRequestException, ConflictException } = require("../exceptions");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — SPRINT S3: ORDER & INQUIRY WORKFLOW TESTS");
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
  const originalProductFindOne = ShopProduct.findOne;
  const originalProductUpdateOne = ShopProduct.updateOne;
  const originalOrderFindOne = ShopOrder.findOne;
  const originalOrderFind = ShopOrder.find;
  const originalOrderCount = ShopOrder.countDocuments;
  const originalOrderSave = ShopOrder.prototype.save;

  function restoreAll() {
    ShopProduct.findOne = originalProductFindOne;
    ShopProduct.updateOne = originalProductUpdateOne;
    ShopOrder.findOne = originalOrderFindOne;
    ShopOrder.find = originalOrderFind;
    ShopOrder.countDocuments = originalOrderCount;
    ShopOrder.prototype.save = originalOrderSave;
  }

  function mockQuery(val) {
    return {
      lean: async () => val,
      populate: function () {
        return this;
      },
      then: function (resolve, reject) {
        return Promise.resolve(val).then(resolve, reject);
      },
    };
  }

  try {
    await test("1. Valid inquiry creates order snapshot with backend-derived prices and subtotal", async () => {
      const prodId = new mongoose.Types.ObjectId();
      const mockProduct = {
        _id: prodId,
        name: "AMD Ryzen 7 7800X3D",
        sku: "CPU-AMD-7800X3D",
        sellingPrice: 10890000,
        stockQuantity: 10,
        fulfillmentMode: "stock",
        availabilityStatus: "in_stock",
        status: "published",
        images: [{ url: "https://example.com/7800x3d.webp", isPrimary: true }],
      };

      ShopProduct.findOne = async () => mockProduct;
      ShopProduct.updateOne = async () => ({ acknowledged: true });
      ShopOrder.findOne = () => mockQuery(null); // No duplicate or reference collision

      let savedDoc = null;
      ShopOrder.prototype.save = async function () {
        savedDoc = this;
        return this;
      };

      // Client attempts to pass a tampered price of 1000 VND
      const result = await shopOrderService.createInquiry({
        productId: prodId.toString(),
        quantity: 2,
        sellingPrice: 1000, // Tampered client price (must be ignored)
        customer: {
          name: "Tran Van B",
          contactMethod: "tranvanb@example.com",
          deliveryArea: "Quan 1, TP. Ho Chi Minh",
        },
        customerNote: "Please call before dispatching",
      });

      assert(result.orderReference.startsWith("ORD-"), "Reference must follow ORD-YYYYMMDD-XXXX format");
      assert.strictEqual(result.status, "inquiry_received");
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.items[0].unitPrice, 10890000, "Must use authoritative DB price, not tampered input");
      assert.strictEqual(result.items[0].quantity, 2);
      assert.strictEqual(result.subtotal, 21780000, "Subtotal must equal unitPrice * quantity");
      assert.strictEqual(result.currency, "VND");
      assert(result.notices.length >= 2, "Customer confirmation must include non-reservation notices");

      // Verify no PII leakage of internal fields in customer response
      assert.strictEqual(result.adminNote, undefined, "adminNote must not leak to customer");
      assert.strictEqual(result.statusHistory, undefined, "statusHistory must not leak to customer");
    });

    await test("2. Inquiry creation does NOT deduct physical stock or claim reservation", async () => {
      const prodId = new mongoose.Types.ObjectId();
      const initialStock = 5;
      const mockProduct = {
        _id: prodId,
        name: "Kingston Fury Beast 32GB DDR5",
        sku: "RAM-KF-32GB",
        sellingPrice: 2800000,
        stockQuantity: initialStock,
        fulfillmentMode: "stock",
        availabilityStatus: "in_stock",
        status: "published",
        images: [],
      };

      let stockDeducted = false;
      ShopProduct.findOne = async () => mockProduct;
      ShopProduct.updateOne = async (filter, update) => {
        if (update.$inc && update.$inc.stockQuantity) {
          stockDeducted = true;
        }
        return { acknowledged: true };
      };
      ShopOrder.findOne = () => mockQuery(null);
      ShopOrder.prototype.save = async function () {
        return this;
      };

      await shopOrderService.createInquiry({
        productId: prodId.toString(),
        quantity: 3,
        customer: {
          name: "Le Thi C",
          contactMethod: "0908123456",
        },
      });

      assert.strictEqual(stockDeducted, false, "Stock must NOT be deducted upon inquiry submission");
      assert.strictEqual(mockProduct.stockQuantity, 5, "Product physical stock count must remain unchanged");
    });

    await test("3. Invalid quantities (< 1, > 50, non-integer) are strictly rejected", async () => {
      const prodId = new mongoose.Types.ObjectId();
      ShopProduct.findOne = async () => ({
        _id: prodId,
        name: "Test Item",
        status: "published",
        sellingPrice: 100000,
      });

      // Quantity = 0
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: prodId.toString(),
            quantity: 0,
            customer: { name: "Test User", contactMethod: "test@example.com" },
          });
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );

      // Quantity = -5
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: prodId.toString(),
            quantity: -5,
            customer: { name: "Test User", contactMethod: "test@example.com" },
          });
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );

      // Quantity = 51 (exceeds max 50)
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: prodId.toString(),
            quantity: 51,
            customer: { name: "Test User", contactMethod: "test@example.com" },
          });
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );

      // Quantity = 1.5 (non-integer)
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: prodId.toString(),
            quantity: 1.5,
            customer: { name: "Test User", contactMethod: "test@example.com" },
          });
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );
    });

    await test("4. Invalid contact methods (non-email, non-phone) and empty names are rejected", async () => {
      const prodId = new mongoose.Types.ObjectId();
      ShopProduct.findOne = async () => ({
        _id: prodId,
        name: "Test Item",
        status: "published",
        sellingPrice: 100000,
      });

      // Empty name
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: prodId.toString(),
            quantity: 1,
            customer: { name: " ", contactMethod: "valid@email.com" },
          });
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );

      // Invalid contact method (gibberish string)
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: prodId.toString(),
            quantity: 1,
            customer: { name: "Valid Name", contactMethod: "not-an-email-or-phone" },
          });
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );
    });

    await test("5. Missing, draft, archived, or discontinued products reject inquiry creation", async () => {
      ShopOrder.findOne = () => mockQuery(null);

      // 1. Non-existent product
      ShopProduct.findOne = async () => null;
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: new mongoose.Types.ObjectId().toString(),
            quantity: 1,
            customer: { name: "Buyer", contactMethod: "buyer@test.com" },
          });
        },
        (err) => err instanceof NotFoundException && err.status === 404
      );

      // 2. Draft product
      ShopProduct.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        name: "Draft GPU",
        status: "draft",
        sellingPrice: 15000000,
      });
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: new mongoose.Types.ObjectId().toString(),
            quantity: 1,
            customer: { name: "Buyer", contactMethod: "buyer@test.com" },
          });
        },
        (err) => err instanceof NotFoundException && err.status === 404
      );

      // 3. Discontinued product
      ShopProduct.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        name: "Legacy Floppy Drive",
        status: "published",
        availabilityStatus: "discontinued",
        sellingPrice: 200000,
      });
      await assert.rejects(
        async () => {
          await shopOrderService.createInquiry({
            productId: new mongoose.Types.ObjectId().toString(),
            quantity: 1,
            customer: { name: "Buyer", contactMethod: "buyer@test.com" },
          });
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );
    });

    await test("6. Supplier-order products snapshot fulfillmentMode accurately", async () => {
      const prodId = new mongoose.Types.ObjectId();
      ShopProduct.findOne = async () => ({
        _id: prodId,
        name: "Custom Liquid Cooling Loop",
        sku: "COOL-WATER-01",
        sellingPrice: 45000000,
        fulfillmentMode: "supplier_order",
        availabilityStatus: "available_on_order",
        status: "published",
        images: [],
      });
      ShopOrder.findOne = () => mockQuery(null);
      ShopOrder.prototype.save = async function () {
        return this;
      };

      const result = await shopOrderService.createInquiry({
        productId: prodId.toString(),
        quantity: 1,
        customer: { name: "Enthusiast", contactMethod: "custompc@test.com" },
      });

      assert.strictEqual(result.items[0].fulfillmentMode, "supplier_order");
    });

    await test("7. Idempotency key and duplicate-window protection prevent duplicate orders", async () => {
      const prodId = new mongoose.Types.ObjectId();
      const existingOrder = {
        orderReference: "ORD-20261024-EXISTING",
        status: "inquiry_received",
        createdAt: new Date(),
        customer: { name: "Repeat Buyer", contactMethod: "repeat@test.com" },
        items: [
          {
            name: "RTX 4090",
            sku: "GPU-4090",
            unitPrice: 48000000,
            quantity: 1,
            fulfillmentMode: "stock",
          },
        ],
        subtotal: 48000000,
        currency: "VND",
      };

      ShopOrder.findOne = (query) => {
        if (query && query.idempotencyKey === "idempotent-key-123") {
          return mockQuery(existingOrder);
        }
        return mockQuery(null);
      };

      const result = await shopOrderService.createInquiry({
        productId: prodId.toString(),
        quantity: 1,
        idempotencyKey: "idempotent-key-123",
        customer: { name: "Repeat Buyer", contactMethod: "repeat@test.com" },
      });

      assert.strictEqual(result.orderReference, "ORD-20261024-EXISTING");
    });

    await test("8. Order status lifecycle strictly enforces valid transitions and rejects invalid ones", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const mockOrder = {
        _id: orderId,
        status: "inquiry_received",
        statusHistory: [],
        save: async function () {
          return this;
        },
      };

      ShopOrder.findOne = () => mockQuery(mockOrder);

      // inquiry_received -> contacted (VALID)
      await shopOrderService.updateOrderStatus(orderId.toString(), "contacted", null, "Called customer");
      assert.strictEqual(mockOrder.status, "contacted");
      assert.strictEqual(mockOrder.statusHistory.length, 1);

      // contacted -> confirmed (INVALID: must go through awaiting_customer_confirmation or cancelled)
      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(orderId.toString(), "confirmed", null);
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );

      // contacted -> awaiting_customer_confirmation (VALID)
      await shopOrderService.updateOrderStatus(orderId.toString(), "awaiting_customer_confirmation");
      assert.strictEqual(mockOrder.status, "awaiting_customer_confirmation");

      // awaiting_customer_confirmation -> confirmed (VALID)
      await shopOrderService.updateOrderStatus(orderId.toString(), "confirmed");
      assert.strictEqual(mockOrder.status, "confirmed");

      // confirmed -> completed (VALID)
      await shopOrderService.updateOrderStatus(orderId.toString(), "completed");
      assert.strictEqual(mockOrder.status, "completed");

      // completed -> cancelled (INVALID: completed is a terminal state)
      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(orderId.toString(), "cancelled");
        },
        (err) => err instanceof BadRequestException && err.status === 400
      );
    });

    await test("9. Admin note update persists without touching customer notes", async () => {
      const orderId = new mongoose.Types.ObjectId();
      const mockOrder = {
        _id: orderId,
        customerNote: "Customer wants receipt",
        adminNote: "",
        save: async function () {
          return this;
        },
      };

      ShopOrder.findOne = () => mockQuery(mockOrder);

      await shopOrderService.updateAdminNote(orderId.toString(), "Verified distributor stock for lead time 3 days");
      assert.strictEqual(mockOrder.adminNote, "Verified distributor stock for lead time 3 days");
      assert.strictEqual(mockOrder.customerNote, "Customer wants receipt", "Customer note must remain intact");
    });
  } finally {
    restoreAll();
  }

  console.log("------------------------------------------------------------------");
  console.log(`  Shop Order Workflow Tests: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
