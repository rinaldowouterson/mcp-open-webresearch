import { LRUCache } from "lru-cache";
import { getConfig } from "../../config/index.js";

/**
 * Configuration options for creating a buffer cache.
 */
export interface BufferCacheOptions {
  /** Maximum size of the cache in bytes (default: 100MB) */
  maxSizeBytes?: number;
  /** Time-to-live in milliseconds (default: 10 minutes) */
  ttlMs?: number;
}

/**
 * Interface for the buffer cache operations.
 */
export interface BufferCache {
  /** Store a buffer in the cache */
  set: (id: string, content: Buffer) => void;
  /** Retrieve a buffer from the cache */
  get: (id: string) => Buffer | undefined;
  /** Clear all entries */
  clear: () => void;
}

/**
 * Factory function to create a buffer cache with configurable options.
 * This is the single source of truth for cache creation.
 *
 * @param options Configuration options (defaults to production values)
 * @returns A BufferCache instance
 */
export const createBufferCache = (
  options?: BufferCacheOptions,
): BufferCache => {
  const maxSizeBytes = options?.maxSizeBytes ?? 100 * 1024 * 1024; // 100MB
  const ttlMs = options?.ttlMs ?? 1000 * 60 * 10; // 10 minutes

  const cache = new LRUCache<string, Buffer>({
    maxSize: maxSizeBytes,
    // lru-cache requires positive integer; empty buffers get size 1
    sizeCalculation: (value) => Math.max(1, value.byteLength),
    ttl: ttlMs,
    // CRITICAL: Do not extend TTL on access - TTL is absolute from creation
    noUpdateTTL: true,
  });

  return {
    set: (id, content) => cache.set(id, content),
    get: (id) => cache.get(id),
    clear: () => cache.clear(),
  };
};

// =============================================================================
// MODULE-LEVEL SINGLETON (Lazy-Initialized Production Instance)
// =============================================================================

let productionCache: BufferCache | null = null;

/**
 * Returns the production cache singleton, creating it on first access.
 * This lazy initialization ensures config is available before cache creation.
 */
const getProductionCache = (): BufferCache => {
  if (!productionCache) {
    const ttlMs = getConfig().deepSearch.reportRetentionMinutes * 60 * 1000;
    productionCache = createBufferCache({ ttlMs });
  }
  return productionCache;
};

/**
 * Stores a buffer in the production cache.
 */
export const cacheBuffer = (id: string, content: Buffer): void => {
  getProductionCache().set(id, content);
};

/**
 * Retrieves a buffer from the production cache.
 */
export const getBuffer = (id: string): Buffer | undefined => {
  return getProductionCache().get(id);
};

/**
 * Clears the production cache.
 */
export const clearCache = (): void => {
  getProductionCache().clear();
};

/**
 * Resets the production cache singleton (for testing only).
 */
export const resetProductionCacheForTesting = (): void => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CRITICAL: resetProductionCacheForTesting called in PRODUCTION environment!",
    );
  }
  productionCache = null;
};
