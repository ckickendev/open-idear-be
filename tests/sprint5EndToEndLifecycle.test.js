const assert = require("assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const BunnyStreamClient = require("../services/bunnyStream.client");
const { BunnyStreamService } = require("../services/bunnyStream.services");
const { Media, Lesson, Course, Chapter, Enrollment } = require("../models");
const enrollmentService = require("../services/enrollment.services");

console.log("==================================================================");
console.log("  OPENIDEAR — SPRINT 5: FULL END-TO-END LIFECYCLE VERIFICATION");
console.log("==================================================================");

async function runSprint5E2ETest() {
  const libraryId = "782922";
  const apiKey = "test-api-key-sprint5";
  const tokenKey = "test-token-key-sprint5";
  const webhookSecret = "test-webhook-secret-sprint5";
  const cdnHostname = "video.openidear.xyz";

  const client = new BunnyStreamClient({
    libraryId,
    apiKey,
    tokenKey,
    webhookSecret,
    cdnHostname,
  });

  const service = new BunnyStreamService(client);

  // Entities
  const instructorId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const unenrolledStudentId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const chapterId = new mongoose.Types.ObjectId();
  const lesson1Id = new mongoose.Types.ObjectId(); // Locked lesson
  const lesson2Id = new mongoose.Types.ObjectId(); // Free preview lesson

  const mockCourse = {
    _id: courseId,
    instructor: instructorId,
    title: "Distributed Video Architecture",
    status: "draft",
    isPublished: false,
    save: async function () { return this; },
  };

  const mockChapter = {
    _id: chapterId,
    course: mockCourse,
    del_flag: 0,
  };

  let mockMedia1 = null;
  const mockLesson1 = {
    _id: lesson1Id,
    title: "Deep Dive into TUS Protocol",
    isFreePreview: false,
    chapter: mockChapter,
    media: null,
    save: async function () { return this; },
  };

  const mockLesson2 = {
    _id: lesson2Id,
    title: "Introduction to Media Delivery",
    isFreePreview: true,
    chapter: mockChapter,
    media: null,
    save: async function () { return this; },
  };

  // Database mock state
  const mediaStore = new Map();
  const enrollmentStore = new Map();

  const origMediaFindOne = Media.findOne;
  const origMediaSave = Media.prototype.save;
  const origLessonFindOne = Lesson.findOne;
  const origCourseFindOne = Course.findOne;
  const origCourseFindById = Course.findById;
  const origChapterFindOne = Chapter.findOne;
  const origEnrollmentFindOne = Enrollment.findOne;

  // Intercept Mongoose queries
  Media.findOne = async (query) => {
    for (const doc of mediaStore.values()) {
      if (query._id && doc._id.toString() === query._id.toString()) return doc;
      if (query.bunnyVideoId && doc.bunnyVideoId === query.bunnyVideoId) return doc;
      if (query.$or) {
        for (const cond of query.$or) {
          if (cond.bunnyVideoId && doc.bunnyVideoId === cond.bunnyVideoId) return doc;
          if (cond.url && doc.url === cond.url) return doc;
        }
      }
    }
    return null;
  };

  Media.prototype.save = async function () {
    mediaStore.set(this._id.toString(), this);
    return this;
  };

  Lesson.findOne = (query) => ({
    populate: () => ({
      populate: async () => {
        if (query._id.toString() === lesson1Id.toString()) return mockLesson1;
        if (query._id.toString() === lesson2Id.toString()) return mockLesson2;
        return null;
      },
    }),
  });

  Course.findOne = async () => mockCourse;
  Course.findById = () => ({
    populate: async () => ({
      _id: courseId,
      chapters: [
        {
          _id: chapterId,
          lessons: [mockLesson1, mockLesson2],
        },
      ],
    }),
  });

  Chapter.findOne = async () => mockChapter;

  Enrollment.findOne = async (query) => {
    const key = `${query.user.toString()}_${query.course.toString()}`;
    return enrollmentStore.get(key) || null;
  };

  try {
    // ── Step 1: Creator Upload Authorization ──────────────────────────────────
    let createdBunnyGuid = "guid-bunny-e2e-8888";
    client.createVideo = async () => ({ guid: createdBunnyGuid });

    const uploadAuth = await service.authorizeUpload(instructorId.toString(), {
      title: "Deep Dive into TUS Protocol",
      courseId: courseId.toString(),
      lessonId: lesson1Id.toString(),
    });

    assert(uploadAuth.signature, "Must return TUS signature");
    assert.strictEqual(uploadAuth.videoId, createdBunnyGuid);
    assert.strictEqual(uploadAuth.uploadEndpoint, "https://video.bunnycdn.com/tusupload");
    console.log("✓ Step 1: Creator successfully authorized TUS upload with ownership validation");

    // ── Step 2: Direct Upload Finished & Metadata Saved (Processing State) ────
    client.getVideo = async () => ({
      guid: createdBunnyGuid,
      status: "processing",
      statusCode: 2,
      duration: 0,
    });

    const savedMedia = await service.saveUploadedVideo(instructorId.toString(), {
      videoId: createdBunnyGuid,
      title: "Deep Dive into TUS Protocol",
    });

    assert.strictEqual(savedMedia.status, "processing", "Must start in processing state");
    mockLesson1.media = savedMedia;
    console.log("✓ Step 2: Direct upload finalized and persisted; status gated in processing");

    // ── Step 3: Webhook Readiness & Metadata Enrichment ─────────────────────────
    const webhookPayload = {
      VideoGuid: createdBunnyGuid,
      Status: 3, // Ready
      VideoLibraryId: parseInt(libraryId),
    };

    client.getVideo = async () => ({
      guid: createdBunnyGuid,
      status: "ready",
      statusCode: 3,
      duration: 480,
    });

    const payloadString = JSON.stringify(webhookPayload);
    const validSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payloadString)
      .digest("hex");

    const webhookResult = await service.handleWebhook(webhookPayload, validSignature);
    assert.strictEqual(webhookResult.status, "ready", "Status must transition to ready");
    assert.strictEqual(savedMedia.status, "ready", "Media doc must be ready");
    assert.strictEqual(savedMedia.duration, 480, "Duration must be enriched");
    console.log("✓ Step 3: Authenticated webhook processed; video promoted to ready (480s)");

    // ── Step 4: Course Publish ────────────────────────────────────────────────
    mockCourse.status = "published";
    mockCourse.isPublished = true;
    console.log("✓ Step 4: Course published by instructor");

    // ── Step 5: Unauthorized Access Blocked ───────────────────────────────────
    let unauthError = null;
    try {
      await service.getPlaybackConfig(lesson1Id.toString(), unenrolledStudentId.toString());
    } catch (err) {
      unauthError = err;
    }
    assert(unauthError, "Unenrolled access to locked lesson must throw");
    assert.strictEqual(unauthError.statusCode, 403);
    assert.strictEqual(unauthError.code, "LESSON_LOCKED");
    console.log("✓ Step 5: Unenrolled student playback strictly blocked (403 LESSON_LOCKED)");

    // ── Step 6: Free Preview Playback Authorized ──────────────────────────────
    mockLesson2.media = savedMedia; // attach ready media to preview lesson
    const previewPlayback = await service.getPlaybackConfig(lesson2Id.toString(), null);
    assert.strictEqual(previewPlayback.isAuthorized, true);
    assert.strictEqual(previewPlayback.isFreePreview, true);
    assert(previewPlayback.embedUrl.includes("token="), "Must contain signed token");
    console.log("✓ Step 6: Free-preview playback authorized with short-lived signed embed URL");

    // ── Step 7: Enrollment & Authorized Student Playback ──────────────────────
    const enrollmentDoc = {
      _id: new mongoose.Types.ObjectId(),
      user: studentId,
      course: courseId,
      status: "active",
      completedLessons: [],
      progress: 0,
      saveCount: 0,
      save: async function () {
        this.saveCount += 1;
        return this;
      },
    };
    enrollmentStore.set(`${studentId.toString()}_${courseId.toString()}`, enrollmentDoc);

    const studentPlayback = await service.getPlaybackConfig(lesson1Id.toString(), studentId.toString());
    assert.strictEqual(studentPlayback.isAuthorized, true);
    assert.strictEqual(studentPlayback.isEnrolled, true);
    assert(studentPlayback.embedUrl.includes("token="));
    assert(studentPlayback.expires > Math.floor(Date.now() / 1000));
    console.log("✓ Step 7: Enrolled student granted authorized playback with short-lived token");

    // ── Step 8: Lesson Progress and Completion ────────────────────────────────
    const models = require("../models");
    models.LessonIntelligence.findOne = () => ({ sort: () => Promise.resolve(null) });
    const masteryService = require("../services/mastery.services");
    masteryService.recordEvidence = async () => ({ recorded: true });

    const completionResult = await enrollmentService.completeLesson(
      studentId.toString(),
      courseId.toString(),
      lesson1Id.toString()
    );

    assert.strictEqual(enrollmentDoc.completedLessons.length, 1);
    assert.strictEqual(enrollmentDoc.progress, 50, "1 of 2 lessons = 50% progress");
    assert.strictEqual(enrollmentDoc.saveCount, 1);
    console.log("✓ Step 8: Student progress updated to 50% independently of video provider URLs");

    console.log("------------------------------------------------------------------");
    console.log("  Sprint 5 End-to-End Lifecycle Verification: ALL 8 STEPS PASSED");
    console.log("==================================================================");
  } finally {
    Media.findOne = origMediaFindOne;
    Media.prototype.save = origMediaSave;
    Lesson.findOne = origLessonFindOne;
    Course.findOne = origCourseFindOne;
    Course.findById = origCourseFindById;
    Chapter.findOne = origChapterFindOne;
    Enrollment.findOne = origEnrollmentFindOne;
  }
}

runSprint5E2ETest().catch((err) => {
  console.error("Sprint 5 E2E Failure:", err);
  process.exit(1);
});
