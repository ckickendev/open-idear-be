const mongoose = require("mongoose");
const { Service } = require("../core");
const BunnyStreamClient = require("./bunnyStream.client");
const { Media, Lesson, Course, Enrollment } = require("../models");

class BunnyStreamService extends Service {
  constructor(clientInstance = null) {
    super();
    this.client = clientInstance || new BunnyStreamClient();
  }

  /**
   * Authorizes a direct-to-Bunny client TUS upload.
   * Creates the remote video container and prepares a pending Media document.
   *
   * @param {string|ObjectId} userId
   * @param {Object} params
   * @param {string} params.title - Lesson or video title
   * @param {string} [params.collectionId] - Optional Bunny collection ID
  /**
   * Authorizes a direct-to-Bunny client TUS upload.
   * Creates the remote video container and prepares a pending Media document.
   * If an active idempotencyKey is provided, reuses the existing container to prevent duplicates.
   * Enforces course and lesson ownership if courseId or lessonId is provided.
   *
   * @param {string|ObjectId} userId
   * @param {Object} params
   * @param {string} params.title - Lesson or video title
   * @param {string} [params.collectionId] - Optional Bunny collection ID
   * @param {string} [params.idempotencyKey] - Optional client idempotency key
   * @param {string} [params.courseId] - Optional Course ID to enforce instructor ownership
   * @param {string} [params.lessonId] - Optional Lesson ID to enforce lesson ownership
   * @returns {Promise<Object>} Presigned TUS upload credentials and media reference
   */
  async authorizeUpload(userId, { title, collectionId = null, idempotencyKey = null, courseId = null, lessonId = null }) {
    if (!userId) throw new Error("userId is required to authorize video upload.");
    if (!title || !title.trim()) throw new Error("Title is required for video upload.");

    // 1. Enforce Course Ownership if courseId is specified
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, del_flag: 0 });
      if (!course) {
        const error = new Error("Course not found");
        error.statusCode = 404;
        throw error;
      }
      if (course.instructor && course.instructor.toString() !== userId.toString()) {
        const error = new Error("Unauthorized: You are not the instructor of this course.");
        error.statusCode = 403;
        error.code = "FORBIDDEN_COURSE_OWNER";
        throw error;
      }
    }

    // 2. Enforce Lesson Ownership if lessonId is specified
    if (lessonId) {
      const lesson = await Lesson.findOne({ _id: lessonId, del_flag: 0 }).populate({
        path: "chapter",
        select: "course",
        populate: { path: "course", select: "instructor" },
      });
      if (!lesson) {
        const error = new Error("Lesson not found");
        error.statusCode = 404;
        throw error;
      }
      const instructorId = lesson.chapter?.course?.instructor?.toString();
      if (instructorId && instructorId !== userId.toString()) {
        const error = new Error("Unauthorized: You do not have permission to modify this lesson.");
        error.statusCode = 403;
        error.code = "FORBIDDEN_LESSON_OWNER";
        throw error;
      }
    }

    const normalizedTitle = title.trim();

    // 3. Check for existing active upload session if idempotencyKey is provided
    if (idempotencyKey) {
      const existingMedia = await Media.findOne({
        user: userId,
        idempotencyKey,
        status: { $in: ["uploaded", "processing"] },
      });

      if (existingMedia && existingMedia.bunnyVideoId) {
        const now = new Date();
        const isNotExpired = !existingMedia.uploadExpiresAt || existingMedia.uploadExpiresAt > now;

        if (isNotExpired) {
          // Re-generate fresh TUS credentials for the existing video container
          const tusCredentials = this.client.generateTusUploadCredentials(existingMedia.bunnyVideoId, 86400);
          existingMedia.uploadExpiresAt = new Date(Date.now() + 86400 * 1000);
          await existingMedia.save();

          console.log(`[BunnyStreamService] Idempotency match for key "${idempotencyKey}". Reusing video container ${existingMedia.bunnyVideoId}`);

          return {
            mediaId: existingMedia._id.toString(),
            videoId: existingMedia.bunnyVideoId,
            libraryId: tusCredentials.libraryId,
            signature: tusCredentials.signature,
            expires: tusCredentials.expires,
            uploadEndpoint: tusCredentials.endpoint,
            title: existingMedia.description || normalizedTitle,
            isReused: true,
          };
        }
      }
    }

    // 4. Create new video object on Bunny Stream
    const bunnyVideo = await this.client.createVideo({
      title: normalizedTitle,
      collectionId,
    });

    const videoId = bunnyVideo.guid;

    // 5. Generate time-limited pre-signed TUS upload signature (24h validity)
    const tusCredentials = this.client.generateTusUploadCredentials(videoId, 86400);

    // 6. Pre-create local Media document in "uploaded" state
    const media = new Media({
      _id: new mongoose.Types.ObjectId(),
      user: userId,
      url: videoId,
      bunnyVideoId: videoId,
      bunnyLibraryId: this.client.libraryId,
      provider: "bunny",
      type: "video",
      description: normalizedTitle,
      status: "uploaded",
      duration: 0,
      idempotencyKey: idempotencyKey || undefined,
      uploadExpiresAt: new Date(Date.now() + 86400 * 1000),
    });

    await media.save();

    return {
      mediaId: media._id.toString(),
      videoId,
      libraryId: tusCredentials.libraryId,
      signature: tusCredentials.signature,
      expires: tusCredentials.expires,
      uploadEndpoint: tusCredentials.endpoint,
      title: normalizedTitle,
      isReused: false,
    };
  }

  /**
   * Persists uploaded video metadata once client finishes uploading to Bunny Stream.
   * Enforces security: client cannot mark video as "ready"; status is strictly verified against provider.
   * Cross-user integrity: prevents updating or taking over other users' media records.
   *
   * @param {string|ObjectId} userId
   * @param {Object} params
   * @param {string} params.videoId - Bunny video GUID
   * @param {string} [params.title]
   * @param {string} [params.description]
   * @param {number} [params.duration]
   * @returns {Promise<Object>} Saved Media document
   */
  async saveUploadedVideo(userId, { videoId, title, description, duration = 0 }) {
    if (!videoId) throw new Error("videoId is required to save video metadata.");

    // Check if media document already exists
    let media = await Media.findOne({
      $or: [{ bunnyVideoId: videoId }, { url: videoId }],
    });

    // Cross-user integrity check: Ensure media belongs to the requesting user
    if (media && media.user && media.user.toString() !== userId.toString()) {
      const error = new Error("Unauthorized: You do not have permission to modify this media asset.");
      error.statusCode = 403;
      error.code = "FORBIDDEN_MEDIA_OWNER";
      throw error;
    }

    // Query Bunny for official remote encoding/duration status
    let remoteDetails = null;
    try {
      remoteDetails = await this.client.getVideo(videoId);
    } catch (queryErr) {
      console.warn(`[BunnyStreamService] Query video status notice (${videoId}):`, queryErr.message);
    }

    // Determine status based strictly on verified provider state
    // A video must NOT become playable until provider readiness has been verified.
    let computedStatus = "processing";
    if (media && media.status === "ready") {
      // Preserve verified ready state; do not regress
      computedStatus = "ready";
    } else if (remoteDetails) {
      if (remoteDetails.statusCode === 3 || remoteDetails.statusCode === 4 || remoteDetails.status === "ready") {
        computedStatus = "ready";
      } else if (remoteDetails.statusCode === 5 || remoteDetails.statusCode === 6 || remoteDetails.status === "failed") {
        computedStatus = "failed";
      } else {
        computedStatus = "processing";
      }
    }

    const remoteDuration = remoteDetails?.duration || Number(duration) || 0;
    const thumbnailUrl = `https://${this.client.cdnHostname}/${videoId}/thumbnail.jpg`;

    if (!media) {
      media = new Media({
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        url: videoId,
        bunnyVideoId: videoId,
        bunnyLibraryId: this.client.libraryId,
        provider: "bunny",
        type: "video",
        description: description || title || "Bunny Stream Video",
        status: computedStatus,
        duration: remoteDuration,
        thumbnail: thumbnailUrl,
      });
    } else {
      media.bunnyVideoId = videoId;
      media.bunnyLibraryId = this.client.libraryId;
      media.provider = "bunny";
      if (title) media.description = title;
      if (remoteDuration > 0) media.duration = remoteDuration;
      media.thumbnail = thumbnailUrl;
      media.status = computedStatus;
    }

    if (remoteDetails?.errorMessage) {
      media.errorMessage = remoteDetails.errorMessage;
    }

    await media.save();
    return media;
  }

  /**
   * Evaluates enrollment & free preview permissions, and returns signed playback configuration.
   * Gated: If video is still processing or failed, it does not become playable.
   *
   * @param {string} lessonId - Lesson ObjectId string
   * @param {string|ObjectId|null} requestingUserId
   * @returns {Promise<Object>}
   */
  async getPlaybackConfig(lessonId, requestingUserId = null) {
    if (!lessonId) throw new Error("lessonId is required to obtain playback configuration.");

    // 1. Fetch lesson and parent course
    const lesson = await Lesson.findOne({ _id: lessonId, del_flag: 0 })
      .populate("media")
      .populate({
        path: "chapter",
        select: "course",
        populate: {
          path: "course",
          select: "instructor status isPublished price",
        },
      });

    if (!lesson) {
      const error = new Error("Lesson not found");
      error.statusCode = 404;
      throw error;
    }

    const course = lesson.chapter?.course;
    const isFreePreview = !!lesson.isFreePreview;
    const isInstructor =
      Boolean(requestingUserId &&
      course?.instructor &&
      course.instructor.toString() === requestingUserId.toString());

    // 2. Publication check: unpublished courses are strictly restricted to the instructor
    const isPublished = Boolean(course?.isPublished || course?.status === "published");
    if (!isPublished && !isInstructor) {
      const error = new Error("This course is currently unpublished. Video access is restricted to the instructor.");
      error.statusCode = 403;
      error.code = "COURSE_UNPUBLISHED";
      throw error;
    }

    // 3. Authentication check for non-free preview lessons
    if (!requestingUserId && !isFreePreview) {
      const error = new Error("Authentication required to access this lesson.");
      error.statusCode = 401;
      error.code = "UNAUTHENTICATED";
      throw error;
    }

    let isEnrolled = false;
    if (requestingUserId && course?._id) {
      const enrollment = await Enrollment.findOne({
        user: requestingUserId,
        course: course._id,
        status: "active",
      });
      if (enrollment) isEnrolled = true;
    }

    // 4. Evaluate access authorization
    const isAuthorized = isInstructor || (isPublished && (isFreePreview || isEnrolled));
    if (!isAuthorized) {
      const error = new Error("This lesson is locked. Please enroll in the course to view video lectures.");
      error.statusCode = 403;
      error.code = "LESSON_LOCKED";
      throw error;
    }

    // 5. Resolve video identifier
    const media = lesson.media;
    if (!media) {
      const error = new Error("No media asset attached to this lesson.");
      error.statusCode = 404;
      throw error;
    }

    const videoId = media.bunnyVideoId || media.url;
    if (!videoId) {
      const error = new Error("Media asset has no valid video identifier.");
      error.statusCode = 400;
      throw error;
    }

    // 6. Verify video readiness before returning playable stream
    let isReady = media.status === "ready";
    if (!isReady && media.provider === "bunny") {
      try {
        const liveDetails = await this.client.getVideo(videoId);
        if (liveDetails.statusCode === 3 || liveDetails.statusCode === 4 || liveDetails.status === "ready") {
          media.status = "ready";
          if (liveDetails.duration > 0) media.duration = liveDetails.duration;
          media.thumbnail = `https://${this.client.cdnHostname}/${videoId}/thumbnail.jpg`;
          await media.save();
          isReady = true;
        } else if (liveDetails.statusCode === 5 || liveDetails.statusCode === 6 || liveDetails.status === "failed") {
          media.status = "failed";
          media.errorMessage = liveDetails.errorMessage || "Encoding failed";
          await media.save();
        }
      } catch (err) {
        console.warn(`[BunnyStreamService] Live readiness check notice (${videoId}):`, err.message);
      }
    }

    // If video is not ready, return gated response without playable embed credentials
    if (!isReady) {
      return {
        lessonId: lesson._id.toString(),
        title: lesson.title,
        isFreePreview,
        isEnrolled,
        isAuthorized: true,
        isReady: false,
        status: media.status || "processing",
        message: media.status === "failed"
          ? (media.errorMessage || "Video processing failed on provider.")
          : "Video is currently encoding and not yet playable. Please check back shortly.",
        mediaId: media._id.toString(),
        videoId,
        provider: media.provider || "bunny",
        duration: media.duration || 0,
        thumbnailUrl: media.thumbnail || `https://${this.client.cdnHostname}/${videoId}/thumbnail.jpg`,
      };
    }

    // 7. Generate short-lived signed playback embed URL for ready video (3600s / 1 hour)
    const playbackConfig = this.client.generatePlaybackConfig(videoId, 3600);

    return {
      lessonId: lesson._id.toString(),
      title: lesson.title,
      isFreePreview,
      isEnrolled,
      isAuthorized: true,
      isReady: true,
      mediaId: media._id.toString(),
      videoId,
      provider: media.provider || "bunny",
      duration: media.duration || 0,
      embedUrl: playbackConfig.embedUrl,
      hlsUrl: playbackConfig.hlsUrl,
      thumbnailUrl: playbackConfig.thumbnailUrl,
      expires: playbackConfig.expires,
      isTokenized: playbackConfig.isTokenized,
    };
  }

  /**
   * Retrieves remote encoding status from Bunny Stream and updates local Media document.
   *
   * @param {string} videoId
   * @returns {Promise<Object>}
   */
  async getVideoStatus(videoId) {
    if (!videoId) throw new Error("videoId is required.");

    const details = await this.client.getVideo(videoId);
    const media = await Media.findOne({
      $or: [{ bunnyVideoId: videoId }, { url: videoId }],
    });

    if (media) {
      media.status = details.status;
      if (details.duration > 0) media.duration = details.duration;
      if (!media.thumbnail) {
        media.thumbnail = `https://${this.client.cdnHostname}/${videoId}/thumbnail.jpg`;
      }
      await media.save();
    }

    return {
      videoId,
      status: details.status,
      statusCode: details.statusCode,
      encodeProgress: details.encodeProgress,
      duration: details.duration,
      width: details.width,
      height: details.height,
      hasCaptions: details.hasCaptions,
      captions: details.captions,
      thumbnailUrl: `https://${this.client.cdnHostname}/${videoId}/thumbnail.jpg`,
    };
  }

  /**
   * Handles inbound webhook callbacks from Bunny Stream Video Library.
   * Verifies authenticity, validates payload, and processes events idempotently.
   * Protects against out-of-order events and state regressions.
   *
   * Payload format from Bunny:
   * { "VideoLibraryId": 12345, "VideoGuid": "guid", "Status": 3 }
   *
   * @param {Buffer|Object|string} rawBodyOrPayload
   * @param {string} [signatureHeader]
   * @returns {Promise<Object>}
   */
  async handleWebhook(rawBodyOrPayload, signatureHeader = "") {
    // 1. Authenticate request using HMAC-SHA256
    const isValid = this.client.verifyWebhook(rawBodyOrPayload, signatureHeader);
    if (!isValid) {
      const error = new Error("Invalid webhook signature or malformed payload.");
      error.statusCode = 401;
      throw error;
    }

    // 2. Parse payload
    let payload = rawBodyOrPayload;
    if (Buffer.isBuffer(rawBodyOrPayload)) {
      try {
        payload = JSON.parse(rawBodyOrPayload.toString("utf8"));
      } catch {
        const error = new Error("Invalid JSON body in webhook payload.");
        error.statusCode = 400;
        throw error;
      }
    } else if (typeof rawBodyOrPayload === "string") {
      try {
        payload = JSON.parse(rawBodyOrPayload);
      } catch {
        const error = new Error("Invalid JSON body in webhook payload.");
        error.statusCode = 400;
        throw error;
      }
    }

    const { VideoGuid, Status, ErrorMessage } = payload || {};
    if (!VideoGuid || typeof Status === "undefined") {
      const error = new Error("Missing VideoGuid or Status in webhook payload.");
      error.statusCode = 400;
      throw error;
    }

    const mappedStatus = this.client.mapStatusCodeToStatus(Status);

    const media = await Media.findOne({
      $or: [{ bunnyVideoId: VideoGuid }, { url: VideoGuid }],
    });

    if (!media) {
      console.warn(`[BunnyStreamWebhook] No media record found for VideoGuid: ${VideoGuid}`);
      return { received: true, updated: false, reason: "Media not found" };
    }

    // 3. Idempotency & Out-of-Order Handling
    // Rule A: If video is already "ready", do not regress to "processing" on late-arriving events
    if (media.status === "ready") {
      if (mappedStatus === "processing") {
        console.warn(`[BunnyStreamWebhook] Ignored out-of-order processing event (Status ${Status}) for ready video ${VideoGuid}`);
        return {
          received: true,
          updated: false,
          mediaId: media._id.toString(),
          status: "ready",
          reason: "Ignored out-of-order processing event for ready video",
        };
      }
      if (mappedStatus === "ready") {
        console.log(`[BunnyStreamWebhook] Idempotent duplicate ready event (Status ${Status}) for video ${VideoGuid}`);
        return {
          received: true,
          updated: false,
          mediaId: media._id.toString(),
          status: "ready",
          reason: "Already ready (idempotent)",
        };
      }
    }

    // Rule B: If video is already "failed", do not regress to "processing"
    if (media.status === "failed" && mappedStatus === "processing") {
      console.warn(`[BunnyStreamWebhook] Ignored out-of-order processing event for failed video ${VideoGuid}`);
      return {
        received: true,
        updated: false,
        mediaId: media._id.toString(),
        status: "failed",
        reason: "Ignored event for terminal failed video",
      };
    }

    // 4. State updates
    media.status = mappedStatus;
    if (ErrorMessage) {
      media.errorMessage = ErrorMessage;
    }

    // When encoding finishes (Status 3 or 4), enrich with remote details
    if (mappedStatus === "ready") {
      try {
        const details = await this.client.getVideo(VideoGuid);
        if (details.duration > 0) media.duration = details.duration;
        if (details.width) media.width = details.width;
        if (details.height) media.height = details.height;
        media.thumbnail = `https://${this.client.cdnHostname}/${VideoGuid}/thumbnail.jpg`;
      } catch (err) {
        console.warn(`[BunnyStreamWebhook] Could not enrich media metadata on ready:`, err.message);
        if (!media.thumbnail) {
          media.thumbnail = `https://${this.client.cdnHostname}/${VideoGuid}/thumbnail.jpg`;
        }
      }
    }

    await media.save();
    console.log(`[BunnyStreamWebhook] Updated media ${media._id} status to '${mappedStatus}' (code: ${Status})`);

    return {
      received: true,
      updated: true,
      mediaId: media._id.toString(),
      status: mappedStatus,
    };
  }

  /**
   * Deletes a video asset from Bunny Stream and local database.
   *
   * @param {string} mediaId
   * @param {string|ObjectId} userId
   * @returns {Promise<boolean>}
   */
  async deleteVideoAsset(mediaId, userId) {
    const media = await Media.findOne({ _id: mediaId });
    if (!media) {
      const error = new Error("Media asset not found.");
      error.statusCode = 404;
      throw error;
    }

    // Verify ownership: User must be media owner OR instructor of linked course
    const isOwner = media.user && media.user.toString() === userId.toString();
    if (!isOwner) {
      const linkedLesson = await Lesson.findOne({ media: mediaId, del_flag: 0 }).populate({
        path: "chapter",
        select: "course",
        populate: { path: "course", select: "instructor" },
      });
      const instructorId = linkedLesson?.chapter?.course?.instructor?.toString();
      if (!instructorId || instructorId !== userId.toString()) {
        const error = new Error("Unauthorized: You do not have permission to delete this video asset.");
        error.statusCode = 403;
        error.code = "FORBIDDEN_DELETE";
        throw error;
      }
    }

    const videoId = media.bunnyVideoId || (media.url && !media.url.includes("://") ? media.url : null);
    if (videoId && media.provider === "bunny") {
      try {
        await this.client.deleteVideo(videoId);
      } catch (err) {
        console.warn(`[BunnyStreamService] Remote delete error for ${videoId}:`, err.message);
      }
    }

    // Unlink from any lessons
    await Lesson.updateMany({ media: mediaId }, { $unset: { media: 1 } });

    // Remove database document
    await Media.findByIdAndDelete(mediaId);
    return true;
  }
}

const defaultInstance = new BunnyStreamService();
defaultInstance.BunnyStreamService = BunnyStreamService;

module.exports = defaultInstance;
