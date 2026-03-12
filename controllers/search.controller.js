const express = require("express");
const { Controller } = require("../core");
const { searchService } = require("../services");
const asyncHandler = require("../utils/asyncHandler");

class SearchController extends Controller {
    _rootPath = "/search";
    _router = express.Router();

    constructor() {
        super();
        this.initController();
    }

    /**
     * Perform a generic search on a specific index using Meilisearch
     */
    globalSearch = asyncHandler(async (req, res) => {
        const { q, index } = req.query;
        if (!q) {
            return res.status(400).json({ message: "Search query 'q' is required" });
        }
        
        // Default index to search if not provided
        const indexToSearch = index || 'posts';
        
        const results = await searchService.search(indexToSearch, q);
        res.status(200).json({ results });
    });

    initController = () => {
        this._router.get(`${this._rootPath}`, this.globalSearch);
    };
}

module.exports = SearchController;
