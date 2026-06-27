const rateLimit = require("express-rate-limit");

/**
 * Rate limiter for media upload endpoints.
 * 20 uploads per minute per user — prevents abuse while allowing
 * reasonable batch uploads.
 */
const mediaUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.userInfo?._id?.toString() || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many uploads. Please wait a minute before uploading more.",
  },
});

/**
 * Rate limiter for media search endpoints.
 * 60 searches per minute per user — allows rapid search-as-you-type
 * with debounce on the client (300ms).
 */
const mediaSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.userInfo?._id?.toString() || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many search requests. Please slow down.",
  },
});

module.exports = { mediaUploadLimiter, mediaSearchLimiter };
