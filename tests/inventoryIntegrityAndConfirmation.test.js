require("ts-node/register");
const assert = require("assert");
const mongoose = require("mongoose");
const { shopOrderService } = require("../services");
const { ShopOrder, ShopProduct } = require("../models");
const { BadRequestException, NotFoundException } = require("../exceptions");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — SPRINT S4: INVENTORY INTEGRITY & CONFIRMATION");
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
  const originalProductFindOneAndUpdate = ShopProduct.findOneAndUpdate;
  const originalProductUpdateOne = ShopProduct.updateOne;
  const originalOrderFindOne = ShopOrder.findOne;
  const originalOrderFind = ShopOrder.find;
  const originalOrderSave = ShopOrder.prototype.save;

  function restoreAll() {
    ShopProduct.findOne = originalProductFindOne;
    ShopProduct.findOneAndUpdate = originalProductFindOneAndUpdate;
    ShopProduct.updateOne = originalProductUpdateOne;
    ShopOrder.findOne = originalOrderFindOne;
    ShopOrder.find = originalOrderFind;
    ShopOrder.prototype.save = originalOrderSave;
  }

  try {
    // 1. Invariant: Available = OnHand - Reserved
    await test("1. Inventory invariant (availableQuantity = onHand - reserved) is preserved", async () => {
      const prod = new ShopProduct({
        name: "Kingston Fury Renegade 32GB",
        sku: "RAM-KF-32G-6000",
        category: new mongoose.Types.ObjectId(),
        sellingPrice: 3290000,
        stockQuantity: 10,
        reservedQuantity: 3,
        fulfillmentMode: "stock",
        status: "published",
      });

      assert.strictEqual(prod.stockQuantity, 10);
      assert.strictEqual(prod.reservedQuantity, 3);
      assert.strictEqual(prod.availableQuantity, 7, "Available must be 10 - 3 = 7");

      // Reserved cannot exceed on-hand
      prod.reservedQuantity = 11;
      let validateError = null;
      try {
        await prod.validate();
      } catch (err) {
        validateError = err;
      }
      assert(validateError, "Must fail validation when reservedQuantity > stockQuantity");
    });

    // 2. Insufficient stock rejects confirmation
    await test("2. Insufficient inventory rejects confirmation and preserves existing state", async () => {
      const prodId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      const mockOrder = {
        _id: orderId,
        orderReference: "ORD-20261024-TEST1",
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [
          {
            product: prodId,
            name: "RTX 4080 Super",
            sku: "GPU-NV-4080S",
            unitPrice: 28000000,
            quantity: 5, // Requires 5 units
            fulfillmentMode: "stock",
          },
        ],
        statusHistory: [],
        save: async function () {
          return this;
        },
      };

      ShopOrder.findOne = async () => mockOrder;
      // Database has only 2 units available (stock 5, reserved 3)
      ShopProduct.findOneAndUpdate = async () => null; // Condition fails
      ShopProduct.findOne = () => ({
        lean: async () => ({
          _id: prodId,
          stockQuantity: 5,
          reservedQuantity: 3,
        }),
      });

      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(orderId.toString(), "confirmed");
        },
        (err) => {
          assert(err instanceof BadRequestException);
          assert(err.message.includes("Insufficient stock available"));
          return true;
        }
      );

      assert.strictEqual(mockOrder.inventoryReserved, false);
      assert.strictEqual(mockOrder.status, "awaiting_customer_confirmation");
    });

    // 3. Concurrent confirmations competing for the same stock
    await test("3. Concurrent confirmations competing for stock: first succeeds, second rejected", async () => {
      const prodId = new mongoose.Types.ObjectId();
      let dbStock = 4;
      let dbReserved = 0;

      // Simulated atomic findOneAndUpdate using MongoDB conditional evaluation
      ShopProduct.findOneAndUpdate = async (filter, update) => {
        const requiredQty = update.$inc?.reservedQuantity || 0;
        const available = dbStock - dbReserved;
        if (available >= requiredQty) {
          dbReserved += requiredQty;
          return {
            _id: prodId,
            stockQuantity: dbStock,
            reservedQuantity: dbReserved,
            availabilityStatus: dbStock - dbReserved > 0 ? "in_stock" : "out_of_stock",
          };
        }
        return null; // Concurrency conflict: condition not satisfied
      };

      ShopProduct.findOne = () => ({
        lean: async () => ({
          _id: prodId,
          stockQuantity: dbStock,
          reservedQuantity: dbReserved,
        }),
      });
      ShopProduct.updateOne = async () => ({ acknowledged: true });

      const order1 = {
        _id: new mongoose.Types.ObjectId(),
        orderReference: "ORD-CONCUR-1",
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [{ product: prodId, name: "Ryzen 9 7950X", sku: "CPU-7950X", quantity: 3, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      const order2 = {
        _id: new mongoose.Types.ObjectId(),
        orderReference: "ORD-CONCUR-2",
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [{ product: prodId, name: "Ryzen 9 7950X", sku: "CPU-7950X", quantity: 3, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      // Order 1 arrives and requests 3 of 4 available
      ShopOrder.findOne = async (q) => (q._id.toString() === order1._id.toString() ? order1 : order2);
      const res1 = await shopOrderService.updateOrderStatus(order1._id.toString(), "confirmed");
      assert.strictEqual(res1.status, "confirmed");
      assert.strictEqual(order1.inventoryReserved, true);
      assert.strictEqual(dbReserved, 3);

      // Order 2 arrives concurrently and requests 3, but only 1 remains available
      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(order2._id.toString(), "confirmed");
        },
        (err) => {
          assert(err instanceof BadRequestException);
          assert(err.message.includes("Insufficient stock"));
          return true;
        }
      );

      assert.strictEqual(order2.inventoryReserved, false);
      assert.strictEqual(order2.status, "awaiting_customer_confirmation");
      assert.strictEqual(dbReserved, 3, "Database reserved count remains intact");
    });

    // 4. Duplicate confirmation attempt is idempotent
    await test("4. Duplicate confirmation attempt is idempotent and does not double-reserve", async () => {
      let reservedCalls = 0;
      ShopProduct.findOneAndUpdate = async () => {
        reservedCalls++;
        return { stockQuantity: 10, reservedQuantity: 2 };
      };

      const order = {
        _id: new mongoose.Types.ObjectId(),
        status: "confirmed",
        inventoryReserved: true,
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 2, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => order;

      const result = await shopOrderService.updateOrderStatus(order._id.toString(), "confirmed");
      assert.strictEqual(result.status, "confirmed");
      assert.strictEqual(reservedCalls, 0, "Must not execute reservation query for already confirmed order");
    });

    // 5. Multi-item partial failure triggers atomic compensation rollback
    await test("5. Multi-item order: failure on second item atomically rolls back first item", async () => {
      const prodA = new mongoose.Types.ObjectId();
      const prodB = new mongoose.Types.ObjectId();
      let prodAReserved = 0;
      let rollbackCalled = false;

      ShopProduct.findOneAndUpdate = async (filter, update) => {
        if (filter._id.toString() === prodA.toString()) {
          prodAReserved += update.$inc.reservedQuantity;
          return { stockQuantity: 10, reservedQuantity: prodAReserved, availabilityStatus: "in_stock" };
        }
        // Prod B fails!
        return null;
      };

      ShopProduct.findOne = () => ({
        lean: async () => ({ stockQuantity: 2, reservedQuantity: 2 }),
      });

      ShopProduct.updateOne = async (filter, update) => {
        if (filter._id.toString() === prodA.toString() && update.$inc?.reservedQuantity < 0) {
          prodAReserved += update.$inc.reservedQuantity;
          rollbackCalled = true;
        }
        return { acknowledged: true };
      };

      const multiOrder = {
        _id: new mongoose.Types.ObjectId(),
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [
          { product: prodA, name: "Product A", sku: "SKU-A", quantity: 2, fulfillmentMode: "stock" },
          { product: prodB, name: "Product B", sku: "SKU-B", quantity: 5, fulfillmentMode: "stock" },
        ],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => multiOrder;

      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(multiOrder._id.toString(), "confirmed");
        },
        BadRequestException
      );

      assert.strictEqual(rollbackCalled, true, "Rollback must be triggered for product A");
      assert.strictEqual(prodAReserved, 0, "Product A reserved count must be restored to 0");
      assert.strictEqual(multiOrder.inventoryReserved, false);
    });

    // 6. Valid cancellation releases reserved stock
    await test("6. Valid cancellation releases reserved stock and resets reservation flag", async () => {
      let releasedQuantity = 0;
      ShopProduct.findOneAndUpdate = async (filter, update) => {
        releasedQuantity += Math.abs(update.$inc.reservedQuantity);
        return { stockQuantity: 10, reservedQuantity: 0, availabilityStatus: "in_stock" };
      };
      ShopProduct.updateOne = async () => ({ acknowledged: true });

      const confirmedOrder = {
        _id: new mongoose.Types.ObjectId(),
        status: "confirmed",
        inventoryReserved: true,
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 4, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => confirmedOrder;

      const cancelledOrder = await shopOrderService.updateOrderStatus(confirmedOrder._id.toString(), "cancelled");
      assert.strictEqual(cancelledOrder.status, "cancelled");
      assert.strictEqual(cancelledOrder.inventoryReserved, false);
      assert.strictEqual(releasedQuantity, 4, "Must release exact reserved quantity");
    });

    // 7. Repeated cancellation blocked by terminal status
    await test("7. Repeated cancellation is rejected by terminal lifecycle lock", async () => {
      const cancelledOrder = {
        _id: new mongoose.Types.ObjectId(),
        status: "cancelled",
        inventoryReserved: false,
        statusHistory: [],
      };

      ShopOrder.findOne = async () => cancelledOrder;

      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(cancelledOrder._id.toString(), "confirmed");
        },
        (err) => {
          assert(err instanceof BadRequestException);
          assert(err.message.includes("terminal state"));
          return true;
        }
      );
    });

    // 8. Supplier order without verification cannot be confirmed
    await test("8. Supplier-order product without verification blocks order confirmation", async () => {
      const supplierOrder = {
        _id: new mongoose.Types.ObjectId(),
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: "Custom Liquid Cooling Loop",
            sku: "COOL-CUSTOM-01",
            quantity: 1,
            fulfillmentMode: "supplier_order",
            supplierVerification: { verified: false },
          },
        ],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => supplierOrder;

      await assert.rejects(
        async () => {
          await shopOrderService.updateOrderStatus(supplierOrder._id.toString(), "confirmed");
        },
        (err) => {
          assert(err instanceof BadRequestException);
          assert(err.message.includes("Supplier-order item"));
          assert(err.message.includes("requires verified supplier availability"));
          return true;
        }
      );
    });

    // 9. Supplier verification records lead time and enables confirmation without stock reservation
    await test("9. Supplier verification enables confirmation without reserving physical stock", async () => {
      let stockReserveAttempted = false;
      ShopProduct.findOneAndUpdate = async () => {
        stockReserveAttempted = true;
        return null;
      };

      const supplierOrder = {
        _id: new mongoose.Types.ObjectId(),
        status: "awaiting_customer_confirmation",
        inventoryReserved: false,
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            name: "Enterprise Server Motherboard",
            sku: "MB-SRV-EPYC",
            quantity: 2,
            fulfillmentMode: "supplier_order",
            supplierVerification: { verified: false },
          },
        ],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => supplierOrder;

      // 1. Verify supplier item
      const verified = await shopOrderService.verifySupplierItem(
        supplierOrder._id.toString(),
        0,
        {
          verified: true,
          confirmedLeadTimeDays: 5,
          supplierCostPrice: 12000000,
          notes: "Confirmed with distributor distributor_vn",
        },
        new mongoose.Types.ObjectId()
      );

      assert.strictEqual(verified.items[0].supplierVerification.verified, true);
      assert.strictEqual(verified.items[0].supplierVerification.confirmedLeadTimeDays, 5);

      // 2. Now confirm order
      const confirmed = await shopOrderService.updateOrderStatus(supplierOrder._id.toString(), "confirmed");
      assert.strictEqual(confirmed.status, "confirmed");
      assert.strictEqual(stockReserveAttempted, false, "Supplier order must not attempt physical stock reservation");
    });

    // 10. Order completion fulfills inventory by decrementing both on-hand and reserved
    await test("10. Transition to completed decrements both stockQuantity and reservedQuantity", async () => {
      let fulfilledOnHand = 0;
      let fulfilledReserved = 0;

      ShopProduct.updateOne = async (filter, update) => {
        fulfilledOnHand += Math.abs(update.$inc.stockQuantity);
        fulfilledReserved += Math.abs(update.$inc.reservedQuantity);
        return { acknowledged: true };
      };

      const confirmedOrder = {
        _id: new mongoose.Types.ObjectId(),
        status: "confirmed",
        inventoryReserved: true,
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 3, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.findOne = async () => confirmedOrder;

      const completed = await shopOrderService.updateOrderStatus(confirmedOrder._id.toString(), "completed");
      assert.strictEqual(completed.status, "completed");
      assert.strictEqual(completed.inventoryFulfilled, true);
      assert.strictEqual(completed.inventoryReserved, false);
      assert.strictEqual(fulfilledOnHand, 3, "On-hand stock must be decremented by 3");
      assert.strictEqual(fulfilledReserved, 3, "Reserved quantity must be decremented by 3");
    });

    // 11. Expiration scanner releases expired reservations
    await test("11. Expiration scanner identifies and cancels expired reservations idempotently", async () => {
      let releasedCount = 0;
      ShopProduct.findOneAndUpdate = async () => {
        releasedCount++;
        return { stockQuantity: 5, reservedQuantity: 0 };
      };

      const expiredOrder = {
        _id: new mongoose.Types.ObjectId(),
        orderReference: "ORD-EXPIRED-99",
        status: "confirmed",
        inventoryReserved: true,
        reservationExpiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
        items: [{ product: new mongoose.Types.ObjectId(), quantity: 1, fulfillmentMode: "stock" }],
        statusHistory: [],
        save: async function () { return this; },
      };

      ShopOrder.find = async () => [expiredOrder];

      const result = await shopOrderService.releaseExpiredReservations();
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.releasedOrderReferences[0], "ORD-EXPIRED-99");
      assert.strictEqual(expiredOrder.status, "cancelled");
      assert.strictEqual(expiredOrder.inventoryReserved, false);
      assert.strictEqual(releasedCount, 1);
    });

  } finally {
    restoreAll();
  }

  console.log("------------------------------------------------------------------");
  console.log(`  Sprint S4 Inventory Integrity Tests: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered fatal error:", err);
  process.exit(1);
});
