const assert = require("assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const BunnyStreamClient = require("../services/bunnyStream.client");
const bunnyStreamServiceModule = require("../services/bunnyStream.services");
const BunnyStreamService = bunnyStreamServiceModule.BunnyStreamService;
const { Media, Lesson, Enrollment } = require("../models");

console.log("==================================================================");
console.log("  OPENIDEAR — SPRINT 2: BUNNY STREAM UPLOAD PIPELINE & WEBHOOKS");
console.log("==================================================================");

// Helper to create mock Mongoose model document
function createMockMediaDoc(initialData) {
  const doc = {
    _id: initialData._id || new mongoose.Types.ObjectId(),
    user: initialData.user,
    url: initialData.url || initialData.bunnyVideoId,
    bunnyVideoId: initialData.bunnyVideoId,
    bunnyLibraryId: initialData.bunnyLibraryId || "99999",
    provider: initialData.provider || "bunny",
    type: "video",
    description: initialData.description || "",
    status: initialData.status || "uploaded",
    duration: initialData.duration || 0,
    thumbnail: initialData.thumbnail || "",
    errorMessage: initialData.errorMessage || "",
    idempotencyKey: initialData.idempotencyKey,
    uploadExpiresAt: initialData.uploadExpiresAt || new Date(Date.now() + 86400 * 1000),
    saveCount: 0,
    save: async function () {
      this.saveCount += 1;
      return this;
    },
  };
  return doc;
}

async function runTests() {
  // ── Test 1: Upload Session Idempotency (Deduplication) ───────────────────────
  {
    const userId = new mongoose.Types.ObjectId();
    const idempotencyKey = "upload-chapter1-lesson2-v1";
    const existingVideoGuid = "guid-existing-video-1234";

    let remoteCreateVideoCalled = false;
    const mockClient = new BunnyStreamClient({
      libraryId: "12345",
      apiKey: "test-api-key",
    });
    mockClient.createVideo = async () => {
      remoteCreateVideoCalled = true;
      return { guid: "guid-new-video-9999" };
    };

    const service = new BunnyStreamService(mockClient);

    const existingDoc = createMockMediaDoc({
      user: userId,
      bunnyVideoId: existingVideoGuid,
      status: "uploaded",
      idempotencyKey,
      uploadExpiresAt: new Date(Date.now() + 3600 * 1000), // still valid
    });

    const originalFindOne = Media.findOne;
    Media.findOne = async (query) => {
      if (query.idempotencyKey === idempotencyKey) {
        return existingDoc;
      }
      return null;
    };

    try {
      const result = await service.authorizeUpload(userId, {
        title: "Introduction to Clean Code",
        idempotencyKey,
      });

      assert.strictEqual(remoteCreateVideoCalled, false, "Remote createVideo must NOT be called on idempotent retry");
      assert.strictEqual(result.isReused, true, "isReused must be true on idempotent match");
      assert.strictEqual(result.videoId, existingVideoGuid, "Must return the existing Bunny video GUID");
      assert(result.signature, "Must generate fresh TUS credentials");
      assert.strictEqual(existingDoc.saveCount, 1, "Must update uploadExpiresAt on existing media doc");
      console.log("✓ Test 1: Upload session idempotency (deduplication) passed");
    } finally {
      Media.findOne = originalFindOne;
    }
  }

  // ── Test 2: Upload Session Creation with New Key ─────────────────────────────
  {
    const userId = new mongoose.Types.ObjectId();
    const idempotencyKey = "fresh-session-key-456";
    const generatedGuid = "guid-new-container-5678";

    let remoteCreateVideoCalled = false;
    const mockClient = new BunnyStreamClient({
      libraryId: "12345",
      apiKey: "test-api-key",
    });
    mockClient.createVideo = async ({ title }) => {
      remoteCreateVideoCalled = true;
      return { guid: generatedGuid, title };
    };

    const service = new BunnyStreamService(mockClient);

    const originalFindOne = Media.findOne;
    let savedDoc = null;
    const originalSave = Media.prototype.save;
    Media.findOne = async () => null; // No match found
    Media.prototype.save = async function () {
      savedDoc = this;
      return this;
    };

    try {
      const result = await service.authorizeUpload(userId, {
        title: "Advanced TypeScript Architectures",
        idempotencyKey,
      });

      assert.strictEqual(remoteCreateVideoCalled, true, "createVideo must be called for new idempotency key");
      assert.strictEqual(result.isReused, false, "isReused must be false for new container");
      assert.strictEqual(result.videoId, generatedGuid);
      assert.strictEqual(savedDoc.status, "uploaded", "Initial status must be 'uploaded'");
      assert.strictEqual(savedDoc.idempotencyKey, idempotencyKey);
      console.log("✓ Test 2: New upload session authorization passed");
    } finally {
      Media.findOne = originalFindOne;
      Media.prototype.save = originalSave;
    }
  }

  // ── Test 3: Client Cannot Fake Video Readiness ──────────────────────────────
  {
    const userId = new mongoose.Types.ObjectId();
    const videoId = "guid-unverified-video-789";

    const mockClient = new BunnyStreamClient({
      libraryId: "12345",
      apiKey: "test-api-key",
    });
    // Remote provider reports video is still encoding (Status 2 = Encoding)
    mockClient.getVideo = async () => ({
      guid: videoId,
      statusCode: 2,
      status: "processing",
      encodeProgress: 45,
      duration: 0,
    });

    const service = new BunnyStreamService(mockClient);

    const mediaDoc = createMockMediaDoc({
      user: userId,
      bunnyVideoId: videoId,
      status: "uploaded",
    });

    const originalFindOne = Media.findOne;
    Media.findOne = async () => mediaDoc;

    try {
      // Client attempts to save and claim video is done
      const saved = await service.saveUploadedVideo(userId, {
        videoId,
        title: "Hacked Ready Lesson",
        duration: 120, // Client claimed 120 seconds
      });

      // Verification must strictly enforce processing status
      assert.strictEqual(
        saved.status,
        "processing",
        "Status must remain 'processing' when provider reports video is still encoding"
      );
      assert.notStrictEqual(saved.status, "ready", "Client cannot fake 'ready' status");
      console.log("✓ Test 3: Client status manipulation guard passed (no fake ready)");
    } finally {
      Media.findOne = originalFindOne;
    }
  }

  // ── Test 4: Provider-Verified Readiness Updates Metadata ─────────────────────
  {
    const userId = new mongoose.Types.ObjectId();
    const videoId = "guid-ready-video-333";

    const mockClient = new BunnyStreamClient({
      libraryId: "12345",
      apiKey: "test-api-key",
      cdnHostname: "vz-test.b-cdn.net",
    });
    // Remote provider reports finished encoding (Status 3 = Finished)
    mockClient.getVideo = async () => ({
      guid: videoId,
      statusCode: 3,
      status: "ready",
      encodeProgress: 100,
      duration: 345, // Official 345s
      width: 1920,
      height: 1080,
    });

    const service = new BunnyStreamService(mockClient);

    const mediaDoc = createMockMediaDoc({
      user: userId,
      bunnyVideoId: videoId,
      status: "processing",
    });

    const originalFindOne = Media.findOne;
    Media.findOne = async () => mediaDoc;

    try {
      const saved = await service.saveUploadedVideo(userId, {
        videoId,
        title: "Verified Ready Lesson",
      });

      assert.strictEqual(saved.status, "ready", "Status must transition to 'ready' when verified with provider");
      assert.strictEqual(saved.duration, 345, "Duration must be enriched from provider");
      assert.strictEqual(saved.thumbnail, `https://vz-test.b-cdn.net/${videoId}/thumbnail.jpg`);
      console.log("✓ Test 4: Provider-verified readiness update passed");
    } finally {
      Media.findOne = originalFindOne;
    }
  }

  // ── Test 5: Playback Gating for Unready Videos ───────────────────────────────
  {
    const userId = new mongoose.Types.ObjectId();
    const lessonId = new mongoose.Types.ObjectId();
    const videoId = "guid-encoding-video-555";

    const mockClient = new BunnyStreamClient({
      libraryId: "12345",
      apiKey: "test-api-key",
      tokenKey: "token-secret-xyz",
    });
    mockClient.getVideo = async () => ({
      guid: videoId,
      statusCode: 1, // Still processing
      status: "processing",
      encodeProgress: 10,
      duration: 0,
    });

    const service = new BunnyStreamService(mockClient);

    const unreadyMedia = createMockMediaDoc({
      bunnyVideoId: videoId,
      status: "processing",
    });

    const mockLesson = {
      _id: lessonId,
      title: "Processing Lesson",
      isFreePreview: true,
      media: unreadyMedia,
      chapter: {
        course: {
          _id: new mongoose.Types.ObjectId(),
          instructor: userId,
        },
      },
    };

    const originalLessonFindOne = Lesson.findOne;
    const originalEnrollmentFindOne = Enrollment.findOne;
    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => mockLesson,
      }),
    });
    Enrollment.findOne = async () => null;

    try {
      const playback = await service.getPlaybackConfig(lessonId.toString(), userId);

      assert.strictEqual(playback.isReady, false, "isReady must be false while video is encoding");
      assert.strictEqual(playback.embedUrl, undefined, "embedUrl must NOT be exposed for unready video");
      assert.strictEqual(playback.hlsUrl, undefined, "hlsUrl must NOT be exposed for unready video");
      assert(playback.message.includes("currently encoding"), "Must provide informative message");
      console.log("✓ Test 5: Playback gating for unready video passed");
    } finally {
      Lesson.findOne = originalLessonFindOne;
      Enrollment.findOne = originalEnrollmentFindOne;
    }
  }

  // ── Test 6: Webhook HMAC-SHA256 Signature Authentication ────────────────────
  {
    const webhookSecret = "super-secret-bunny-webhook-key";
    const client = new BunnyStreamClient({
      libraryId: "12345",
      apiKey: "api-key",
      webhookSecret,
    });
    const service = new BunnyStreamService(client);

    const payload = {
      VideoLibraryId: 12345,
      VideoGuid: "guid-webhook-test-001",
      Status: 3,
    };
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");

    // Calculate valid HMAC-SHA256
    const validSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const invalidSignature = crypto.createHmac("sha256", "wrong-secret").update(rawBody).digest("hex");

    const mediaDoc = createMockMediaDoc({
      bunnyVideoId: "guid-webhook-test-001",
      status: "processing",
    });
    client.getVideo = async () => ({
      guid: "guid-webhook-test-001",
      statusCode: 3,
      status: "ready",
      duration: 210,
    });

    const originalFindOne = Media.findOne;
    Media.findOne = async () => mediaDoc;

    try {
      // 1. Invalid signature must reject with 401
      await assert.rejects(
        async () => service.handleWebhook(rawBody, invalidSignature),
        (err) => err.statusCode === 401,
        "Webhook with invalid signature must throw 401"
      );

      // 2. Valid signature must succeed
      const result = await service.handleWebhook(rawBody, validSignature);
      assert.strictEqual(result.received, true);
      assert.strictEqual(result.updated, true);
      assert.strictEqual(result.status, "ready");
      assert.strictEqual(mediaDoc.status, "ready");
      console.log("✓ Test 6: Webhook HMAC-SHA256 signature authentication passed");
    } finally {
      Media.findOne = originalFindOne;
    }
  }

  // ── Test 7: Webhook Out-of-Order Event Protection ───────────────────────────
  {
    const client = new BunnyStreamClient({ libraryId: "12345", apiKey: "api-key" });
    const service = new BunnyStreamService(client);

    const videoGuid = "guid-out-of-order-video";
    // Media is ALREADY ready
    const readyMedia = createMockMediaDoc({
      bunnyVideoId: videoGuid,
      status: "ready",
      duration: 300,
    });

    const originalFindOne = Media.findOne;
    Media.findOne = async () => readyMedia;

    try {
      // Incoming delayed event: Status 2 (Encoding) arrives after Status 3 (Finished)
      const delayedPayload = {
        VideoLibraryId: 12345,
        VideoGuid: videoGuid,
        Status: 2, // Encoding
      };

      const result = await service.handleWebhook(delayedPayload, "");

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.updated, false, "Must not update/regress ready state");
      assert.strictEqual(readyMedia.status, "ready", "Video MUST remain 'ready' despite delayed event");
      assert(result.reason.includes("out-of-order"), "Reason must note out-of-order event");
      console.log("✓ Test 7: Webhook out-of-order protection (no regression) passed");
    } finally {
      Media.findOne = originalFindOne;
    }
  }

  // ── Test 8: Webhook Duplicate Event Idempotency ──────────────────────────────
  {
    const client = new BunnyStreamClient({ libraryId: "12345", apiKey: "api-key" });
    const service = new BunnyStreamService(client);

    const videoGuid = "guid-duplicate-video";
    const readyMedia = createMockMediaDoc({
      bunnyVideoId: videoGuid,
      status: "ready",
      duration: 180,
    });

    const originalFindOne = Media.findOne;
    Media.findOne = async () => readyMedia;

    try {
      // Bunny retries sending Status: 3
      const duplicatePayload = {
        VideoLibraryId: 12345,
        VideoGuid: videoGuid,
        Status: 3,
      };

      const result = await service.handleWebhook(duplicatePayload, "");

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.updated, false, "Duplicate ready event must be an idempotent no-op");
      assert.strictEqual(readyMedia.status, "ready");
      assert.strictEqual(readyMedia.saveCount, 0, "Should not needlessly re-save document");
      console.log("✓ Test 8: Webhook duplicate event idempotency passed");
    } finally {
      Media.findOne = originalFindOne;
    }
  }

  // ── Test 9: Webhook Failure Event Handling ──────────────────────────────────
  {
    const client = new BunnyStreamClient({ libraryId: "12345", apiKey: "api-key" });
    const service = new BunnyStreamService(client);

    const videoGuid = "guid-failed-video";
    const mediaDoc = createMockMediaDoc({
      bunnyVideoId: videoGuid,
      status: "processing",
    });

    const originalFindOne = Media.findOne;
    Media.findOne = async () => mediaDoc;

    try {
      // Bunny reports Status 5 (Failed)
      const failurePayload = {
        VideoLibraryId: 12345,
        VideoGuid: videoGuid,
        Status: 5,
        ErrorMessage: "Encoding failed due to corrupt input codec.",
      };

      const result = await service.handleWebhook(failurePayload, "");

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.updated, true);
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(mediaDoc.status, "failed");
      assert.strictEqual(mediaDoc.errorMessage, "Encoding failed due to corrupt input codec.");
      console.log("✓ Test 9: Webhook failure event handling passed");
    } finally {
      Media.findOne = originalFindOne;
    }
  }

  console.log("------------------------------------------------------------------");
  console.log("  Bunny Stream Upload Pipeline Tests: 9 passed, 0 failed.");
  console.log("==================================================================");
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
