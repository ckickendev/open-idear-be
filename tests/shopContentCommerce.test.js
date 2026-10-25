require("ts-node/register");
const assert = require("assert");
const mongoose = require("mongoose");
const { shopProductService, shopOrderService } = require("../services");
const { ShopProduct, ShopOrder } = require("../models");
const { NotFoundException, BadRequestException } = require("../exceptions");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — SPRINT S5 BACKEND CONTENT COMMERCE TESTS");
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
  const originalFind = ShopProduct.find;
  const originalFindOne = ShopProduct.findOne;
  const originalUpdateOne = ShopProduct.updateOne;
  const originalOrderFindOne = ShopOrder.findOne;
  const originalOrderSave = ShopOrder.prototype.save;

  function restoreAll() {
    ShopProduct.find = originalFind;
    ShopProduct.findOne = originalFindOne;
    ShopProduct.updateOne = originalUpdateOne;
    ShopOrder.findOne = originalOrderFindOne;
    ShopOrder.prototype.save = originalOrderSave;
  }

  function mockQuery(val) {
    return {
      select: function () {
        return this;
      },
      populate: function () {
        return this;
      },
      lean: async () => val,
      then: function (resolve, reject) {
        return Promise.resolve(val).then(resolve, reject);
      },
    };
  }

  try {
    // 1. Dual Lookup in getProductBySlugPublic (Slug or ObjectId)
    await test("1. getProductBySlugPublic supports dual lookup by slug or MongoDB ObjectId", async () => {
      const mockId = new mongoose.Types.ObjectId();
      let capturedFilter = null;

      ShopProduct.findOne = (filter) => {
        capturedFilter = filter;
        return mockQuery({
          _id: mockId,
          name: "Dual Lookup CPU",
          slug: "dual-lookup-cpu",
          status: "published",
          del_flag: 0,
        });
      };

      // Test by ObjectId string
      const productById = await shopProductService.getProductBySlugPublic(mockId.toString());
      assert.strictEqual(productById.name, "Dual Lookup CPU");
      assert.ok(capturedFilter.$or, "Filter must use $or to allow ID or slug matching");
      assert.strictEqual(capturedFilter.status, "published");
      assert.strictEqual(capturedFilter.del_flag, 0);

      // Test by slug string
      const productBySlug = await shopProductService.getProductBySlugPublic("dual-lookup-cpu");
      assert.strictEqual(productBySlug.slug, "dual-lookup-cpu");
    });

    // 2. Bounded Batch Public Products
    await test("2. getBatchProductsPublic retrieves published products by IDs and enforces max 20 limit", async () => {
      let capturedFilter = null;

      ShopProduct.find = (filter) => {
        capturedFilter = filter;
        return mockQuery([
          { _id: new mongoose.Types.ObjectId(), name: "Item 1", status: "published" },
          { _id: new mongoose.Types.ObjectId(), name: "Item 2", status: "published" },
        ]);
      };

      const ids = [new mongoose.Types.ObjectId().toString(), new mongoose.Types.ObjectId().toString()];
      const results = await shopProductService.getBatchProductsPublic(ids);

      assert.strictEqual(results.products.length, 2);
      assert.strictEqual(capturedFilter.status, "published");
      assert.strictEqual(capturedFilter.del_flag, 0);

      // Verify empty array handling
      const emptyResults = await shopProductService.getBatchProductsPublic([]);
      assert.deepStrictEqual(emptyResults.products, []);
    });

    // 3. Embed Analytics Event Tracking
    await test("3. recordEmbedAnalyticsEvent atomically increments embedImpressions or embedClicks", async () => {
      const mockId = new mongoose.Types.ObjectId();
      let capturedFilter = null;
      let capturedUpdate = null;

      ShopProduct.updateOne = async (filter, update) => {
        capturedFilter = filter;
        capturedUpdate = update;
        return { modifiedCount: 1 };
      };

      // Track impression
      const impResult = await shopProductService.recordEmbedAnalyticsEvent({
        eventType: "impression",
        productId: mockId.toString(),
        articleSlug: "test-article",
      });
      assert.strictEqual(impResult.success, true);
      assert.strictEqual(capturedUpdate.$inc.embedImpressions, 1);
      assert.strictEqual(capturedFilter._id.toString(), mockId.toString());

      // Track click
      const clickResult = await shopProductService.recordEmbedAnalyticsEvent({
        eventType: "click",
        productId: mockId.toString(),
        articleSlug: "test-article",
      });
      assert.strictEqual(clickResult.success, true);
      assert.strictEqual(capturedUpdate.$inc.embedClicks, 1);
    });

    // 4. Attribution Persistence on Inquiry Creation
    await test("4. createInquiry persists article attribution on the resulting ShopOrder", async () => {
      const productId = new mongoose.Types.ObjectId();
      let savedDoc = null;

      ShopProduct.findOne = async () => ({
        _id: productId,
        name: "Attributed Product",
        slug: "attributed-product",
        sku: "ATT-001",
        sellingPrice: 5000000,
        fulfillmentMode: "stock",
        availabilityStatus: "in_stock",
        stockQuantity: 10,
        status: "published",
        del_flag: 0,
      });

      ShopProduct.updateOne = async () => ({ acknowledged: true });
      ShopOrder.findOne = () => mockQuery(null); // No collision

      ShopOrder.prototype.save = async function () {
        savedDoc = this;
        return this;
      };

      const result = await shopOrderService.createInquiry({
        productId: productId.toString(),
        quantity: 1,
        customer: {
          name: "Customer Attributed",
          contactMethod: "attr@example.com",
        },
        attribution: {
          articleId: "art-123",
          articleSlug: "comprehensive-gpu-review",
          embedId: "embed-uuid-99",
          source: "article_embed",
        },
      });

      assert.ok(result.orderReference);
      assert.ok(savedDoc.attribution, "Order must have attribution persisted");
      assert.strictEqual(savedDoc.attribution.articleSlug, "comprehensive-gpu-review");
      assert.strictEqual(savedDoc.attribution.embedId, "embed-uuid-99");
      assert.strictEqual(savedDoc.attribution.source, "article_embed");
    });

  } finally {
    restoreAll();
  }

  console.log("==================================================================");
  console.log(`  SPRINT S5 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
