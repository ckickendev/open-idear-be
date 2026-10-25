const assert = require("assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const BunnyStreamClient = require("../services/bunnyStream.client");
const { BunnyStreamService } = require("../services/bunnyStream.services");
const { Media, Lesson, Course, Chapter, Enrollment } = require("../models");
const enrollmentService = require("../services/enrollment.services");
const { transcriptProvider } = require("../ai/course-intelligence/transcript.provider");

console.log("==================================================================");
console.log("  OPENIDEAR — SPRINT 4: SECURE BUNNY PLAYBACK & LEARNING TESTS");
console.log("==================================================================");

function createMockLessonWithCourse({
  lessonId = new mongoose.Types.ObjectId(),
  courseId = new mongoose.Types.ObjectId(),
  instructorId = new mongoose.Types.ObjectId(),
  isPublished = true,
  isFreePreview = false,
  mediaStatus = "ready",
  bunnyVideoId = "guid-secure-video-001",
} = {}) {
  const media = {
    _id: new mongoose.Types.ObjectId(),
    user: instructorId,
    url: bunnyVideoId,
    bunnyVideoId,
    bunnyLibraryId: "12345",
    provider: "bunny",
    status: mediaStatus,
    duration: 360,
    thumbnail: `https://video.openidear.xyz/${bunnyVideoId}/thumbnail.jpg`,
    save: async function () { return this; },
  };

  const course = {
    _id: courseId,
    instructor: instructorId,
    status: isPublished ? "published" : "draft",
    isPublished,
    title: "Secure Architecture 101",
  };

  const chapter = {
    _id: new mongoose.Types.ObjectId(),
    course,
  };

  const lesson = {
    _id: lessonId,
    title: "Lesson on Playback Hardening",
    isFreePreview,
    chapter,
    media,
    save: async function () { return this; },
  };

  return { lesson, course, chapter, media, instructorId, courseId, lessonId };
}

async function runSprint4Tests() {
  const mockClient = new BunnyStreamClient({
    libraryId: "12345",
    apiKey: "test-bunny-api-key",
    tokenSecurityKey: "test-token-security-key",
    cdnHostname: "video.openidear.xyz",
  });
  const service = new BunnyStreamService(mockClient);

  // ── Test 1: Unauthenticated playback request for locked lesson ───────────────
  {
    const { lesson, lessonId } = createMockLessonWithCourse({
      isPublished: true,
      isFreePreview: false,
    });

    const origFindOne = Lesson.findOne;
    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => lesson,
      }),
    });

    try {
      let caughtError = null;
      try {
        await service.getPlaybackConfig(lessonId.toString(), null);
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError, "Unauthenticated request for locked lesson must throw");
      assert.strictEqual(caughtError.statusCode, 401, "Must return HTTP 401");
      assert.strictEqual(caughtError.code, "UNAUTHENTICATED", "Must return UNAUTHENTICATED error code");
      console.log("✓ Test 1: Unauthenticated playback request for locked lesson throws 401 (UNAUTHENTICATED)");
    } finally {
      Lesson.findOne = origFindOne;
    }
  }

  // ── Test 2: Unenrolled user attempting to access locked lesson ────────────────
  {
    const studentUserId = new mongoose.Types.ObjectId();
    const { lesson, lessonId } = createMockLessonWithCourse({
      isPublished: true,
      isFreePreview: false,
    });

    const origLessonFindOne = Lesson.findOne;
    const origEnrollmentFindOne = Enrollment.findOne;

    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => lesson,
      }),
    });

    // Student has no active enrollment
    Enrollment.findOne = async () => null;

    try {
      let caughtError = null;
      try {
        await service.getPlaybackConfig(lessonId.toString(), studentUserId.toString());
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError, "Unenrolled user accessing locked lesson must throw");
      assert.strictEqual(caughtError.statusCode, 403, "Must return HTTP 403");
      assert.strictEqual(caughtError.code, "LESSON_LOCKED", "Must return LESSON_LOCKED error code");
      console.log("✓ Test 2: Unenrolled user playback request throws 403 (LESSON_LOCKED)");
    } finally {
      Lesson.findOne = origLessonFindOne;
      Enrollment.findOne = origEnrollmentFindOne;
    }
  }

  // ── Test 3: Free-preview lesson on published course grants access ────────────
  {
    const guestUserId = null;
    const { lesson, lessonId, media } = createMockLessonWithCourse({
      isPublished: true,
      isFreePreview: true,
      mediaStatus: "ready",
    });

    const origLessonFindOne = Lesson.findOne;
    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => lesson,
      }),
    });

    try {
      const result = await service.getPlaybackConfig(lessonId.toString(), guestUserId);

      assert.strictEqual(result.isAuthorized, true, "Free preview must be authorized");
      assert.strictEqual(result.isFreePreview, true, "isFreePreview must be true");
      assert.strictEqual(result.isReady, true, "Ready video must return isReady: true");
      assert(result.embedUrl.includes("token="), "Must generate signed token embed URL");
      assert(result.embedUrl.includes("expires="), "Must include token expiration parameter");
      console.log("✓ Test 3: Free-preview lesson on published course grants authorized access");
    } finally {
      Lesson.findOne = origLessonFindOne;
    }
  }

  // ── Test 4: Free-preview lesson on UNPUBLISHED course is denied to student ────
  {
    const studentUserId = new mongoose.Types.ObjectId();
    const { lesson, lessonId } = createMockLessonWithCourse({
      isPublished: false, // Course is unpublished draft
      isFreePreview: true,
    });

    const origLessonFindOne = Lesson.findOne;
    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => lesson,
      }),
    });

    try {
      let caughtError = null;
      try {
        await service.getPlaybackConfig(lessonId.toString(), studentUserId.toString());
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError, "Unpublished course preview must be denied to non-instructors");
      assert.strictEqual(caughtError.statusCode, 403, "Must return HTTP 403");
      assert.strictEqual(caughtError.code, "COURSE_UNPUBLISHED", "Must return COURSE_UNPUBLISHED error code");
      console.log("✓ Test 4: Unpublished course preview is strictly blocked (COURSE_UNPUBLISHED)");
    } finally {
      Lesson.findOne = origLessonFindOne;
    }
  }

  // ── Test 5: Instructor access to own unpublished course succeeds ─────────────
  {
    const { lesson, lessonId, instructorId } = createMockLessonWithCourse({
      isPublished: false,
      isFreePreview: false,
      mediaStatus: "ready",
    });

    const origLessonFindOne = Lesson.findOne;
    const origEnrollmentFindOne = Enrollment.findOne;
    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => lesson,
      }),
    });
    Enrollment.findOne = async () => null;

    try {
      const result = await service.getPlaybackConfig(lessonId.toString(), instructorId.toString());

      assert.strictEqual(result.isAuthorized, true, "Course instructor must be authorized on unpublished course");
      assert.strictEqual(result.isReady, true);
      assert(result.embedUrl.includes("player.mediadelivery.net"), "Embed URL must use Bunny embed player");
      assert(result.hlsUrl.includes("video.openidear.xyz"), "HLS URL must point to CDN hostname");
      console.log("✓ Test 5: Course instructor can preview own unpublished course lessons");
    } finally {
      Lesson.findOne = origLessonFindOne;
      Enrollment.findOne = origEnrollmentFindOne;
    }
  }

  // ── Test 6: Enrolled student gets short-lived tokenized playback access ──────
  {
    const studentUserId = new mongoose.Types.ObjectId();
    const { lesson, lessonId, courseId } = createMockLessonWithCourse({
      isPublished: true,
      isFreePreview: false,
      mediaStatus: "ready",
    });

    const origLessonFindOne = Lesson.findOne;
    const origEnrollmentFindOne = Enrollment.findOne;

    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => lesson,
      }),
    });

    Enrollment.findOne = async (query) => {
      if (query.user.toString() === studentUserId.toString() && query.course.toString() === courseId.toString()) {
        return {
          _id: new mongoose.Types.ObjectId(),
          user: studentUserId,
          course: courseId,
          status: "active",
        };
      }
      return null;
    };

    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const result = await service.getPlaybackConfig(lessonId.toString(), studentUserId.toString());

      assert.strictEqual(result.isAuthorized, true, "Enrolled student must be authorized");
      assert.strictEqual(result.isEnrolled, true, "isEnrolled must be true");
      assert.strictEqual(result.isReady, true);
      assert(result.embedUrl.includes("token="), "Must contain signed token");

      // Verify token expiration is short-lived: within ~3600 seconds (1 hour)
      const expiresDelta = result.expires - nowSeconds;
      assert(expiresDelta >= 3590 && expiresDelta <= 3610, `Expires delta should be ~3600s, got ${expiresDelta}`);
      console.log(`✓ Test 6: Enrolled student receives short-lived tokenized playback (expires in ${expiresDelta}s)`);
    } finally {
      Lesson.findOne = origLessonFindOne;
      Enrollment.findOne = origEnrollmentFindOne;
    }
  }

  // ── Test 7: Client arbitrary video ID injection prevention ─────────────────
  {
    const studentUserId = new mongoose.Types.ObjectId();
    const origLessonFindOne = Lesson.findOne;

    // Simulate client sending arbitrary nonexistent or forged lesson ID
    Lesson.findOne = () => ({
      populate: () => ({
        populate: async () => null, // lesson not found in DB
      }),
    });

    try {
      let caughtError = null;
      try {
        await service.getPlaybackConfig("67890ffff000000000000000", studentUserId.toString());
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError, "Supplying arbitrary ID not in database must fail");
      assert.strictEqual(caughtError.statusCode, 404, "Must reject with 404 Lesson not found");
      console.log("✓ Test 7: Arbitrary provider video ID injection prevented (strictly resolved via DB)");
    } finally {
      Lesson.findOne = origLessonFindOne;
    }
  }

  // ── Test 8: Cross-course upload authorization attempt blocked ──────────────
  {
    const legitInstructorId = new mongoose.Types.ObjectId();
    const attackerUserId = new mongoose.Types.ObjectId();
    const victimCourseId = new mongoose.Types.ObjectId();

    const victimCourse = {
      _id: victimCourseId,
      instructor: legitInstructorId,
      title: "Legitimate Course",
    };

    const origCourseFindOne = Course.findOne;
    Course.findOne = async () => victimCourse;

    try {
      let caughtError = null;
      try {
        await service.authorizeUpload(attackerUserId.toString(), {
          title: "Malicious Injection Video",
          courseId: victimCourseId.toString(),
        });
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError, "Cross-course upload attempt by non-instructor must throw");
      assert.strictEqual(caughtError.statusCode, 403, "Must return HTTP 403");
      assert.strictEqual(caughtError.code, "FORBIDDEN_COURSE_OWNER");
      console.log("✓ Test 8: Cross-course upload authorization blocked (FORBIDDEN_COURSE_OWNER)");
    } finally {
      Course.findOne = origCourseFindOne;
    }
  }

  // ── Test 9: Cross-user media record modification attempt blocked ────────────
  {
    const legitOwnerId = new mongoose.Types.ObjectId();
    const attackerUserId = new mongoose.Types.ObjectId();
    const victimVideoGuid = "guid-victim-video-789";

    const victimMedia = {
      _id: new mongoose.Types.ObjectId(),
      user: legitOwnerId,
      bunnyVideoId: victimVideoGuid,
      url: victimVideoGuid,
      status: "uploaded",
      save: async function () { return this; },
    };

    const origMediaFindOne = Media.findOne;
    Media.findOne = async () => victimMedia;

    try {
      let caughtError = null;
      try {
        await service.saveUploadedVideo(attackerUserId.toString(), {
          videoId: victimVideoGuid,
          title: "Hacked Title",
        });
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError, "Attacker updating another user's media must be rejected");
      assert.strictEqual(caughtError.statusCode, 403, "Must return HTTP 403");
      assert.strictEqual(caughtError.code, "FORBIDDEN_MEDIA_OWNER");
      console.log("✓ Test 9: Cross-user media modification blocked (FORBIDDEN_MEDIA_OWNER)");
    } finally {
      Media.findOne = origMediaFindOne;
    }
  }

  // ── Test 10: Cross-user video deletion attempt blocked ───────────────────────
  {
    const legitOwnerId = new mongoose.Types.ObjectId();
    const attackerUserId = new mongoose.Types.ObjectId();
    const mediaId = new mongoose.Types.ObjectId();

    const victimMedia = {
      _id: mediaId,
      user: legitOwnerId,
      bunnyVideoId: "guid-victim-video-delete",
      provider: "bunny",
    };

    const origMediaFindOne = Media.findOne;
    const origLessonFindOne = Lesson.findOne;

    Media.findOne = async () => victimMedia;
    Lesson.findOne = () => ({
      populate: async () => null, // Not linked to any lesson owned by attacker
    });

    try {
      let caughtError = null;
      try {
        await service.deleteVideoAsset(mediaId.toString(), attackerUserId.toString());
      } catch (err) {
        caughtError = err;
      }

      assert(caughtError, "Unauthorized deletion attempt must be rejected");
      assert.strictEqual(caughtError.statusCode, 403, "Must return HTTP 403");
      assert.strictEqual(caughtError.code, "FORBIDDEN_DELETE");
      console.log("✓ Test 10: Cross-user video asset deletion blocked (FORBIDDEN_DELETE)");
    } finally {
      Media.findOne = origMediaFindOne;
      Lesson.findOne = origLessonFindOne;
    }
  }

  // ── Test 11: Lesson progress & completion independent of provider URLs ──────
  {
    const studentUserId = new mongoose.Types.ObjectId();
    const courseId = new mongoose.Types.ObjectId();
    const lesson1Id = new mongoose.Types.ObjectId();
    const lesson2Id = new mongoose.Types.ObjectId();
    const chapterId = new mongoose.Types.ObjectId();

    const mockEnrollment = {
      _id: new mongoose.Types.ObjectId(),
      user: studentUserId,
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

    const mockLesson1 = {
      _id: lesson1Id,
      chapter: chapterId,
      del_flag: 0,
      learningObjectives: ["Understand Video Hardening"],
    };

    const mockChapter = {
      _id: chapterId,
      course: courseId,
      del_flag: 0,
    };

    const origEnrollmentFindOne = Enrollment.findOne;
    const origLessonFindOne = Lesson.findOne;
    const origChapterFindOne = Chapter.findOne;
    const origChapterFind = Chapter.find;
    const origCourseFindById = Course.findById;

    Enrollment.findOne = async () => mockEnrollment;
    Lesson.findOne = async () => mockLesson1;
    Chapter.findOne = async () => mockChapter;
    Chapter.find = () => ({
      populate: async () => [
        {
          _id: chapterId,
          lessons: [mockLesson1, { _id: lesson2Id, del_flag: 0 }],
        },
      ],
    });
    Course.findById = () => ({
      populate: async () => ({
        _id: courseId,
        chapters: [
          {
            _id: chapterId,
            lessons: [mockLesson1, { _id: lesson2Id, del_flag: 0 }],
          },
        ],
      }),
    });

    const models = require("../models");
    const origIntelligenceFindOne = models.LessonIntelligence.findOne;
    models.LessonIntelligence.findOne = () => ({
      sort: () => Promise.resolve(null),
    });

    const masteryService = require("../services/mastery.services");
    const origRecordEvidence = masteryService.recordEvidence;
    masteryService.recordEvidence = async () => ({ recorded: true });

    try {
      // Mark Lesson 1 as completed (1 of 2 total lessons = 50% progress)
      const result = await enrollmentService.completeLesson(
        studentUserId.toString(),
        courseId.toString(),
        lesson1Id.toString()
      );

      assert.strictEqual(mockEnrollment.completedLessons.length, 1);
      assert.strictEqual(mockEnrollment.completedLessons[0].toString(), lesson1Id.toString());
      assert.strictEqual(mockEnrollment.progress, 50, "Progress should be 50% (1 of 2 lessons)");
      assert.strictEqual(mockEnrollment.status, "active", "Course should remain active until 100%");
      assert.strictEqual(mockEnrollment.saveCount, 1, "Enrollment must be saved");
      console.log("✓ Test 11: Lesson progress and completion calculated independently of video provider URLs");
    } finally {
      Enrollment.findOne = origEnrollmentFindOne;
      Lesson.findOne = origLessonFindOne;
      Chapter.findOne = origChapterFindOne;
      Chapter.find = origChapterFind;
      Course.findById = origCourseFindById;
      models.LessonIntelligence.findOne = origIntelligenceFindOne;
      masteryService.recordEvidence = origRecordEvidence;
    }
  }

  // ── Test 12: AI Transcript & Caption integration fallback preservation ──────
  {
    const { providerRegistry } = require("../ai/provider");
    const origGetProvider = providerRegistry.getProvider;

    // Mock local AI provider to simulate immediate speech comprehension
    providerRegistry.getProvider = () => ({
      completeJSON: async () => ({
        data: {
          language: "en",
          fullText: "Hardening Distributed Video Streams. Today we examine tokenized URL signing and edge authorization.",
          segments: [
            { start: 0, end: 30, text: "Hardening Distributed Video Streams." },
            { start: 30, end: 120, text: "Today we examine tokenized URL signing and edge authorization." },
          ],
        },
      }),
    });

    try {
      const transcriptResult = await transcriptProvider.transcribe({
        bunnyVideoId: "guid-no-subtitles-video",
        title: "Hardening Distributed Video Streams",
        description: "Explaining HMAC token validation and CDN edge gating.",
        duration: 120,
      });

      assert(transcriptResult, "Transcript provider must return a valid transcript result");
      assert.strictEqual(transcriptResult.status, "ready", "Status must be ready");
      assert(transcriptResult.text.length > 0, "Transcript text must be populated");
      assert(Array.isArray(transcriptResult.segments), "Segments must be an array");
      assert(transcriptResult.segments.length > 0, "Must contain timestamped segments");
      console.log(`✓ Test 12: Transcript & AI lesson analysis fallback preserved (provider: ${transcriptResult.provider})`);
    } finally {
      providerRegistry.getProvider = origGetProvider;
    }
  }

  console.log("------------------------------------------------------------------");
  console.log("  Bunny Stream Security & Auth Tests: 12 passed, 0 failed.");
  console.log("==================================================================");
}

runSprint4Tests().catch((err) => {
  console.error("Sprint 4 Test Failure:", err);
  process.exit(1);
});
