const crypto = require("crypto");
const sharp = require("sharp");
const PQueue = require("p-queue");
const { Service } = require("../core");
const { AssetRepository } = require("../repositories");
const cloudinary = require("../utils/cloudinary");

// Queue concurrent image compilation tasks to prevent high memory spikes
const imageQueue = new PQueue.default
  ? new (PQueue.default)({ concurrency: 4 })
  : new PQueue({ concurrency: 4 });

/**
 * =============================================================================
 *  UPLOAD SERVICE
 *  services/upload.services.js
 *
 *  Design Decisions:
 *  - Handles asset upload validations (types, file capacity budgets).
 *  - Generates webp thumbnails on-the-fly via sharp.
 *  - Stream-pipes binary buffers straight to the Cloudinary CDN.
 *  - Saves unified metadata states inside MongoDB via AssetRepository.
 * =============================================================================
 */

class UploadService extends Service {
  /**
   * Enforces mimetype validation and file size restrictions.
   */
  validateImage(file) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];

    if (!allowed.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}. Allowed formats: JPEG, PNG, GIF, WebP, SVG.`);
    }

    const maxSize = 10 * 1024 * 1024; // 10MB limit
    if (file.buffer.length > maxSize) {
      throw new Error("File size exceeds the 10MB limit.");
    }
  }

  /**
   * Complete asset pipeline: validate -> hash -> compile variants -> CDN -> database save.
   */
  async upload(userId, file, options = {}) {
    const { description = "", alt = "", tags = [] } = options;

    // 1. Enforce mimetype and capacity checks
    this.validateImage(file);

    // 2. Generate SHA-256 hash for dedup checks
    const fileHash = crypto
      .createHash("sha256")
      .update(file.buffer)
      .digest("hex");

    // 3. Process Variants (Original + Thumbnail) in concurrency queue
    const processed = await imageQueue.add(() => this._processImage(file.buffer));

    // 4. Upload to Cloudinary CDN
    const urls = await this._uploadToCloudinary(userId, processed, file.originalname);

    // 5. Persist mapping parameters via AssetRepository
    const asset = await AssetRepository.create({
      ownerId: userId,
      filename: urls.filename,
      originalName: this._sanitizeFilename(file.originalname),
      mimeType: file.mimetype,
      hash: fileHash,
      url: urls.url,
      thumbnailUrl: urls.thumbnailUrl,
      size: file.buffer.length,
      width: processed.dimensions.width,
      height: processed.dimensions.height,
      description,
      alt,
      tags,
    });

    return asset;
  }

  /**
   * Internal sharp variant generator. Creates a 400px wide webp thumbnail.
   */
  async _processImage(buffer) {
    const metadata = await sharp(buffer).metadata();
    const dimensions = {
      width: metadata.width || 0,
      height: metadata.height || 0,
    };

    // Generate optimized webp thumbnail variant
    const thumbnail = await sharp(buffer)
      .resize(400, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    return {
      original: buffer,
      thumbnail,
      dimensions,
    };
  }

  /**
   * Streams original and thumbnail buffers to Cloudinary CDN.
   */
  async _uploadToCloudinary(userId, processed, originalName) {
    const baseName = originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 60);
    const folder = `assets/${userId}`;
    const ts = Date.now();

    const uploadStream = (buffer, filenameSuffix) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: `${baseName}_${filenameSuffix}_${ts}`,
            resource_type: "image",
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        ).end(buffer);
      });
    };

    // Upload both original & thumbnail in parallel
    const [originalResult, thumbnailResult] = await Promise.all([
      uploadStream(processed.original, "original"),
      uploadStream(processed.thumbnail, "thumb"),
    ]);

    return {
      url: originalResult.secure_url,
      thumbnailUrl: thumbnailResult.secure_url,
      filename: originalResult.public_id,
    };
  }

  /**
   * Sanitizes filenames to strip tags and unsafe characters.
   */
  _sanitizeFilename(name) {
    if (!name) return "untitled";
    return name
      .replace(/<[^>]*>/g, "") // Strip HTML tags
      .replace(/[^\w\s._-]/g, "") // Allow only alphanumeric, spaces, dots, underscores, dashes
      .substring(0, 255)
      .trim() || "untitled";
  }
}

module.exports = new UploadService();
