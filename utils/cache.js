/**
 * Simple in-memory TTL cache utility.
 * Lightweight, zero-dependency, and safe for Node.js event loop.
 */
class MemoryCache {
  constructor(defaultTtlMs = 180000) { // Default 3 minutes
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get an item from the cache if not expired.
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Set an item in the cache with optional TTL.
   * @param {string} key
   * @param {any} value
   * @param {number} ttlMs
   */
  set(key, value, ttlMs = this.defaultTtlMs) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Invalidate a specific key or prefix.
   * @param {string} keyOrPrefix
   */
  invalidate(keyOrPrefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyOrPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache.
   */
  clear() {
    this.cache.clear();
  }
}

const memoryCache = new MemoryCache();

module.exports = {
  MemoryCache,
  memoryCache,
};
