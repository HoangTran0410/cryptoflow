/**
 * IndexedDB Cache for blockchain API responses
 * Reduces API calls by caching transaction data locally
 */

const DB_NAME = "cryptoflow_cache";
const DB_VERSION = 1;
const STORE_NAME = "wallet_transactions";

// Cache entry structure
export interface CacheEntry {
  address: string;
  chain: string;
  tokenContract: string | null;
  transactions: any[];
  timestamp: number;
  expiresAt: number;
}

// Cache stats for UI
export interface CacheStats {
  totalEntries: number;
  totalSize: string;
  entries: {
    address: string;
    chain: string;
    txCount: number;
    cachedAt: Date;
    expiresAt: Date;
  }[];
}

// Default cache duration: 24 hours
const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000;

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store with composite key (address + chain + tokenContract)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ["address", "chain", "tokenContract"],
        });

        // Create indexes for querying
        store.createIndex("address", "address", { unique: false });
        store.createIndex("chain", "chain", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

/**
 * Generate cache key from parameters
 */
function getCacheKey(
  address: string,
  chain: string,
  tokenContract: string | null
): [string, string, string] {
  return [address.toLowerCase(), chain, tokenContract || "all"];
}

/**
 * Get cached transactions for an address
 */
export async function getCachedTransactions(
  address: string,
  chain: string,
  tokenContract: string | null = null
): Promise<any[] | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const key = getCacheKey(address, chain, tokenContract);
    const request = store.get(key);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry && entry.expiresAt > Date.now()) {
          resolve(entry.transactions);
        } else {
          resolve(null); // Cache miss or expired
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Save transactions to cache
 */
export async function setCachedTransactions(
  address: string,
  chain: string,
  tokenContract: string | null,
  transactions: any[],
  cacheDuration: number = DEFAULT_CACHE_DURATION
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const now = Date.now();
    const entry: CacheEntry = {
      address: address.toLowerCase(),
      chain,
      tokenContract: tokenContract || "all",
      transactions,
      timestamp: now,
      expiresAt: now + cacheDuration,
    };

    store.put(entry);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to cache transactions:", error);
  }
}

/**
 * Clear cache for a specific address
 */
export async function clearCacheForAddress(
  address: string,
  chain?: string
): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("address");

    const request = index.getAll(address.toLowerCase());
    let deletedCount = 0;

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        for (const entry of entries) {
          if (!chain || entry.chain === chain) {
            const key = getCacheKey(
              entry.address,
              entry.chain,
              entry.tokenContract
            );
            store.delete(key);
            deletedCount++;
          }
        }
        tx.oncomplete = () => resolve(deletedCount);
      };
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("Failed to clear cache:", error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        const now = Date.now();

        // Filter out expired entries for display
        const validEntries = entries.filter((e) => e.expiresAt > now);

        // Estimate size (rough calculation)
        const sizeBytes = JSON.stringify(entries).length;
        const sizeStr =
          sizeBytes > 1024 * 1024
            ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
            : `${(sizeBytes / 1024).toFixed(2)} KB`;

        resolve({
          totalEntries: validEntries.length,
          totalSize: sizeStr,
          entries: validEntries.map((e) => ({
            address: e.address,
            chain: e.chain,
            txCount: e.transactions.length,
            cachedAt: new Date(e.timestamp),
            expiresAt: new Date(e.expiresAt),
          })),
        });
      };
      request.onerror = () =>
        resolve({ totalEntries: 0, totalSize: "0 KB", entries: [] });
    });
  } catch {
    return { totalEntries: 0, totalSize: "0 KB", entries: [] };
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    let deletedCount = 0;

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        const now = Date.now();

        for (const entry of entries) {
          if (entry.expiresAt <= now) {
            const key = getCacheKey(
              entry.address,
              entry.chain,
              entry.tokenContract
            );
            store.delete(key);
            deletedCount++;
          }
        }

        tx.oncomplete = () => resolve(deletedCount);
      };
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Check if an address is cached
 */
export async function isAddressCached(
  address: string,
  chain: string,
  tokenContract: string | null = null
): Promise<boolean> {
  const cached = await getCachedTransactions(address, chain, tokenContract);
  return cached !== null;
}
