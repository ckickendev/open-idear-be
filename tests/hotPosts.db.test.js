require("dotenv").config();
const mongoose = require("mongoose");
const assert = require("assert");
const postService = require("../services/post.services");
const { memoryCache } = require("../utils/cache");

async function run() {
    console.log("Connecting to MongoDB for Hot Posts Integration Test...");
    if (!process.env.MONGO_URL) {
        console.error("MONGO_URL not provided in .env");
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB.\n");

    try {
        // Clear cache prior to test
        memoryCache.clear();

        console.log("1. Testing getHotPostsThisWeek(10, 1)...");
        const startTime = Date.now();
        const resultWeek = await postService.getHotPostsThisWeek(10, 1);
        const queryDuration = Date.now() - startTime;
        console.log(`Query completed in ${queryDuration}ms`);
        console.log(`Total posts found: ${resultWeek.totalPosts}, Page: ${resultWeek.currentPage}/${resultWeek.totalPages}`);
        console.log(`Returned posts count: ${resultWeek.posts.length}`);

        assert(typeof resultWeek.totalPosts === "number", "totalPosts must be a number");
        assert(typeof resultWeek.totalPages === "number", "totalPages must be a number");
        assert(Array.isArray(resultWeek.posts), "posts must be an array");

        if (resultWeek.posts.length > 0) {
            const firstPost = resultWeek.posts[0];
            console.log("\nInspecting first hot post:");
            console.log(`- Title: "${firstPost.title}"`);
            console.log(`- Slug: "${firstPost.slug}"`);
            console.log(`- Hot Score: ${firstPost.hotScore}`);
            console.log(`- Readtime: ${firstPost.readtime}`);
            console.log(`- Author: ${firstPost.author?.name || firstPost.author?.username || "N/A"}`);
            console.log(`- Category: ${firstPost.category?.name || "N/A"}`);
            console.log(`- Image URL: ${firstPost.image?.url || "N/A"}`);

            // Verify payload stripping: heavy fields MUST NOT be present
            assert.strictEqual(firstPost.content, undefined, "content field MUST NOT be in response");
            assert.strictEqual(firstPost.blocks, undefined, "blocks field MUST NOT be in response");
            assert.strictEqual(firstPost.aiContext, undefined, "aiContext field MUST NOT be in response");
            assert.strictEqual(firstPost.seo, undefined, "seo field MUST NOT be in response");
            console.log("✓ Heavy fields successfully stripped from payload!");

            // Verify hotScore ordering
            for (let i = 0; i < resultWeek.posts.length - 1; i++) {
                assert(
                    resultWeek.posts[i].hotScore >= resultWeek.posts[i + 1].hotScore,
                    `Posts must be sorted descending by hotScore. Index ${i} (${resultWeek.posts[i].hotScore}) < Index ${i+1} (${resultWeek.posts[i+1].hotScore})`
                );
            }
            console.log("✓ Posts correctly sorted in descending hotScore order!");
        }

        // 2. Test In-Memory Caching speed
        console.log("\n2. Testing In-Memory Cache hit speed...");
        const cacheStartTime = Date.now();
        const cachedResult = await postService.getHotPostsThisWeek(10, 1);
        const cacheDuration = Date.now() - cacheStartTime;
        console.log(`Cache retrieval took ${cacheDuration}ms (vs ${queryDuration}ms DB query)`);
        assert.deepStrictEqual(cachedResult, resultWeek);
        assert(cacheDuration <= 10, "Cached response should be nearly instantaneous (<= 10ms)");
        console.log("✓ In-Memory Cache working with sub-10ms response!");

        // 3. Test getHotPostsToday
        console.log("\n3. Testing getHotPostsToday(10, 1)...");
        const resultToday = await postService.getHotPostsToday(10, 1);
        assert(typeof resultToday.totalPosts === "number");
        assert(Array.isArray(resultToday.posts));
        console.log(`Today's hot posts: ${resultToday.posts.length}`);
        console.log("✓ getHotPostsToday passed!");

        console.log("\n===========================================");
        console.log("ALL INTEGRATION TESTS PASSED SUCCESSFULLY!");
        console.log("===========================================");
    } finally {
        await mongoose.disconnect();
    }
}

run().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
});
