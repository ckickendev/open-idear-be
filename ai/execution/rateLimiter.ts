// =============================================================================
//  AI EXECUTION — PROACTIVE SLIDING WINDOW RATE LIMITER
//  ai/execution/rateLimiter.ts
//
//  Design Decisions:
//  - Implements a queueing sliding-window rate limiter to prevent HTTP 429 errors.
//  - Instead of rejecting requests, it suspends execution and resolves when
//    the rate limit window has capacity.
//  - Fully thread-safe in a single Node.js event-loop.
// =============================================================================

import { RATE_LIMITS } from "../config/limits";

export class ProactiveRateLimiter {
  private readonly requestTimestamps: number[] = [];
  private readonly maxRunsPerMinute = RATE_LIMITS.maxRunsPerMinute;
  private readonly windowSizeMs = 60 * 1000; // 1 minute sliding window

  /**
   * Proactively throttle incoming requests.
   * If limit is reached, it yields execution to wait until capacity is freed.
   */
  async throttle(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.cleanup(now);

      if (this.requestTimestamps.length < this.maxRunsPerMinute) {
        // We have capacity — record timestamp and proceed
        this.requestTimestamps.push(now);
        return;
      }

      // No capacity — calculate delay required until the oldest request expires
      const oldestTimestamp = this.requestTimestamps[0];
      const waitMs = oldestTimestamp + this.windowSizeMs - now;

      if (waitMs > 0) {
        console.warn(`[ProactiveRateLimiter] Rate limit near cap (${this.requestTimestamps.length}/${this.maxRunsPerMinute}). Delaying execution by ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  /**
   * Remove timestamps that have fallen out of the sliding window.
   */
  private cleanup(now: number): void {
    const cutoff = now - this.windowSizeMs;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
  }
}

export const proactiveRateLimiter = new ProactiveRateLimiter();
