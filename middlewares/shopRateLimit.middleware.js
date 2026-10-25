// =============================================================================
//  OPENIDEAR SHOP — RATE LIMITING MIDDLEWARES
//  middlewares/shopRateLimit.middleware.js
// =============================================================================

const rateLimit = require("express-rate-limit");

/**
 * Rate limiter for public event ingestion (120 requests / minute / IP)
 * Prevents telemetry flooding and artificial metric inflation.
 */
const analyticsEventRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many analytics events submitted from this IP. Throttled.",
  },
});

module.exports = {
  analyticsEventRateLimiter,
};
