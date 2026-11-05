const mongoose = require("mongoose");
const { Service } = require("../core");
const { Course, Post, PostTranslation, Category } = require("../models");

/**
 * Generates an accent-folding regular expression for Vietnamese and Latin text.
 * Allows queries like "dau tu" to match "Đầu tư", and vice versa.
 */
function buildVietnameseRegex(str) {
  if (!str) return null;
  const map = {
    a: "[aàáảãạăằắẳẵặâầấẩẫậAÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ]",
    d: "[dđDĐ]",
    e: "[eèéẻẽẹêềếểễệEÈÉẺẼẸÊỀẾỂỄỆ]",
    i: "[iìíỉĩịIÌÍỈĨỊ]",
    o: "[oòóỏõọôồốổỗộơờớởỡợOÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ]",
    u: "[uùúủũụưừứửữựUÙÚỦŨỤƯỪỨỬỮỰ]",
    y: "[yỳýỷỹỵYỲÝỶỸỴ]",
  };
  const normalized = str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

  let pattern = "";
  for (const ch of normalized) {
    const lower = ch.toLowerCase();
    if (map[lower]) {
      pattern += map[lower];
    } else {
      pattern += ch.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }
  }
  return new RegExp(pattern, "i");
}

class GlobalSearchService extends Service {
  /**
   * Performs unified multi-entity search across Courses and Posts.
   *
   * @param {Object} params
   * @param {string} [params.q=""] - Search keyword
   * @param {string} [params.type="all"] - "all" | "courses" | "posts"
   * @param {string} [params.category] - Category slug or ObjectId
   * @param {number|string} [params.minPrice] - Minimum price (courses)
   * @param {number|string} [params.maxPrice] - Maximum price (courses)
   * @param {boolean|string} [params.isFree] - Filter for free courses
   * @param {string} [params.locale="vi"] - Target language "vi" | "en"
   * @param {string} [params.sort="relevance"] - "relevance" | "newest" | "popular" | "price_asc" | "price_desc"
   * @param {number|string} [params.page=1] - 1-indexed page
   * @param {number|string} [params.limit=12] - Items per page
   * @returns {Promise<Object>} Unified search result payload
   */
  async search(params = {}) {
    const {
      q = "",
      type = "all",
      category,
      minPrice,
      maxPrice,
      isFree,
      locale = "vi",
      sort = "relevance",
      page = 1,
      limit = 12,
    } = params;

    const cleanQuery = (q || "").trim();
    const validLocale = ["vi", "en"].includes(locale) ? locale : "vi";
    const validSort = ["relevance", "newest", "popular", "price_asc", "price_desc"].includes(sort)
      ? sort
      : "relevance";
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const regex = cleanQuery ? buildVietnameseRegex(cleanQuery) : null;

    // Resolve category ObjectId if a slug was passed
    let categoryId = null;
    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        categoryId = category;
      } else {
        const catDoc = await Category.findOne({
          slug: category.toLowerCase().trim(),
          del_flag: 0,
        }).select("_id").lean();
        if (catDoc) categoryId = catDoc._id;
      }
    }

    // ── Build Course Query ──────────────────────────────────────────────────
    const courseFilter = { del_flag: 0, status: "published" };
    if (regex) {
      courseFilter.$or = [
        { title: regex },
        { description: regex },
        { whatYouWillLearn: regex },
      ];
    }
    if (categoryId) courseFilter.category = categoryId;

    if (isFree === true || isFree === "true") {
      courseFilter.price = 0;
    } else if (minPrice !== undefined || maxPrice !== undefined) {
      courseFilter.price = {};
      if (minPrice !== undefined && minPrice !== "") courseFilter.price.$gte = Number(minPrice);
      if (maxPrice !== undefined && maxPrice !== "") courseFilter.price.$lte = Number(maxPrice);
    }

    let courseSort = { createdAt: -1 };
    if (validSort === "popular") courseSort = { studentsCount: -1, averageRating: -1 };
    else if (validSort === "price_asc") courseSort = { price: 1, createdAt: -1 };
    else if (validSort === "price_desc") courseSort = { price: -1, createdAt: -1 };
    else if (validSort === "newest") courseSort = { createdAt: -1 };
    else if (validSort === "relevance" && regex) courseSort = { averageRating: -1, createdAt: -1 };

    // ── Build Post Translation Query ────────────────────────────────────────
    const transFilter = { locale: validLocale, published: true };
    if (regex) {
      transFilter.$or = [{ title: regex }, { description: regex }];
    }

    let postSort = { createdAt: -1 };
    if (validSort === "popular") postSort = { views: -1, likes: -1 };
    else if (validSort === "newest") postSort = { createdAt: -1 };

    // ── Execute Parallel Search Tasks ───────────────────────────────────────
    // 1. Total counts for both entities (for tab counters)
    const countCoursesTask = Course.countDocuments(courseFilter);

    // For posts, we count published translations matching query
    const countTranslationsTask = (async () => {
      const transMatches = await PostTranslation.find(transFilter).select("postId").lean();
      if (!transMatches.length) return 0;
      const pIds = transMatches.map((t) => t.postId);
      const parentFilter = { _id: { $in: pIds }, del_flag: 0, published: true };
      if (categoryId) parentFilter.category = categoryId;
      return Post.countDocuments(parentFilter);
    })();

    // 2. Fetch courses if requested
    const fetchCoursesTask = (async () => {
      if (type === "posts") return [];
      const fetchLimit = type === "all" ? Math.min(limitNum, 6) : limitNum;
      const fetchSkip = type === "all" ? (pageNum - 1) * fetchLimit : skip;

      const rawCourses = await Course.find(courseFilter)
        .populate("instructor", "username name avatar")
        .populate("category", "name slug")
        .populate("thumbnail", "url")
        .sort(courseSort)
        .skip(fetchSkip)
        .limit(fetchLimit)
        .lean();

      return rawCourses.map((c) => ({
        id: c._id.toString(),
        type: "course",
        title: c.title,
        slug: c.slug,
        description: c.description || "",
        thumbnail: c.thumbnail?.url || "",
        instructor: {
          id: c.instructor?._id?.toString() || "",
          name: c.instructor?.name || c.instructor?.username || "Giảng viên",
          avatar: c.instructor?.avatar || "",
        },
        category: c.category
          ? {
              id: c.category._id?.toString(),
              name: c.category.name,
              slug: c.category.slug,
            }
          : null,
        price: c.price || 0,
        discountPrice: c.discountPrice || 0,
        isFree: !c.price || c.price === 0,
        level: c.level || "All Levels",
        studentsCount: c.studentsCount || 0,
        rating: c.averageRating || 0,
        ratingCount: c.ratingCount || 0,
        totalDuration: c.totalDuration || 0,
        createdAt: c.createdAt,
      }));
    })();

    // 3. Fetch posts if requested
    const fetchPostsTask = (async () => {
      if (type === "courses") return [];
      const fetchLimit = type === "all" ? Math.min(limitNum, 6) : limitNum;
      const fetchSkip = type === "all" ? (pageNum - 1) * fetchLimit : skip;

      const matchingTranslations = await PostTranslation.find(transFilter)
        .select("postId title description slug readtime locale createdAt")
        .sort({ createdAt: -1 })
        .lean();

      if (!matchingTranslations.length) return [];

      const transMap = new Map();
      matchingTranslations.forEach((t) => {
        if (!transMap.has(t.postId.toString())) {
          transMap.set(t.postId.toString(), t);
        }
      });

      const parentPostIds = Array.from(transMap.keys());
      const postFilter = {
        _id: { $in: parentPostIds },
        del_flag: 0,
        published: true,
      };
      if (categoryId) postFilter.category = categoryId;

      const rawPosts = await Post.find(postFilter)
        .populate("category", "name slug")
        .populate("author", "username name avatar")
        .populate("tags", "name slug")
        .populate("image", "url description")
        .sort(postSort)
        .skip(fetchSkip)
        .limit(fetchLimit)
        .lean();

      return rawPosts.map((p) => {
        const trans = transMap.get(p._id.toString()) || {};
        return {
          id: p._id.toString(),
          type: "post",
          title: trans.title || p.title,
          slug: trans.slug || p.slug,
          description: trans.description || p.description || "",
          thumbnail: p.image?.url || p.background || "",
          author: {
            id: p.author?._id?.toString() || "",
            name: p.author?.name || p.author?.username || "Tác giả",
            avatar: p.author?.avatar || "",
          },
          category: p.category
            ? {
                id: p.category._id?.toString(),
                name: p.category.name,
                slug: p.category.slug,
              }
            : null,
          tags: Array.isArray(p.tags) ? p.tags.map((t) => t.name || t) : [],
          readtime: trans.readtime || p.readtime || 5,
          locale: validLocale,
          views: p.views || 0,
          likes: p.likes || 0,
          createdAt: p.createdAt,
        };
      });
    })();

    // 4. Faceted category aggregations across published items
    const fetchCategoriesTask = (async () => {
      try {
        const [courseCats, postCats] = await Promise.all([
          Course.aggregate([
            { $match: { del_flag: 0, status: "published" } },
            { $group: { _id: "$category", count: { $sum: 1 } } },
          ]),
          Post.aggregate([
            { $match: { del_flag: 0, published: true } },
            { $group: { _id: "$category", count: { $sum: 1 } } },
          ]),
        ]);

        const catCountMap = new Map();
        courseCats.forEach((c) => {
          if (c._id) catCountMap.set(c._id.toString(), (catCountMap.get(c._id.toString()) || 0) + c.count);
        });
        postCats.forEach((p) => {
          if (p._id) catCountMap.set(p._id.toString(), (catCountMap.get(p._id.toString()) || 0) + p.count);
        });

        const activeCatIds = Array.from(catCountMap.keys()).filter((id) => mongoose.Types.ObjectId.isValid(id));
        if (!activeCatIds.length) return [];

        const catDocs = await Category.find({ _id: { $in: activeCatIds }, del_flag: 0 })
          .select("name slug")
          .lean();

        return catDocs
          .map((c) => ({
            id: c._id.toString(),
            name: c.name,
            slug: c.slug,
            count: catCountMap.get(c._id.toString()) || 0,
          }))
          .sort((a, b) => b.count - a.count);
      } catch (err) {
        console.warn("[GlobalSearchService] Failed to aggregate categories:", err.message);
        return [];
      }
    })();

    const [totalCourses, totalPosts, courses, posts, availableCategories] = await Promise.all([
      countCoursesTask,
      countTranslationsTask,
      fetchCoursesTask,
      fetchPostsTask,
      fetchCategoriesTask,
    ]);

    const totalAll = totalCourses + totalPosts;
    const selectedTotal =
      type === "courses" ? totalCourses : type === "posts" ? totalPosts : totalAll;
    const currentLimit = limitNum;

    // Combined items interleaved or chronologically sorted for "all" tab
    let combinedItems = [];
    if (type === "all") {
      combinedItems = [...courses, ...posts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (type === "courses") {
      combinedItems = courses;
    } else {
      combinedItems = posts;
    }

    return {
      query: cleanQuery,
      type,
      locale: validLocale,
      sort: validSort,
      counts: {
        all: totalAll,
        courses: totalCourses,
        posts: totalPosts,
      },
      courses,
      posts,
      items: combinedItems,
      availableCategories,
      pagination: {
        currentPage: pageNum,
        limit: currentLimit,
        totalItems: selectedTotal,
        totalPages: Math.ceil(selectedTotal / currentLimit) || 1,
        hasNextPage: pageNum < Math.ceil(selectedTotal / currentLimit),
        hasPrevPage: pageNum > 1,
      },
    };
  }
}

module.exports = new GlobalSearchService();
