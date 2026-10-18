const crypto = require("crypto");
const axios = require("axios");

/**
 * Isolated client for official Bunny Stream REST API & Security Mechanisms.
 * Complies with official Bunny Stream TUS and Token Authentication specifications.
 */
class BunnyStreamClient {
  constructor(config = {}) {
    this.apiKey = (config.apiKey || process.env.BUNNY_STREAM_API_KEY || "").trim();
    this.libraryId = (config.libraryId || process.env.BUNNY_STREAM_LIBRARY_ID || "").trim();
    this.tokenKey = (config.tokenKey || config.tokenSecurityKey || process.env.BUNNY_STREAM_TOKEN_KEY || "").trim();
    this.cdnHostname = (config.cdnHostname || process.env.BUNNY_STREAM_CDN_HOSTNAME || "iframe.mediadelivery.net").trim();
    this.webhookSecret = (config.webhookSecret || process.env.BUNNY_STREAM_WEBHOOK_SECRET || "").trim();
    this.apiBaseUrl = config.apiBaseUrl || "https://video.bunnycdn.com";
    this.tusEndpoint = config.tusEndpoint || "https://video.bunnycdn.com/tusupload";
  }

  /**
   * Validates that essential configuration parameters are present.
   */
  validateConfig() {
    if (!this.libraryId || !this.apiKey) {
      throw new Error("Bunny Stream configuration missing: BUNNY_STREAM_LIBRARY_ID or BUNNY_STREAM_API_KEY not configured.");
    }
  }

  /**
   * Creates a video container in Bunny Stream Video Library.
   * Required before any direct TUS upload can begin.
   *
   * @param {Object} params
   * @param {string} params.title - Title of the video
   * @param {string} [params.collectionId] - Optional Collection GUID
   * @returns {Promise<{ guid: string, title: string, videoLibraryId: number }>}
   */
  async createVideo({ title, collectionId = null }) {
    this.validateConfig();

    const url = `${this.apiBaseUrl}/library/${this.libraryId}/videos`;
    const payload = { title: title || "Untitled Video" };
    if (collectionId) payload.collectionId = collectionId;

    try {
      const response = await axios.post(url, payload, {
        headers: {
          AccessKey: this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 10000,
      });

      return {
        guid: response.data.guid,
        title: response.data.title,
        videoLibraryId: response.data.videoLibraryId,
        raw: response.data,
      };
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.message;
      throw new Error(`[BunnyStream] Failed to create video (${status || "NET_ERR"}): ${detail}`);
    }
  }

  /**
   * Generates presigned TUS resumable upload credentials.
   * Formula: SHA256(LibraryId + APIKey + ExpirationTimestamp + VideoId)
   *
   * @param {string} videoId - The GUID obtained from createVideo()
   * @param {number} [expirationSeconds=86400] - Validity duration in seconds (default 24h)
   * @returns {{ signature: string, expires: number, libraryId: string, videoId: string, endpoint: string }}
   */
  generateTusUploadCredentials(videoId, expirationSeconds = 86400) {
    this.validateConfig();
    if (!videoId) throw new Error("videoId is required to generate TUS upload credentials.");

    const expires = Math.floor(Date.now() / 1000) + expirationSeconds;
    const signatureString = `${this.libraryId}${this.apiKey}${expires}${videoId}`;
    const signature = crypto.createHash("sha256").update(signatureString).digest("hex");

    return {
      signature,
      expires,
      libraryId: this.libraryId,
      videoId,
      endpoint: this.tusEndpoint,
    };
  }

  /**
   * Generates secure signed playback embed configuration.
   * Formula: SHA256_HEX(TokenSecurityKey + VideoId + Expires)
   *
   * @param {string} videoId - The video GUID
   * @param {number} [expirationSeconds=7200] - Validity duration in seconds (default 2 hours)
   * @param {Object} [options]
   * @param {boolean} [options.autoplay=false]
   * @returns {{ embedUrl: string, hlsUrl: string, thumbnailUrl: string, expires: number, isTokenized: boolean }}
   */
  generatePlaybackConfig(videoId, expirationSeconds = 7200, options = {}) {
    if (!videoId) throw new Error("videoId is required to generate playback configuration.");

    const effectiveLibraryId = this.libraryId || "default";
    const expires = Math.floor(Date.now() / 1000) + expirationSeconds;
    const hasTokenKey = !!this.tokenKey && this.tokenKey !== "your_bunny_token_authentication_key_here";

    let token = null;
    let queryParams = "";

    if (hasTokenKey) {
      // Official Bunny Stream Embed Token formula: Key + VideoId + Expires
      const stringToHash = `${this.tokenKey}${videoId}${expires}`;
      token = crypto.createHash("sha256").update(stringToHash).digest("hex");
      queryParams = `?token=${token}&expires=${expires}`;
    }

    if (options.autoplay) {
      queryParams += queryParams ? "&autoplay=true" : "?autoplay=true";
    }

    const embedUrl = `https://player.mediadelivery.net/embed/${effectiveLibraryId}/${videoId}${queryParams}`;
    const hlsUrl = `https://${this.cdnHostname}/${videoId}/playlist.m3u8${queryParams}`;
    const thumbnailUrl = `https://${this.cdnHostname}/${videoId}/thumbnail.jpg`;

    return {
      embedUrl,
      hlsUrl,
      thumbnailUrl,
      expires: hasTokenKey ? expires : null,
      isTokenized: hasTokenKey,
    };
  }

  /**
   * Retrieves video details, encode status, and playback metadata from Bunny Stream.
   *
   * @param {string} videoId
   * @returns {Promise<Object>}
   */
  async getVideo(videoId) {
    this.validateConfig();
    if (!videoId) throw new Error("videoId is required to fetch video details.");

    const url = `${this.apiBaseUrl}/library/${this.libraryId}/videos/${videoId}`;

    try {
      const response = await axios.get(url, {
        headers: {
          AccessKey: this.apiKey,
          Accept: "application/json",
        },
        timeout: 10000,
      });

      const data = response.data;
      const normalizedStatus = this.mapStatusCodeToStatus(data.status);

      return {
        guid: data.guid,
        title: data.title,
        duration: data.length || 0, // In seconds
        width: data.width || 0,
        height: data.height || 0,
        statusCode: data.status,
        status: normalizedStatus,
        encodeProgress: data.encodeProgress || 0,
        views: data.views || 0,
        hasCaptions: Array.isArray(data.captions) && data.captions.length > 0,
        captions: data.captions || [],
        thumbnailFileName: data.thumbnailFileName || "thumbnail.jpg",
        raw: data,
      };
    } catch (error) {
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.message;
      throw new Error(`[BunnyStream] Failed to get video ${videoId} (${status || "NET_ERR"}): ${detail}`);
    }
  }

  /**
   * Permanently deletes a video from Bunny Stream.
   *
   * @param {string} videoId
   * @returns {Promise<boolean>}
   */
  async deleteVideo(videoId) {
    this.validateConfig();
    if (!videoId) throw new Error("videoId is required to delete a video.");

    const url = `${this.apiBaseUrl}/library/${this.libraryId}/videos/${videoId}`;

    try {
      await axios.delete(url, {
        headers: {
          AccessKey: this.apiKey,
        },
        timeout: 10000,
      });
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        // Already deleted remotely
        return true;
      }
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.message;
      throw new Error(`[BunnyStream] Failed to delete video ${videoId} (${status || "NET_ERR"}): ${detail}`);
    }
  }

  /**
   * Validates incoming Bunny Stream webhook request authenticity.
   *
   * @param {Buffer|Object|string} rawBodyOrPayload - Raw request bytes or parsed payload
   * @param {string} [signatureHeader] - Value from X-BunnyStream-Signature header
   * @returns {boolean}
   */
  verifyWebhook(rawBodyOrPayload, signatureHeader = "") {
    const secret = this.webhookSecret && this.webhookSecret !== "your_bunny_webhook_secret_here"
      ? this.webhookSecret
      : null;

    // If no webhook secret is configured in environment, check valid payload structure
    if (!secret) {
      const payload = Buffer.isBuffer(rawBodyOrPayload)
        ? JSON.parse(rawBodyOrPayload.toString("utf8"))
        : rawBodyOrPayload;
      return !!(payload?.VideoGuid && typeof payload?.Status !== "undefined");
    }

    if (!signatureHeader) return false;

    try {
      const raw = Buffer.isBuffer(rawBodyOrPayload)
        ? rawBodyOrPayload
        : typeof rawBodyOrPayload === "string"
          ? Buffer.from(rawBodyOrPayload, "utf8")
          : Buffer.from(JSON.stringify(rawBodyOrPayload), "utf8");

      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(raw)
        .digest("hex");

      const cleanReceived = signatureHeader.toLowerCase().trim();
      const cleanExpected = expectedSignature.toLowerCase().trim();

      if (cleanReceived.length !== cleanExpected.length) return false;

      return crypto.timingSafeEqual(
        Buffer.from(cleanReceived, "utf8"),
        Buffer.from(cleanExpected, "utf8")
      );
    } catch {
      return false;
    }
  }

  /**
   * Maps Bunny Stream integer status codes to canonical OpenIdear status strings.
   *
   * 0 = Queued
   * 1 = Processing
   * 2 = Encoding
   * 3 = Finished (Ready)
   * 4 = Resolution finished
   * 5 = Failed
   */
  mapStatusCodeToStatus(code) {
    switch (code) {
      case 0:
        return "uploaded";
      case 1:
      case 2:
        return "processing";
      case 3:
      case 4:
        return "ready";
      case 5:
        return "failed";
      default:
        return typeof code === "number" && code >= 3 ? "ready" : "processing";
    }
  }
}

module.exports = BunnyStreamClient;
