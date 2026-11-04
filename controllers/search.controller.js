const express = require("express");
const { Controller } = require("../core");
const { globalSearchService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Extracts and validates request locale from query, headers, or cookies
 */
const extractLocale = (req) => {
  const raw =
    req?.query?.locale ||
    req?.headers?.["x-locale"] ||
    req?.cookies?.["NEXT_LOCALE"] ||
    req?.body?.locale ||
    (req?.headers?.["accept-language"]?.toLowerCase().startsWith("vi") ? "vi" : null);
  return ["en", "vi"].includes(raw) ? raw : "vi";
};

class SearchController extends Controller {
  _rootPath = "/search";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * Unified search endpoint across Courses and Posts.
   * Publicly accessible, supports multi-attribute faceted queries.
   *
   * Route: GET /search or GET /api/v1/search
   */
  searchGlobal = asyncHandler(async (req, res) => {
    const {
      q,
      type,
      category,
      minPrice,
      maxPrice,
      isFree,
      sort,
      page,
      limit,
    } = req.query;

    const locale = extractLocale(req);

    const result = await globalSearchService.search({
      q,
      type,
      category,
      minPrice,
      maxPrice,
      isFree,
      locale,
      sort,
      page,
      limit,
    });

    return res.status(200).json({
      status: "success",
      data: result,
    });
  });

  initController = () => {
    this._router.get(`${this._rootPath}`, this.searchGlobal);
    this._router.get(`/api/v1${this._rootPath}`, this.searchGlobal);
  };
}

module.exports = SearchController;
