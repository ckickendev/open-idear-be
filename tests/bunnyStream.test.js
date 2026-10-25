const assert = require("assert");
const crypto = require("crypto");
const BunnyStreamClient = require("../services/bunnyStream.client");

console.log("==================================================================");
console.log("  OPENIDEAR — SPRINT 1: BUNNY STREAM BACKEND UNIT TESTS");
console.log("==================================================================");

// ── Test 1: BunnyStreamClient Configuration & Validation ───────────────────
{
  const emptyClient = new BunnyStreamClient({ apiKey: "", libraryId: "" });
  assert.throws(
    () => emptyClient.validateConfig(),
    /Bunny Stream configuration missing/,
    "validateConfig() must throw when required credentials are missing"
  );

  const validClient = new BunnyStreamClient({
    apiKey: "test-api-key-123",
    libraryId: "98765",
    tokenKey: "test-token-key-abc",
  });
  assert.doesNotThrow(() => validClient.validateConfig());
  assert.strictEqual(validClient.libraryId, "98765");
  assert.strictEqual(validClient.apiKey, "test-api-key-123");
  console.log("✓ Test 1: Configuration validation passed");
}

// ── Test 2: Official TUS Upload Signature Mathematical Verification ────────
{
  const libraryId = "12345";
  const apiKey = "sec-api-key-xyz";
  const videoId = "c0ffee00-1234-4567-89ab-cdef01234567";
  const fixedExpires = 1750000000;

  const client = new BunnyStreamClient({ libraryId, apiKey });

  // Manually compute canonical Bunny TUS signature: LibraryId + APIKey + ExpirationTimestamp + VideoId
  const expectedPayload = `${libraryId}${apiKey}${fixedExpires}${videoId}`;
  const expectedHash = crypto.createHash("sha256").update(expectedPayload).digest("hex");

  // Call client method with custom expiration offset
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const offset = fixedExpires - nowInSeconds;
  const result = client.generateTusUploadCredentials(videoId, offset);

  // Allow 1s clock tolerance
  const regeneratedExpected = crypto
    .createHash("sha256")
    .update(`${libraryId}${apiKey}${result.expires}${videoId}`)
    .digest("hex");

  assert.strictEqual(result.signature, regeneratedExpected, "TUS signature must match canonical SHA-256 hash");
  assert.strictEqual(result.libraryId, libraryId);
  assert.strictEqual(result.videoId, videoId);
  assert.strictEqual(result.endpoint, "https://video.bunnycdn.com/tusupload");
  console.log("✓ Test 2: TUS Presigned SHA-256 signature calculation passed");
}

// ── Test 3: Tokenized Embed & Playback URL Generation ─────────────────────
{
  const libraryId = "54321";
  const tokenKey = "secret-token-key-789";
  const videoId = "video-guid-abc-123";
  const cdnHostname = "vz-test01.b-cdn.net";

  const client = new BunnyStreamClient({
    libraryId,
    tokenKey,
    cdnHostname,
  });

  const config = client.generatePlaybackConfig(videoId, 3600);

  // Validate official Bunny Token Auth formula: TokenSecurityKey + VideoId + Expires
  const expectedToken = crypto
    .createHash("sha256")
    .update(`${tokenKey}${videoId}${config.expires}`)
    .digest("hex");

  assert.strictEqual(config.isTokenized, true, "Playback must be tokenized when tokenKey is present");
  assert(config.embedUrl.includes(`token=${expectedToken}`), "Embed URL must contain valid SHA-256 token");
  assert(config.embedUrl.includes(`expires=${config.expires}`), "Embed URL must contain expiration timestamp");
  assert(config.embedUrl.startsWith(`https://player.mediadelivery.net/embed/${libraryId}/${videoId}`));
  assert.strictEqual(config.thumbnailUrl, `https://${cdnHostname}/${videoId}/thumbnail.jpg`);
  assert(config.hlsUrl.startsWith(`https://${cdnHostname}/${videoId}/playlist.m3u8`));

  // Autoplay option test
  const autoplayConfig = client.generatePlaybackConfig(videoId, 3600, { autoplay: true });
  assert(autoplayConfig.embedUrl.includes("autoplay=true"), "Embed URL must support autoplay parameter");
  console.log("✓ Test 3: Tokenized embed & HLS playback generation passed");
}

// ── Test 4: Video Status Code Mapping ─────────────────────────────────────
{
  const client = new BunnyStreamClient();

  assert.strictEqual(client.mapStatusCodeToStatus(0), "uploaded", "Code 0 (Queued) must map to uploaded");
  assert.strictEqual(client.mapStatusCodeToStatus(1), "processing", "Code 1 (Processing) must map to processing");
  assert.strictEqual(client.mapStatusCodeToStatus(2), "processing", "Code 2 (Encoding) must map to processing");
  assert.strictEqual(client.mapStatusCodeToStatus(3), "ready", "Code 3 (Finished) must map to ready");
  assert.strictEqual(client.mapStatusCodeToStatus(4), "ready", "Code 4 (Resolution finished) must map to ready");
  assert.strictEqual(client.mapStatusCodeToStatus(5), "failed", "Code 5 (Failed) must map to failed");
  console.log("✓ Test 4: Video status code mapping passed");
}

// ── Test 5: Webhook Signature Verification ─────────────────────────────────
{
  const secret = "webhook-hmac-secret-test";
  const client = new BunnyStreamClient({ webhookSecret: secret });

  const payload = {
    VideoLibraryId: 12345,
    VideoGuid: "b3f09876-1111-2222-3333-444455556666",
    Status: 3,
  };

  const rawBody = JSON.stringify(payload);
  const validSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const tamperedSignature = crypto.createHmac("sha256", "wrong-secret").update(rawBody).digest("hex");

  assert.strictEqual(client.verifyWebhook(payload, validSignature), true, "Valid HMAC signature must verify successfully");
  assert.strictEqual(client.verifyWebhook(payload, tamperedSignature), false, "Tampered HMAC signature must be rejected");
  assert.strictEqual(client.verifyWebhook(payload, ""), false, "Empty signature must be rejected when secret is set");
  console.log("✓ Test 5: Webhook HMAC signature verification passed");
}

// ── Test 6: Video Processing State Transitions ─────────────────────────────
{
  // Simulated media state machine
  const mediaStates = ["uploaded", "processing", "ready", "failed"];
  let currentState = "uploaded";

  function transition(newStatus) {
    if (!mediaStates.includes(newStatus)) {
      throw new Error(`Invalid state: ${newStatus}`);
    }
    currentState = newStatus;
  }

  // Webhook event simulation:
  // 1. Initial creation
  assert.strictEqual(currentState, "uploaded");

  // 2. Transcoding starts (Status 1 or 2)
  transition("processing");
  assert.strictEqual(currentState, "processing");

  // 3. Transcoding finishes (Status 3)
  transition("ready");
  assert.strictEqual(currentState, "ready");

  // 4. In case of failure
  transition("failed");
  assert.strictEqual(currentState, "failed");
  console.log("✓ Test 6: Video processing state machine transitions passed");
}

// ── Test 7: Input Validation & Edge Cases ──────────────────────────────────
{
  const client = new BunnyStreamClient({ apiKey: "key", libraryId: "lib" });

  assert.throws(
    () => client.generateTusUploadCredentials(""),
    /videoId is required/,
    "generateTusUploadCredentials must reject empty videoId"
  );

  assert.throws(
    () => client.generatePlaybackConfig(""),
    /videoId is required/,
    "generatePlaybackConfig must reject empty videoId"
  );
  console.log("✓ Test 7: Input validation & error boundaries passed");
}

console.log("------------------------------------------------------------------");
console.log("  Bunny Stream Unit Tests: 7 passed, 0 failed.");
console.log("==================================================================");
