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
}

// Cache stats entry for UI
export interface CacheStatsEntry {
  address: string;
  chain: string;
  tokenContract: string;
  txCount: number;
  cachedAt: Date;
}

// Cache stats for UI
export interface CacheStats {
  totalEntries: number;
  totalSize: string;
  entries: CacheStatsEntry[];
}

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
        if (entry) {
          resolve(entry.transactions);
        } else {
          resolve(null); // Cache miss
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
  transactions: any[]
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const entry: CacheEntry = {
      address: address.toLowerCase(),
      chain,
      tokenContract: tokenContract || "all",
      transactions,
      timestamp: Date.now(),
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

        // Estimate size (rough calculation)
        const sizeBytes = JSON.stringify(entries).length;
        const sizeStr =
          sizeBytes > 1024 * 1024
            ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
            : `${(sizeBytes / 1024).toFixed(2)} KB`;

        resolve({
          totalEntries: entries.length,
          totalSize: sizeStr,
          entries: entries.map((e) => ({
            address: e.address,
            chain: e.chain,
            tokenContract: e.tokenContract || "all",
            txCount: e.transactions.length,
            cachedAt: new Date(e.timestamp),
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
 * Clear selected cache entries
 * @param selectedEntries - Array of entries to clear (address + chain + tokenContract)
 */
export async function clearSelectedCache(
  selectedEntries: { address: string; chain: string; tokenContract: string }[]
): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    let deletedCount = 0;

    for (const entry of selectedEntries) {
      const key = getCacheKey(entry.address, entry.chain, entry.tokenContract);
      store.delete(key);
      deletedCount++;
    }

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(deletedCount);
      tx.onerror = () => resolve(0);
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

/**
 * Export all cache data to a JSON file
 */
export async function exportCacheToFile(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        downloadCacheAsJson(entries, "cryptoflow_cache");
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to export cache:", error);
    throw error;
  }
}

/**
 * Export selected cache entries to a JSON file
 */
export async function exportSelectedCacheToFile(
  selectedEntries: { address: string; chain: string; tokenContract: string }[]
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const entries: CacheEntry[] = [];

    for (const entry of selectedEntries) {
      const key = getCacheKey(entry.address, entry.chain, entry.tokenContract);
      const request = store.get(key);

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          if (request.result) {
            entries.push(request.result as CacheEntry);
          }
          resolve();
        };
        request.onerror = () => resolve();
      });
    }

    downloadCacheAsJson(entries, `cryptoflow_cache_selected_${entries.length}`);
  } catch (error) {
    console.error("Failed to export selected cache:", error);
    throw error;
  }
}

/**
 * Helper function to download cache entries as JSON
 */
function downloadCacheAsJson(entries: CacheEntry[], filename: string): void {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    entries: entries,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import cache data from a JSON file
 * Returns the number of entries imported
 */
export async function importCacheFromFile(
  file: File
): Promise<{ imported: number; skipped: number; errors: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        // Validate import data structure
        if (!data.entries || !Array.isArray(data.entries)) {
          throw new Error("Invalid cache file format: missing entries array");
        }

        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const entry of data.entries) {
          try {
            // Validate entry structure
            if (!entry.address || !entry.chain || !entry.transactions) {
              skipped++;
              continue;
            }

            const updatedEntry: CacheEntry = {
              address: entry.address.toLowerCase(),
              chain: entry.chain,
              tokenContract: entry.tokenContract || "all",
              transactions: entry.transactions,
              timestamp: entry.timestamp || Date.now(),
            };

            store.put(updatedEntry);
            imported++;
          } catch {
            errors++;
          }
        }

        tx.oncomplete = () => resolve({ imported, skipped, errors });
        tx.onerror = () => reject(tx.error);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
