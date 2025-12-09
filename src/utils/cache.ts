/**
 * LRU Cache for expensive computation results.
 * Prevents redundant calculations for repeated queries.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  size: number; // Approximate memory size in bytes
}

class ForensicsCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number; // Max cache size in bytes
  private currentSize = 0;
  private ttl: number; // Time to live in ms

  constructor(maxSizeMB: number = 50, ttlMinutes: number = 30) {
    this.maxSize = maxSizeMB * 1024 * 1024;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  set(key: string, data: T): void {
    // Estimate size (rough approximation)
    const size = JSON.stringify(data).length * 2; // 2 bytes per char

    // Evict if needed
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    // Remove old entry if exists
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.currentSize -= oldEntry.size;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      size,
    });

    this.currentSize += size;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;

    this.currentSize -= entry.size;
    this.cache.delete(key);
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) this.delete(oldestKey);
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  stats() {
    return {
      entries: this.cache.size,
      sizeMB: (this.currentSize / (1024 * 1024)).toFixed(2),
      maxSizeMB: (this.maxSize / (1024 * 1024)).toFixed(2),
      utilization: ((this.currentSize / this.maxSize) * 100).toFixed(1) + '%',
    };
  }

  has(key: string): boolean {
    return this.cache.has(key) && this.get(key) !== null;
  }
}

// Global cache instances
export const deepTraceCache = new ForensicsCache(30, 30);
export const pathFinderCache = new ForensicsCache(20, 30);
export const taintCache = new ForensicsCache(20, 30);
export const patternCache = new ForensicsCache(10, 30);

// Helper function to generate cache keys
export const generateCacheKey = (prefix: string, params: Record<string, any>): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  return `${prefix}_${sortedParams}`;
};

// Clear all caches (useful when new data is loaded)
export const clearAllCaches = (): void => {
  deepTraceCache.clear();
  pathFinderCache.clear();
  taintCache.clear();
  patternCache.clear();
};

// Get combined cache stats
export const getAllCacheStats = () => {
  return {
    deepTrace: deepTraceCache.stats(),
    pathFinder: pathFinderCache.stats(),
    taint: taintCache.stats(),
    pattern: patternCache.stats(),
  };
};
