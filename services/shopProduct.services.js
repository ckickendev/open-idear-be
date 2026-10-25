const mongoose = require("mongoose");
const slugify = require("slugify");
const { Service } = require("../core");
const { ShopProduct, ShopCategory } = require("../models");
const {
  BadRequestException,
  NotFoundException,
  ConflictException,
} = require("../exceptions");

class ShopProductService extends Service {
  /**
   * Normalize and validate product input data.
   */
  _normalizeAndValidate(data, isUpdate = false) {
    const sanitized = {};

    if (data.name !== undefined) {
      if (typeof data.name !== "string" || !data.name.trim()) {
        throw new BadRequestException("Product name is required");
      }
      sanitized.name = data.name.trim();
    }

    if (data.slug !== undefined || (data.name && !isUpdate)) {
      const rawSlug = data.slug || data.name;
      const normalizedSlug = slugify(rawSlug, { lower: true, strict: true });
      if (!normalizedSlug) {
        throw new BadRequestException("Invalid product slug");
      }
      sanitized.slug = normalizedSlug;
    }

    if (data.sku !== undefined) {
      if (typeof data.sku !== "string" || !data.sku.trim()) {
        throw new BadRequestException("Product SKU is required");
      }
      sanitized.sku = data.sku.trim().toUpperCase();
    }

    if (data.sellingPrice !== undefined) {
      const price = Number(data.sellingPrice);
      if (!Number.isFinite(price) || price < 0) {
        throw new BadRequestException("Selling price must be a non-negative number");
      }
      sanitized.sellingPrice = price;
    }

    if (data.originalPrice !== undefined) {
      if (data.originalPrice === null || data.originalPrice === "") {
        sanitized.originalPrice = null;
      } else {
        const origPrice = Number(data.originalPrice);
        if (!Number.isFinite(origPrice) || origPrice < 0) {
          throw new BadRequestException("Original price must be a non-negative number");
        }
        sanitized.originalPrice = origPrice;
      }
    }

    if (data.stockQuantity !== undefined) {
      const stock = Number(data.stockQuantity);
      if (!Number.isInteger(stock) || stock < 0) {
        throw new BadRequestException("Stock quantity must be a non-negative integer");
      }
      sanitized.stockQuantity = stock;
    }

    if (data.fulfillmentMode !== undefined) {
      if (!["stock", "supplier_order"].includes(data.fulfillmentMode)) {
        throw new BadRequestException(
          "Fulfillment mode must be either 'stock' or 'supplier_order'"
        );
      }
      sanitized.fulfillmentMode = data.fulfillmentMode;
    }

    if (data.availabilityStatus !== undefined) {
      if (
        ![
          "in_stock",
          "available_on_order",
          "out_of_stock",
          "discontinued",
        ].includes(data.availabilityStatus)
      ) {
        throw new BadRequestException("Invalid availability status");
      }
      sanitized.availabilityStatus = data.availabilityStatus;
    }

    if (data.status !== undefined) {
      if (!["draft", "published", "archived"].includes(data.status)) {
        throw new BadRequestException(
          "Status must be 'draft', 'published', or 'archived'"
        );
      }
      sanitized.status = data.status;
    }

    if (data.summary !== undefined) {
      sanitized.summary = (data.summary || "").trim();
    }
    if (data.description !== undefined) {
      sanitized.description = (data.description || "").trim();
    }

    if (data.images !== undefined) {
      if (!Array.isArray(data.images)) {
        throw new BadRequestException("Images must be an array");
      }
      sanitized.images = data.images.map((img, idx) => {
        if (!img.url || typeof img.url !== "string") {
          throw new BadRequestException(`Image at index ${idx} missing valid url`);
        }
        return {
          url: img.url.trim(),
          publicId: img.publicId || null,
          alt: img.alt || "",
          isPrimary: Boolean(img.isPrimary),
        };
      });
    }

    if (data.specifications !== undefined) {
      if (!Array.isArray(data.specifications)) {
        throw new BadRequestException("Specifications must be an array");
      }
      sanitized.specifications = data.specifications.map((spec, idx) => {
        if (!spec.name || !spec.value) {
          throw new BadRequestException(
            `Specification at index ${idx} must contain name and value`
          );
        }
        return {
          group: (spec.group || "General").trim(),
          name: spec.name.trim(),
          value: spec.value.trim(),
        };
      });
    }

    if (data.supplierInfo !== undefined) {
      const s = data.supplierInfo || {};
      const costPrice =
        s.costPrice !== null && s.costPrice !== undefined && s.costPrice !== ""
          ? Number(s.costPrice)
          : null;
      if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
        throw new BadRequestException("Supplier cost price must be a non-negative number");
      }
      sanitized.supplierInfo = {
        name: (s.name || "").trim(),
        sku: (s.sku || "").trim(),
        costPrice,
        leadTimeDays: Math.max(0, parseInt(s.leadTimeDays, 10) || 3),
      };
    }

    return sanitized;
  }

  /**
   * Create a new product.
   */
  async createProduct(data) {
    if (!data.name) throw new BadRequestException("Product name is required");
    if (!data.sku) throw new BadRequestException("Product SKU is required");
    if (!data.category) throw new BadRequestException("Product category is required");
    if (data.sellingPrice === undefined) {
      throw new BadRequestException("Selling price is required");
    }

    if (!mongoose.Types.ObjectId.isValid(data.category)) {
      throw new BadRequestException("Invalid category ID format");
    }

    const category = await ShopCategory.findOne({
      _id: data.category,
      del_flag: 0,
    });
    if (!category) {
      throw new NotFoundException("Category not found or inactive");
    }

    const sanitized = this._normalizeAndValidate(data, false);
    sanitized.category = category._id;

    // Check SKU uniqueness
    const existingSku = await ShopProduct.findOne({
      sku: sanitized.sku,
      del_flag: 0,
    });
    if (existingSku) {
      throw new ConflictException(`SKU '${sanitized.sku}' is already in use`);
    }

    // Check Slug uniqueness
    const existingSlug = await ShopProduct.findOne({
      slug: sanitized.slug,
      del_flag: 0,
    });
    if (existingSlug) {
      throw new ConflictException(`Product slug '${sanitized.slug}' is already in use`);
    }

    // Apply fulfillment and availability rules
    const fulfillmentMode = sanitized.fulfillmentMode || "stock";
    let availabilityStatus = sanitized.availabilityStatus || "in_stock";
    const stockQuantity = sanitized.stockQuantity !== undefined ? sanitized.stockQuantity : 0;

    if (fulfillmentMode === "stock") {
      if (stockQuantity <= 0 && availabilityStatus === "in_stock") {
        availabilityStatus = "out_of_stock";
      }
    } else if (fulfillmentMode === "supplier_order") {
      if (availabilityStatus === "in_stock") {
        availabilityStatus = "available_on_order";
      }
    }

    sanitized.fulfillmentMode = fulfillmentMode;
    sanitized.availabilityStatus = availabilityStatus;
    sanitized.stockQuantity = stockQuantity;

    const product = new ShopProduct({
      _id: new mongoose.Types.ObjectId(),
      ...sanitized,
    });

    await product.save();
    return await ShopProduct.findById(product._id).populate("category", "name slug");
  }

  _escapeRegex(str) {
    if (typeof str !== "string") return "";
    return str.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get products for administration.
   */
  async getProductsAdmin(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { del_flag: 0 };

    if (query.category) {
      if (mongoose.Types.ObjectId.isValid(query.category)) {
        filter.category = query.category;
      } else {
        const cat = await ShopCategory.findOne({ slug: query.category, del_flag: 0 });
        if (cat) filter.category = cat._id;
      }
    }

    if (query.status && query.status !== "all") {
      filter.status = query.status;
    }

    if (query.fulfillmentMode) {
      filter.fulfillmentMode = query.fulfillmentMode;
    }

    if (query.availabilityStatus) {
      filter.availabilityStatus = query.availabilityStatus;
    }

    if (query.search && typeof query.search === "string" && query.search.trim()) {
      const escaped = this._escapeRegex(query.search);
      if (escaped) {
        const searchRegex = new RegExp(escaped, "i");
        filter.$or = [
          { name: searchRegex },
          { sku: searchRegex },
          { slug: searchRegex },
        ];
      }
    }

    let sort = { createdAt: -1 };
    if (query.sort === "price_asc") sort = { sellingPrice: 1 };
    else if (query.sort === "price_desc") sort = { sellingPrice: -1 };
    else if (query.sort === "stock_asc") sort = { stockQuantity: 1 };
    else if (query.sort === "stock_desc") sort = { stockQuantity: -1 };
    else if (query.sort === "popular") sort = { views: -1 };

    const [products, total] = await Promise.all([
      ShopProduct.find(filter)
        .populate("category", "name slug")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      ShopProduct.countDocuments(filter),
    ]);

    return {
      products,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get product by ID for admin (including supplier costs).
   */
  async getProductByIdAdmin(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid product ID format");
    }

    const product = await ShopProduct.findOne({ _id: id, del_flag: 0 })
      .populate("category", "name slug")
      .lean();

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return product;
  }

  /**
   * Update product with allowlisted fields.
   */
  async updateProduct(id, updateData) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid product ID format");
    }

    const product = await ShopProduct.findOne({ _id: id, del_flag: 0 });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const sanitized = this._normalizeAndValidate(updateData, true);

    // Validate category reference if updating category
    if (updateData.category) {
      if (!mongoose.Types.ObjectId.isValid(updateData.category)) {
        throw new BadRequestException("Invalid category ID format");
      }
      const cat = await ShopCategory.findOne({
        _id: updateData.category,
        del_flag: 0,
      });
      if (!cat) {
        throw new NotFoundException("Category not found or inactive");
      }
      sanitized.category = cat._id;
    }

    // SKU uniqueness check on modification
    if (sanitized.sku && sanitized.sku !== product.sku) {
      const existingSku = await ShopProduct.findOne({
        sku: sanitized.sku,
        _id: { $ne: id },
        del_flag: 0,
      });
      if (existingSku) {
        throw new ConflictException(`SKU '${sanitized.sku}' is already in use`);
      }
      product.sku = sanitized.sku;
    }

    // Slug uniqueness check on modification
    if (sanitized.slug && sanitized.slug !== product.slug) {
      const existingSlug = await ShopProduct.findOne({
        slug: sanitized.slug,
        _id: { $ne: id },
        del_flag: 0,
      });
      if (existingSlug) {
        throw new ConflictException(`Product slug '${sanitized.slug}' is already in use`);
      }
      product.slug = sanitized.slug;
    }

    // Assign sanitized updates
    Object.keys(sanitized).forEach((key) => {
      if (key !== "sku" && key !== "slug") {
        product[key] = sanitized[key];
      }
    });

    // Re-verify fulfillment/stock consistency
    if (product.fulfillmentMode === "stock") {
      if (product.stockQuantity <= 0 && product.availabilityStatus === "in_stock") {
        product.availabilityStatus = "out_of_stock";
      }
    } else if (product.fulfillmentMode === "supplier_order") {
      if (product.availabilityStatus === "in_stock") {
        product.availabilityStatus = "available_on_order";
      }
    }

    await product.save();
    return await ShopProduct.findById(id).populate("category", "name slug");
  }

  /**
   * Adjust stock quantity.
   */
  async updateStock(id, stockQuantity) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid product ID format");
    }

    const stock = Number(stockQuantity);
    if (!Number.isInteger(stock) || stock < 0) {
      throw new BadRequestException("Stock quantity must be a non-negative integer");
    }

    const product = await ShopProduct.findOne({ _id: id, del_flag: 0 });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    product.stockQuantity = stock;
    if (product.fulfillmentMode === "stock") {
      if (stock === 0 && product.availabilityStatus === "in_stock") {
        product.availabilityStatus = "out_of_stock";
      } else if (stock > 0 && product.availabilityStatus === "out_of_stock") {
        product.availabilityStatus = "in_stock";
      }
    }

    await product.save();
    return {
      _id: product._id,
      stockQuantity: product.stockQuantity,
      availabilityStatus: product.availabilityStatus,
    };
  }

  /**
   * Soft-delete / Archive product.
   */
  async deleteProduct(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid product ID format");
    }

    const product = await ShopProduct.findOne({ _id: id, del_flag: 0 });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    product.del_flag = 1;
    product.status = "archived";
    await product.save();

    return { message: "Product deleted successfully", id };
  }

  /**
   * Public catalog: List published products only, strip internal supplierInfo and soft-delete flags.
   */
  async getPublishedProductsPublic(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      status: "published",
      del_flag: 0,
    };

    if (query.category) {
      if (mongoose.Types.ObjectId.isValid(query.category)) {
        filter.category = query.category;
      } else {
        const cat = await ShopCategory.findOne({
          slug: String(query.category).trim().toLowerCase(),
          isActive: true,
          del_flag: 0,
        });
        if (cat) {
          filter.category = cat._id;
        } else {
          // Category slug does not exist or is inactive
          return {
            products: [],
            pagination: { total: 0, page, limit, pages: 0 },
          };
        }
      }
    }

    const ALLOWED_FULFILLMENT = ["stock", "supplier_order"];
    if (query.fulfillmentMode && ALLOWED_FULFILLMENT.includes(query.fulfillmentMode)) {
      filter.fulfillmentMode = query.fulfillmentMode;
    }

    const ALLOWED_AVAILABILITY = [
      "in_stock",
      "available_on_order",
      "out_of_stock",
      "pre_order",
    ];
    if (query.availabilityStatus && ALLOWED_AVAILABILITY.includes(query.availabilityStatus)) {
      filter.availabilityStatus = query.availabilityStatus;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const min = Number(query.minPrice);
      const max = Number(query.maxPrice);
      const priceFilter = {};
      if (Number.isFinite(min) && min >= 0) {
        priceFilter.$gte = min;
      }
      if (Number.isFinite(max) && max >= 0) {
        priceFilter.$lte = max;
      }
      if (Object.keys(priceFilter).length > 0) {
        filter.sellingPrice = priceFilter;
      }
    }

    if (query.search && typeof query.search === "string" && query.search.trim()) {
      const escaped = this._escapeRegex(query.search);
      if (escaped) {
        const searchRegex = new RegExp(escaped, "i");
        filter.$or = [{ name: searchRegex }, { summary: searchRegex }];
      }
    }

    let sort = { createdAt: -1, _id: -1 };
    if (query.sort === "price_asc") sort = { sellingPrice: 1, _id: 1 };
    else if (query.sort === "price_desc") sort = { sellingPrice: -1, _id: -1 };
    else if (query.sort === "popular") sort = { views: -1, _id: -1 };
    else if (query.sort === "newest") sort = { createdAt: -1, _id: -1 };

    const [products, total] = await Promise.all([
      ShopProduct.find(filter)
        .select("-supplierInfo -del_flag")
        .populate("category", "name slug")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      ShopProduct.countDocuments(filter),
    ]);

    return {
      products,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Public product detail: strictly published, increments views non-blockingly, strips supplierInfo.
   * Supports lookup by slug or by MongoDB ObjectId (for stable article embeds).
   */
  async getProductBySlugPublic(slugOrId) {
    if (!slugOrId || typeof slugOrId !== "string") {
      throw new BadRequestException("Product identifier (slug or ID) is required");
    }

    const trimmed = slugOrId.trim();
    const query = {
      status: "published",
      del_flag: 0,
    };

    if (mongoose.Types.ObjectId.isValid(trimmed)) {
      query.$or = [
        { _id: new mongoose.Types.ObjectId(trimmed) },
        { slug: trimmed.toLowerCase() },
      ];
    } else {
      query.slug = trimmed.toLowerCase();
    }

    const product = await ShopProduct.findOne(query)
      .select("-supplierInfo -del_flag")
      .populate("category", "name slug description")
      .lean();

    if (!product) {
      throw new NotFoundException("Product not found or currently unavailable");
    }

    // Increment views asynchronously without blocking response or causing unhandled promise rejections
    ShopProduct.updateOne({ _id: product._id }, { $inc: { views: 1 } }).catch(() => {
      // Fire-and-forget: catch any error silently
    });

    return product;
  }

  /**
   * Public batch lookup: Fetch multiple products by ID or slug for article embeds without unbounded requests.
   */
  async getBatchProductsPublic(idsOrSlugs = []) {
    if (!Array.isArray(idsOrSlugs) || idsOrSlugs.length === 0) {
      return { products: [] };
    }

    const cleanList = idsOrSlugs
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 20); // Bounded to max 20 per request

    if (cleanList.length === 0) {
      return { products: [] };
    }

    const objectIds = cleanList
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const slugs = cleanList.filter((s) => !mongoose.Types.ObjectId.isValid(s));

    const orClauses = [];
    if (objectIds.length > 0) {
      orClauses.push({ _id: { $in: objectIds } });
    }
    if (slugs.length > 0) {
      orClauses.push({ slug: { $in: slugs } });
    }

    if (orClauses.length === 0) {
      return { products: [] };
    }

    const products = await ShopProduct.find({
      $or: orClauses,
      status: "published",
      del_flag: 0,
    })
      .select("-supplierInfo -del_flag")
      .populate("category", "name slug")
      .lean();

    return { products };
  }

  /**
   * Public / First-Party Analytics: Record product embed impression or click without collecting PII.
   */
  async recordEmbedAnalyticsEvent(data = {}) {
    const { eventType, productId } = data;

    if (!eventType || !["impression", "click"].includes(eventType)) {
      throw new BadRequestException("Invalid or missing eventType. Must be 'impression' or 'click'");
    }

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      throw new BadRequestException("Valid productId is required for embed analytics");
    }

    const incField = eventType === "click" ? { embedClicks: 1 } : { embedImpressions: 1 };
    await ShopProduct.updateOne(
      { _id: productId, del_flag: 0 },
      { $inc: incField }
    ).catch(() => {});

    return { success: true };
  }
}

module.exports = new ShopProductService();
