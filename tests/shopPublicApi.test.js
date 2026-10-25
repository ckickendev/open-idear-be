require("ts-node/register");
const assert = require("assert");
const mongoose = require("mongoose");
const { shopProductService, shopCategoryService } = require("../services");
const { ShopProduct, ShopCategory } = require("../models");
const { NotFoundException, BadRequestException } = require("../exceptions");

async function runTests() {
  console.log("==================================================================");
  console.log("  OPENIDEAR SHOP — SPRINT S2: PUBLIC API CONTRACT & SECURITY TESTS");
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
  const originalCount = ShopProduct.countDocuments;
  const originalUpdateOne = ShopProduct.updateOne;
  const originalCatFind = ShopCategory.find;
  const originalCatFindOne = ShopCategory.findOne;

  function restoreAll() {
    ShopProduct.find = originalFind;
    ShopProduct.findOne = originalFindOne;
    ShopProduct.countDocuments = originalCount;
    ShopProduct.updateOne = originalUpdateOne;
    ShopCategory.find = originalCatFind;
    ShopCategory.findOne = originalCatFindOne;
  }

  try {
    await test("1. Public category listing strictly filters for active, non-deleted categories", async () => {
      let capturedFilter = null;
      let capturedSelect = null;

      ShopCategory.find = (filter) => {
        capturedFilter = filter;
        return {
          select: (selectStr) => {
            capturedSelect = selectStr;
            return {
              populate: () => ({
                sort: () => ({
                  lean: async () => [
                    { _id: new mongoose.Types.ObjectId(), name: "CPUs", slug: "cpus" },
                  ],
                }),
              }),
            };
          },
        };
      };

      const categories = await shopCategoryService.getActiveCategoriesPublic();
      assert.strictEqual(capturedFilter.isActive, true, "Category must be active");
      assert.strictEqual(capturedFilter.del_flag, 0, "Category must not be deleted");
      assert(capturedSelect.includes("name") && capturedSelect.includes("slug"));
      assert.strictEqual(categories.length, 1);
    });

    await test("2. Public product catalog completely redacts supplierInfo (not just costPrice)", async () => {
      let capturedSelect = null;
      let capturedFilter = null;

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
                          name: "Intel Core i7-14700K",
                          slug: "intel-core-i7-14700k",
                          status: "published",
                          sellingPrice: 10500000,
                          // No supplierInfo should be in returned lean doc
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
      assert.strictEqual(capturedFilter.status, "published");
      assert.strictEqual(capturedFilter.del_flag, 0);
      assert(capturedSelect.includes("-supplierInfo"), "Whole -supplierInfo must be excluded");
      assert(!capturedSelect.includes("-supplierInfo.costPrice"), "Entire supplierInfo should be excluded");
      assert.strictEqual(result.products.length, 1);
      assert.strictEqual(result.products[0].supplierInfo, undefined);
    });

    await test("3. Pagination limits are strictly bounded to max 50 items", async () => {
      let capturedLimit = null;

      ShopProduct.find = () => ({
        select: () => ({
          populate: () => ({
            sort: () => ({
              skip: () => ({
                limit: (lim) => {
                  capturedLimit = lim;
                  return { lean: async () => [] };
                },
              }),
            }),
          }),
        }),
      });
      ShopProduct.countDocuments = async () => 0;

      // Try requesting 500 items
      await shopProductService.getPublishedProductsPublic({ page: 1, limit: 500 });
      assert.strictEqual(capturedLimit, 50, "Limit of 500 must be clamped to 50");

      // Try negative or 0 limit
      await shopProductService.getPublishedProductsPublic({ page: 1, limit: 0 });
      assert.strictEqual(capturedLimit, 20, "Limit of 0 must fallback to default 20");
    });

    await test("4. Sorting is deterministic with secondary _id tie-breaker", async () => {
      let capturedSort = null;

      ShopProduct.find = () => ({
        select: () => ({
          populate: () => ({
            sort: (sortObj) => {
              capturedSort = sortObj;
              return {
                skip: () => ({
                  limit: () => ({ lean: async () => [] }),
                }),
              };
            },
          }),
        }),
      });
      ShopProduct.countDocuments = async () => 0;

      await shopProductService.getPublishedProductsPublic({ sort: "price_asc" });
      assert.deepStrictEqual(capturedSort, { sellingPrice: 1, _id: 1 });

      await shopProductService.getPublishedProductsPublic({ sort: "price_desc" });
      assert.deepStrictEqual(capturedSort, { sellingPrice: -1, _id: -1 });

      await shopProductService.getPublishedProductsPublic({ sort: "popular" });
      assert.deepStrictEqual(capturedSort, { views: -1, _id: -1 });

      await shopProductService.getPublishedProductsPublic({ sort: "newest" });
      assert.deepStrictEqual(capturedSort, { createdAt: -1, _id: -1 });
    });

    await test("5. Price filter bounds are validated and non-numeric inputs ignored safely", async () => {
      let capturedFilter = null;

      ShopProduct.find = (filter) => {
        capturedFilter = filter;
        return {
          select: () => ({
            populate: () => ({
              sort: () => ({
                skip: () => ({
                  limit: () => ({ lean: async () => [] }),
                }),
              }),
            }),
          }),
        };
      };
      ShopProduct.countDocuments = async () => 0;

      await shopProductService.getPublishedProductsPublic({
        minPrice: "1000000",
        maxPrice: "5000000",
      });
      assert.strictEqual(capturedFilter.sellingPrice.$gte, 1000000);
      assert.strictEqual(capturedFilter.sellingPrice.$lte, 5000000);

      // Invalid non-numeric input should not break
      await shopProductService.getPublishedProductsPublic({
        minPrice: "invalid_price",
        maxPrice: "also_invalid",
      });
      assert.strictEqual(capturedFilter.sellingPrice, undefined, "Invalid prices must not be added to filter");
    });

    await test("6. Inactive or nonexistent category slug gracefully returns empty results", async () => {
      ShopCategory.findOne = async () => null; // Category not found or inactive

      const result = await shopProductService.getPublishedProductsPublic({
        category: "non-existent-or-inactive-slug",
      });

      assert.strictEqual(result.products.length, 0);
      assert.strictEqual(result.pagination.total, 0);
    });

    await test("7. Slug lookup strictly prevents access to draft, archived, or soft-deleted products", async () => {
      let capturedFilter = null;

      ShopProduct.findOne = (filter) => {
        capturedFilter = filter;
        return {
          select: () => ({
            populate: () => ({
              lean: async () => null, // Not found
            }),
          }),
        };
      };

      await assert.rejects(
        async () => {
          await shopProductService.getProductBySlugPublic("test-product-slug");
        },
        (err) => err instanceof NotFoundException && err.status === 404
      );

      assert.strictEqual(capturedFilter.slug, "test-product-slug");
      assert.strictEqual(capturedFilter.status, "published");
      assert.strictEqual(capturedFilter.del_flag, 0);
    });

    await test("8. View count increment is non-blocking and handles update errors silently", async () => {
      const prodId = new mongoose.Types.ObjectId();
      let updateOneCalled = false;

      ShopProduct.findOne = () => ({
        select: () => ({
          populate: () => ({
            lean: async () => ({
              _id: prodId,
              name: "Nvidia RTX 4080 Super",
              slug: "nvidia-rtx-4080-super",
              status: "published",
              sellingPrice: 28000000,
            }),
          }),
        }),
      });

      ShopProduct.updateOne = async (filter, update) => {
        updateOneCalled = true;
        assert.deepStrictEqual(filter, { _id: prodId });
        assert.deepStrictEqual(update, { $inc: { views: 1 } });
        // Simulate background DB error in view increment
        throw new Error("Simulated transient mongo connection error on view update");
      };

      // Must succeed and return product without failing due to updateOne error
      const product = await shopProductService.getProductBySlugPublic("nvidia-rtx-4080-super");
      assert.strictEqual(product.name, "Nvidia RTX 4080 Super");
      assert.strictEqual(updateOneCalled, true);
    });
  } finally {
    restoreAll();
  }

  console.log("------------------------------------------------------------------");
  console.log(`  Shop Public API Contract Tests: ${passed} passed, ${failed} failed.`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
