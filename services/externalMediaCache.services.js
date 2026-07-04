const axios = require("axios");
const { Service } = require("../core");

// Shared key prefixes
const SEARCH_KEY_PREFIX = "ext_search:";
const THUMB_KEY_PREFIX = "ext_thumb:";

class MemoryCacheStore {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async set(key, value, ttlSeconds) {
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key) {
    this.store.delete(key);
  }
}

/**
 * Swappable interface mock for future Redis compatibility.
 * To activate Redis at a later date, import a standard redis client and instantiate this store:
 * 
 * class RedisCacheStore {
 *   constructor(redisClient) {
 *     this.client = redisClient;
 *   }
 *   async get(key) {
 *     const data = await this.client.get(key);
 *     return data ? JSON.parse(data) : null;
 *   }
 *   async set(key, value, ttlSeconds) {
 *     await this.client.setEx(key, ttlSeconds, JSON.stringify({
 *       value,
 *       createdAt: Date.now(),
 *       expiresAt: Date.now() + (ttlSeconds * 1000)
 *     }));
 *   }
 *   async del(key) {
 *     await this.client.del(key);
 *   }
 * }
 */

class ExternalMediaCacheService extends Service {
  constructor() {
    super();
    // Swappable cache store instance (Memory by default, fits contract)
    this.cacheStore = new MemoryCacheStore();
    this.rateLimitLocks = new Map(); // providerId -> lockExpiresTimestamp
    this.refreshingKeys = new Set(); // Track background refreshed keys to prevent parallel overlaps

    // Cache TTL rules
    this.SEARCH_TTL_SECS = 10 * 60; // 10 minutes search cache TTL
    this.SEARCH_STALE_SECS = 5 * 60; // 5 minutes stale-while-revalidate threshold
    this.THUMB_TTL_SECS = 7 * 24 * 60 * 60; // 7 days thumbnail buffer TTL
  }

  /**
   * Retrieves query search results from cache.
   * If stale but not expired, returns value immediately and triggers background refresh.
   */
  async getSearch(query, providerId = "all", page = 1, perPage = 20) {
    const key = `${SEARCH_KEY_PREFIX}${providerId}:${page}:${perPage}:${query.toLowerCase().trim()}`;
    const cached = await this.cacheStore.get(key);

    if (cached) {
      const ageSeconds = (Date.now() - cached.createdAt) / 1000;
      if (ageSeconds > this.SEARCH_STALE_SECS) {
        // Trigger background refresh in background without blocking
        this._triggerBackgroundRefresh(key, query, providerId, page, perPage);
      }
      return cached.value;
    }

    return null;
  }

  /**
   * Saves search results in the cache.
   */
  async setSearch(query, providerId = "all", page = 1, perPage = 20, results) {
    const key = `${SEARCH_KEY_PREFIX}${providerId}:${page}:${perPage}:${query.toLowerCase().trim()}`;
    await this.cacheStore.set(key, results, this.SEARCH_TTL_SECS);
  }

  /**
   * Retrieves thumbnail buffer from cache.
   */
  async getThumbnail(url) {
    const key = `${THUMB_KEY_PREFIX}${this._hashUrl(url)}`;
    const cached = await this.cacheStore.get(key);
    return cached ? cached.value : null;
  }

  /**
   * Saves thumbnail buffer to cache.
   */
  async setThumbnail(url, buffer) {
    const key = `${THUMB_KEY_PREFIX}${this._hashUrl(url)}`;
    await this.cacheStore.set(key, buffer, this.THUMB_TTL_SECS);
  }

  /**
   * Registers a rate limit warning cooldown lock for a provider.
   */
  lockProvider(providerId, cooldownSeconds = 60) {
    console.warn(`[ExternalMediaCache] Rate limit lock active for '${providerId}' for ${cooldownSeconds}s`);
    this.rateLimitLocks.set(providerId, Date.now() + cooldownSeconds * 1000);
  }

  /**
   * Asserts whether a provider is locked under rate limits.
   */
  isProviderLocked(providerId) {
    const lockExpires = this.rateLimitLocks.get(providerId);
    if (!lockExpires) return false;
    if (Date.now() > lockExpires) {
      this.rateLimitLocks.delete(providerId);
      return false;
    }
    return true;
  }

  /**
   * Triggers asynchronous background cache refresh
   */
  async _triggerBackgroundRefresh(key, query, providerId, page, perPage) {
    if (this.refreshingKeys.has(key)) return;
    this.refreshingKeys.add(key);

    console.log(`[ExternalMediaCache] Background refresh triggered for key: ${key}`);

    // Asynchronously call provider search to update cache
    this._executeSearchFetch(query, providerId, page, perPage)
      .then(async (freshResults) => {
        if (freshResults) {
          await this.cacheStore.set(key, freshResults, this.SEARCH_TTL_SECS);
          console.log(`[ExternalMediaCache] Background refresh completed successfully for: ${key}`);
        }
      })
      .catch((err) => {
        console.error(`[ExternalMediaCache] Background refresh error for ${key}:`, err.message);
      })
      .finally(() => {
        this.refreshingKeys.delete(key);
      });
  }

  /**
   * Helper to execute search fetch
   */
  async _executeSearchFetch(query, providerId, page, perPage) {
    // If provider is currently locked, skip API calls to protect key quotas
    if (providerId !== "all" && this.isProviderLocked(providerId)) {
      console.warn(`[ExternalMediaCache] Search fetch skipped. Provider '${providerId}' is locked under rate limits.`);
      return null;
    }

    try {
      const { externalMediaService } = require("../external-media");
      return await externalMediaService.search(query, providerId === "all" ? undefined : providerId, page, perPage);
    } catch (err) {
      // Check for rate limit status (429) to dynamically apply locks
      if (err.response?.status === 429) {
        const lockedId = providerId === "all" ? "unsplash" : providerId; // Default fallback lock
        this.lockProvider(lockedId);
      }
      throw err;
    }
  }

  _hashUrl(urlStr) {
    const crypto = require("crypto");
    return crypto.createHash("md5").update(urlStr).digest("hex");
  }
}

module.exports = new ExternalMediaCacheService();
