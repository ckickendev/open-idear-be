const assert = require("assert");
const mongoose = require("mongoose");
const { isTestVideoAsset } = require("../scripts/cleanupLegacyTestVideos");

console.log("==================================================================");
console.log("  OPENIDEAR — SPRINT 5: TEST VIDEO CLEANUP UNIT TESTS");
console.log("==================================================================");

function runTests() {
  // Test 1: Identifies test descriptions
  {
    assert.strictEqual(isTestVideoAsset({ description: "[Test] Video Upload Session", type: "video" }), true);
    assert.strictEqual(isTestVideoAsset({ description: "test video introduction", type: "video" }), true);
    assert.strictEqual(isTestVideoAsset({ description: "Sprint 2 Test Video", type: "video" }), true);
    console.log("✓ Test 1: Accurately identifies test descriptions");
  }

  // Test 2: Identifies mock GUIDs
  {
    assert.strictEqual(isTestVideoAsset({ bunnyVideoId: "guid-test-1234", type: "video" }), true);
    assert.strictEqual(isTestVideoAsset({ bunnyVideoId: "guid-mock-9999", type: "video" }), true);
    assert.strictEqual(isTestVideoAsset({ url: "guid-existing-video-1234", type: "video" }), true);
    assert.strictEqual(isTestVideoAsset({ url: "test_cf_media_999", type: "video" }), true);
    console.log("✓ Test 2: Accurately identifies mock/test GUID identifiers");
  }

  // Test 3: Preserves legitimate production videos
  {
    assert.strictEqual(isTestVideoAsset({
      description: "Introduction to Computer Architecture",
      bunnyVideoId: "5f3a9e21-0a44-4e3b-9a2c-97814b1c201a",
      provider: "bunny",
      type: "video"
    }), false);

    assert.strictEqual(isTestVideoAsset({
      description: "Chapter 3: Advanced Reactive State",
      bunnyVideoId: "8c41d990-2e8f-4121-87ab-4318c54178ea",
      provider: "bunny",
      type: "video"
    }), false);
    console.log("✓ Test 3: Strictly preserves legitimate course video assets");
  }

  // Test 4: Flags unlinked legacy Cloudflare stubs
  {
    assert.strictEqual(isTestVideoAsset({
      description: "Old Cloudflare Stream Video",
      provider: "cloudflare",
      cloudflareId: "test_cf_id",
      type: "video"
    }), true);
    console.log("✓ Test 4: Flags legacy Cloudflare test assets for audit");
  }

  console.log("------------------------------------------------------------------");
  console.log("  Test Video Cleanup Unit Tests: 4 passed, 0 failed.");
  console.log("==================================================================");
}

runTests();
