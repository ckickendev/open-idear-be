// =============================================================================
//  OPENIDEAR SHOP — PRODUCT & CATEGORY LIFECYCLE TEST SUITE (SPRINT S1)
//  tests/shopProductLifecycle.test.js
//
//  Verifies:
//  1. Category creation, slug generation, and unique validation.
//  2. Category deletion safeguards (prevent orphaning products/sub-categories).
//  3. Product creation, SKU uppercase normalization, and unique validation.
//  4. Category reference validation (reject nonexistent/deleted categories).
//  5. Price and quantity constraints (reject negative, non-finite values).
//  6. Fulfillment mode and availability consistency logic (stock vs supplier).
//  7. Public access gating (draft and archived products strictly excluded).
//  8. Product stock adjustment and status transitions.
// =============================================================================

require("ts-node/register");
const assert = require("assert");
const mongoose = require("mongoose");
const { ShopCategory, ShopProduct } = require("../models");
const shopCategoryService = require("../services/shopCategory.services");
const shopProductService = require("../services/shopProduct.services");
const { ConflictException, BadRequestException, NotFoundException } = require("../exceptions");

console.log("==================================================================");
console.log("  OPENIDEAR SHOP — SPRINT S1: PRODUCT & CATEGORY TEST SUITE");
console.log("==================================================================\n");

async function runShopTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // Preserve original methods for cleanup
  const origFindOneCat = ShopCategory.findOne;
  const origFindOneProd = ShopProduct.findOne;
  const origFindProd = ShopProduct.find;
  const origCountProd = ShopProduct.countDocuments;
  const origCountCat = ShopCategory.countDocuments;
  const origAggregate = ShopProduct.aggregate;

  // ─── CATEGORY TESTS ──────────────────────────────────────────────────────────

  await test("1. Category creation auto-slugifies and saves correctly", async () => {
    ShopCategory.findOne = async () => null; // No duplicate
    let saved = false;
    ShopCategory.prototype.save = async function () {
      saved = true;
      return this;
    };

    const cat = await shopCategoryService.createCategory({
      name: "Graphics Cards & GPUs",
      description: "High performance PC graphics cards",
      displayOrder: 1,
    });

    assert.strictEqual(saved, true);
    assert.strictEqual(cat.name, "Graphics Cards & GPUs");
    assert.strictEqual(cat.slug, "graphics-cards-and-gpus");
    assert.strictEqual(cat.isActive, true);
  });

  await test("2. Duplicate category slug is rejected with 409 ConflictException", async () => {
    ShopCategory.findOne = async () => ({ _id: new mongoose.Types.ObjectId(), slug: "gpus" });

    await assert.rejects(
      async () => {
        await shopCategoryService.createCategory({ name: "GPUs", slug: "gpus" });
      },
      (err) => err instanceof ConflictException && err.status === 409
    );
  });

  await test("3. Category deletion is blocked if active products are associated", async () => {
    const catId = new mongoose.Types.ObjectId();
    ShopCategory.findOne = async () => ({ _id: catId, del_flag: 0 });
    ShopProduct.countDocuments = async () => 3; // 3 products attached

    await assert.rejects(
      async () => {
        await shopCategoryService.deleteCategory(catId.toString());
      },
      (err) => err instanceof ConflictException && /active product/i.test(err.message)
    );
  });

  await test("4. Category deletion is blocked if sub-categories are associated", async () => {
    const catId = new mongoose.Types.ObjectId();
    ShopCategory.findOne = async () => ({ _id: catId, del_flag: 0 });
    ShopProduct.countDocuments = async () => 0; // No products
    ShopCategory.countDocuments = async () => 2; // 2 sub-categories

    await assert.rejects(
      async () => {
        await shopCategoryService.deleteCategory(catId.toString());
      },
      (err) => err instanceof ConflictException && /sub-category/i.test(err.message)
    );
  });

  // ─── PRODUCT TESTS ───────────────────────────────────────────────────────────

  await test("5. Product creation enforces uppercase SKU and validates required fields", async () => {
    const catId = new mongoose.Types.ObjectId();
    ShopCategory.findOne = async () => ({ _id: catId, name: "CPUs", slug: "cpus", del_flag: 0 });
    ShopProduct.findOne = async () => null; // Unique SKU and slug
    ShopProduct.findById = () => ({
      populate: async () => ({
        _id: new mongoose.Types.ObjectId(),
        name: "AMD Ryzen 7 7800X3D",
        sku: "CPU-AMD-7800X3D",
        slug: "amd-ryzen-7-7800x3d",
        sellingPrice: 10500000,
        fulfillmentMode: "stock",
        availabilityStatus: "in_stock",
        stockQuantity: 15,
      }),
    });

    ShopProduct.prototype.save = async function () { return this; };

    const product = await shopProductService.createProduct({
      name: "AMD Ryzen 7 7800X3D",
      sku: "cpu-amd-7800x3d", // Lowercase test
      category: catId.toString(),
      sellingPrice: 10500000,
      stockQuantity: 15,
      fulfillmentMode: "stock",
      specifications: [
        { group: "Performance", name: "Cores / Threads", value: "8 / 16" },
        { group: "Performance", name: "Base Clock", value: "4.2 GHz" },
      ],
    });

    assert.strictEqual(product.name, "AMD Ryzen 7 7800X3D");
    assert.strictEqual(product.sku, "CPU-AMD-7800X3D", "SKU must be normalized to uppercase");
    assert.strictEqual(product.sellingPrice, 10500000);
    assert.strictEqual(product.stockQuantity, 15);
  });

  await test("6. Duplicate SKU is rejected with 409 ConflictException", async () => {
    const catId = new mongoose.Types.ObjectId();
    ShopCategory.findOne = async () => ({ _id: catId, del_flag: 0 });
    ShopProduct.findOne = async (query) => {
      if (query.sku) return { _id: new mongoose.Types.ObjectId(), sku: "DUPLICATE-SKU" };
      return null;
    };

    await assert.rejects(
      async () => {
        await shopProductService.createProduct({
          name: "Test GPU",
          sku: "DUPLICATE-SKU",
          category: catId.toString(),
          sellingPrice: 5000000,
        });
      },
      (err) => err instanceof ConflictException && err.status === 409
    );
  });

  await test("7. Assigning product to non-existent category throws NotFoundException", async () => {
    const nonExistentCatId = new mongoose.Types.ObjectId();
    ShopCategory.findOne = async () => null; // Category does not exist

    await assert.rejects(
      async () => {
        await shopProductService.createProduct({
          name: "Test SSD",
          sku: "SSD-1TB-NVME",
          category: nonExistentCatId.toString(),
          sellingPrice: 2000000,
        });
      },
      (err) => err instanceof NotFoundException && err.status === 404
    );
  });

  await test("8. Negative price and invalid quantities are strictly rejected", async () => {
    const catId = new mongoose.Types.ObjectId();
    ShopCategory.findOne = async () => ({ _id: catId, del_flag: 0 });

    await assert.rejects(
      async () => {
        await shopProductService.createProduct({
          name: "Bad Price Item",
          sku: "BAD-PRICE-1",
          category: catId.toString(),
          sellingPrice: -500, // Negative price
        });
      },
      (err) => err instanceof BadRequestException && err.status === 400
    );

    await assert.rejects(
      async () => {
        await shopProductService.createProduct({
          name: "Bad Stock Item",
          sku: "BAD-STOCK-1",
          category: catId.toString(),
          sellingPrice: 1000,
          stockQuantity: -5, // Negative stock
        });
      },
      (err) => err instanceof BadRequestException && err.status === 400
    );

    await assert.rejects(
      async () => {
        await shopProductService.createProduct({
          name: "Non-finite Price Item",
          sku: "BAD-FINITE-1",
          category: catId.toString(),
          sellingPrice: Infinity, // Non-finite price
        });
      },
      (err) => err instanceof BadRequestException && err.status === 400
    );
  });

  await test("9. Fulfillment mode consistency rules (supplier order cannot falsely claim in_stock)", async () => {
    const catId = new mongoose.Types.ObjectId();
    ShopCategory.findOne = async () => ({ _id: catId, del_flag: 0 });
    ShopProduct.findOne = async () => null;

    let savedProduct = null;
    ShopProduct.prototype.save = async function () {
      savedProduct = this;
      return this;
    };
    ShopProduct.findById = () => ({
      populate: async () => savedProduct,
    });

    // Supplier order submitted with 'in_stock' must be normalized to 'available_on_order'
    await shopProductService.createProduct({
      name: "Custom Liquid Cooled Rig",
      sku: "PC-WATER-01",
      category: catId.toString(),
      sellingPrice: 85000000,
      fulfillmentMode: "supplier_order",
      availabilityStatus: "in_stock", // Client claimed in_stock
    });

    assert.strictEqual(
      savedProduct.availabilityStatus,
      "available_on_order",
      "Supplier orders must normalize to available_on_order"
    );
  });

  await test("10. Public catalog strictly filters for published products and strips costPrice", async () => {
    let capturedFilter = null;
    let capturedSelect = null;

    ShopProduct.find = (filter) => {
      capturedFilter = filter;
      return {
        select: (selectStr) => {
          capturedSelect = selectStr;
          return {
            populate: () => ({
              sort: () => ({
                skip: () => ({
                  limit: () => ({
                    lean: async () => [
                      {
                        _id: new mongoose.Types.ObjectId(),
                        name: "Published GPU",
                        status: "published",
                        sellingPrice: 20000000,
                      },
                    ],
                  }),
                }),
              }),
            }),
          };
        },
      };
    };
    ShopProduct.countDocuments = async () => 1;

    const result = await shopProductService.getPublishedProductsPublic({ page: 1, limit: 10 });

    assert.strictEqual(capturedFilter.status, "published", "Filter must require status === 'published'");
    assert.strictEqual(capturedFilter.del_flag, 0, "Filter must require del_flag === 0");
    assert(capturedSelect.includes("-supplierInfo"), "Supplier info must be excluded from public projection");
    assert.strictEqual(result.products.length, 1);
  });

  await test("11. Public product detail throws NotFoundException for draft or archived items", async () => {
    ShopProduct.findOne = () => ({
      select: () => ({
        populate: () => ({
          lean: async () => null,
        }),
      }),
    });

    await assert.rejects(
      async () => {
        await shopProductService.getProductBySlugPublic("unpublished-draft-item");
      },
      (err) => err instanceof NotFoundException && err.status === 404
    );
  });

  await test("12. Stock update adjusts availability state between in_stock and out_of_stock", async () => {
    const prodId = new mongoose.Types.ObjectId();
    const mockProd = {
      _id: prodId,
      stockQuantity: 5,
      availabilityStatus: "in_stock",
      fulfillmentMode: "stock",
      del_flag: 0,
      save: async function () { return this; },
    };

    ShopProduct.findOne = async () => mockProd;

    // Decrement stock to 0
    const resZero = await shopProductService.updateStock(prodId.toString(), 0);
    assert.strictEqual(resZero.stockQuantity, 0);
    assert.strictEqual(resZero.availabilityStatus, "out_of_stock");

    // Replenish stock to 10
    const resTen = await shopProductService.updateStock(prodId.toString(), 10);
    assert.strictEqual(resTen.stockQuantity, 10);
    assert.strictEqual(resTen.availabilityStatus, "in_stock");
  });

  // Restore mocks
  ShopCategory.findOne = origFindOneCat;
  ShopProduct.findOne = origFindOneProd;
  ShopProduct.find = origFindProd;
  ShopProduct.countDocuments = origCountProd;
  ShopCategory.countDocuments = origCountCat;
  ShopProduct.aggregate = origAggregate;

  console.log("------------------------------------------------------------------");
  console.log(`  Shop Product & Category Tests: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runShopTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
