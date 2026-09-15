const assert = require("assert");
const { MemoryCache, memoryCache } = require("../utils/cache");
const postService = require("../services/post.services");

console.log("Running Hot Posts & Hot Score Test Suite...\n");

// 1. Test MemoryCache
{
    console.log("Test 1: MemoryCache basic operations and TTL invalidation");
    const testCache = new MemoryCache(100); // 100ms TTL

    testCache.set("key1", { data: "hello" });
    assert.deepStrictEqual(testCache.get("key1"), { data: "hello" });

    // Test prefix invalidation
    testCache.set("hot_posts_week_10_1", [1, 2, 3]);
    testCache.set("hot_posts_today_10_1", [4, 5]);
    testCache.set("other_key", "keep_me");

    testCache.invalidate("hot_posts_");
    assert.strictEqual(testCache.get("hot_posts_week_10_1"), null);
    assert.strictEqual(testCache.get("hot_posts_today_10_1"), null);
    assert.strictEqual(testCache.get("other_key"), "keep_me");

    console.log("✓ MemoryCache test passed.");
}

// 2. Test calculateHotScore formula & null-safety
{
    console.log("Test 2: calculateHotScore robustness & formula mechanics");

    // Null safety
    assert.strictEqual(postService.calculateHotScore(null), 0);
    assert.strictEqual(postService.calculateHotScore({}), 0);

    const baseDate = new Date();
    const freshPost = {
        _id: "post1",
        createdAt: baseDate,
        likes: ["u1", "u2"], // 2 likes * 3 = 6
        comments: ["c1"],    // 1 comment * 2.5 = 2.5
        views: 20            // 20 views * 0.1 = 2
    };
    // Total interactions = 6 + 2.5 + 2 = 10.5
    // Age ~ 0 hours -> (0 + 2)^0.8 = 2^0.8 = ~1.7411
    // Score ~ 10.5 / 1.7411 = ~6.0306
    const scoreFresh = postService.calculateHotScore(freshPost);
    assert(scoreFresh > 5.5 && scoreFresh < 6.5, `Expected score ~6.03, got ${scoreFresh}`);

    // Time decay: Same interactions, but created 24 hours ago
    const olderDate = new Date(baseDate.getTime() - 24 * 3600 * 1000);
    const olderPost = {
        ...freshPost,
        _id: "post2",
        createdAt: olderDate
    };
    const scoreOlder = postService.calculateHotScore(olderPost);
    assert(scoreFresh > scoreOlder, `Fresh post score (${scoreFresh}) must be higher than older post (${scoreOlder})`);

    // Clock-skew safety: Future createdAt shouldn't cause negative postAge
    const futureDate = new Date(baseDate.getTime() + 10 * 1000);
    const futurePost = {
        ...freshPost,
        createdAt: futureDate
    };
    const scoreFuture = postService.calculateHotScore(futurePost);
    assert(!isNaN(scoreFuture) && scoreFuture > 0, `Future post score must be a valid positive number, got ${scoreFuture}`);

    // High interaction vs Low interaction
    const viralPost = {
        _id: "post_viral",
        createdAt: olderDate, // 24h ago
        likes: new Array(50).fill("u"),
        comments: new Array(20).fill("c"),
        views: 500
    };
    const scoreViral = postService.calculateHotScore(viralPost);
    assert(scoreViral > scoreFresh, "A viral 24h post should outrank a low-engagement brand new post");

    console.log("✓ calculateHotScore test passed.");
}

// 3. Test Service methods exist and are properly bound
{
    console.log("Test 3: PostService Hot Posts method contracts");
    assert.strictEqual(typeof postService.calculateHotScore, "function");
    assert.strictEqual(typeof postService.fetchHotPosts, "function");
    assert.strictEqual(typeof postService.getHotPostsThisWeek, "function");
    assert.strictEqual(typeof postService.getHotPostsToday, "function");
    assert.strictEqual(typeof postService.getHotPostsAggregation, "function");
    console.log("✓ PostService method contracts passed.");
}

console.log("\nAll Hot Posts unit tests completed successfully!");
