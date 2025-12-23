import { Transaction } from "../types";
import { getCachedTransactions, setCachedTransactions } from "./walletCache";

// ===== CONFIG =====

// Moralis API - primary provider (requires free API key from moralis.com)
const MORALIS_API_BASE = "https://deep-index.moralis.io/api/v2.2";

// Chain identifiers for Moralis API
const MORALIS_CHAINS: Record<string, string> = {
  bsc: "0x38", // 56 in hex
  eth: "0x1", // 1 in hex
  polygon: "0x89", // 137 in hex
  arbitrum: "0xa4b1", // 42161 in hex
  base: "0x2105", // 8453 in hex
  optimism: "0xa", // 10 in hex
};

// ERC20 Transfer event signature (for RPC fallback)
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Chain configurations
export interface ChainConfig {
  name: string;
  symbol: string;
  chainId: number;
  explorerUrl: string;
  usdtContract?: string;
}

export const CHAINS: Record<string, ChainConfig> = {
  bsc: {
    name: "BNB Smart Chain",
    symbol: "BSC",
    chainId: 56,
    explorerUrl: "https://bscscan.com",
    usdtContract: "0x55d398326f99059fF775485246999027B3197955",
  },
  eth: {
    name: "Ethereum",
    symbol: "ETH",
    chainId: 1,
    explorerUrl: "https://etherscan.io",
    usdtContract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  polygon: {
    name: "Polygon",
    symbol: "MATIC",
    chainId: 137,
    explorerUrl: "https://polygonscan.com",
    usdtContract: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  },
  arbitrum: {
    name: "Arbitrum One",
    symbol: "ARB",
    chainId: 42161,
    explorerUrl: "https://arbiscan.io",
    usdtContract: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  },
  base: {
    name: "Base",
    symbol: "BASE",
    chainId: 8453,
    explorerUrl: "https://basescan.org",
    usdtContract: undefined,
  },
  optimism: {
    name: "Optimism",
    symbol: "OP",
    chainId: 10,
    explorerUrl: "https://optimistic.etherscan.io",
    usdtContract: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
  },
};

// ===== TYPES =====

export interface TokenTransfer {
  hash: string;
  from: string;
  to: string;
  value: string; // Raw value in wei/smallest unit
  tokenDecimal: string;
  tokenSymbol: string;
  timeStamp: string;
  blockNumber: string;
  contractAddress: string;
}

export interface ScanProgress {
  address: string;
  layer: number;
  status: "pending" | "loading" | "success" | "error" | "paused" | "stopped";
  transactions: Transaction[];
  error?: string;
}

/**
 * Controller for pause/stop scanning
 */
export class ScanController {
  private _isPaused = false;
  private _isStopped = false;
  private _pausePromise: Promise<void> | null = null;
  private _pauseResolve: (() => void) | null = null;

  get isPaused() {
    return this._isPaused;
  }
  get isStopped() {
    return this._isStopped;
  }

  pause() {
    if (!this._isPaused && !this._isStopped) {
      this._isPaused = true;
      this._pausePromise = new Promise((resolve) => {
        this._pauseResolve = resolve;
      });
    }
  }

  resume() {
    if (this._isPaused) {
      this._isPaused = false;
      if (this._pauseResolve) {
        this._pauseResolve();
        this._pauseResolve = null;
        this._pausePromise = null;
      }
    }
  }

  stop() {
    this._isStopped = true;
    this.resume(); // Unblock if paused
  }

  reset() {
    this._isPaused = false;
    this._isStopped = false;
    this._pausePromise = null;
    this._pauseResolve = null;
  }

  async waitIfPaused() {
    if (this._pausePromise) {
      await this._pausePromise;
    }
  }
}

export interface ScanResult {
  address: string;
  layer: number;
  transactions: Transaction[];
  outgoingAddresses: string[]; // Addresses that received funds from this wallet
}

export interface BulkScanResult {
  totalAddresses: number;
  successCount: number;
  errorCount: number;
  allTransactions: Transaction[];
  layerMap: Map<number, string[]>; // layer -> addresses at that layer
  addressToLayer: Map<string, number>; // address -> layer number
  wasStopped?: boolean;
}

// ===== RATE LIMITER =====

class RateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;
  private lastCall = 0;
  private minInterval: number;

  constructor(callsPerSecond: number) {
    this.minInterval = 1000 / callsPerSecond;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastCall;
      if (elapsed < this.minInterval) {
        await new Promise((r) => setTimeout(r, this.minInterval - elapsed));
      }
      this.lastCall = Date.now();
      const task = this.queue.shift();
      if (task) await task();
    }

    this.processing = false;
  }
}

// Rate limiter for Moralis free tier (25 requests/sec but we'll be conservative)
const rateLimiter = new RateLimiter(5);

/**
 * Moralis API response type for token transfers
 */
interface MoralisTransfer {
  transaction_hash: string;
  from_address: string;
  to_address: string;
  value: string;
  token_decimals: string;
  token_symbol: string;
  block_timestamp: string;
  block_number: string;
  address: string; // token contract address
}

// Track failed API keys to avoid reusing them in the same session
const failedApiKeys = new Set<string>();

/**
 * Parse API keys input (comma, newline, or semicolon separated)
 */
export function parseApiKeys(input: string): string[] {
  return input
    .split(/[\n,;]/)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

/**
 * Pagination options for fetching transactions
 */
export interface PaginationOptions {
  maxPages?: number; // Maximum number of API pages to fetch (default: 10)
  maxTransactions?: number; // Maximum transactions to fetch (default: 1000)
}

// Default pagination limits
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_TRANSACTIONS = 1000;

/**
 * Fetch token transfers using Moralis API with pagination support
 * Requires API key from https://moralis.com
 *
 * Moralis returns max 100 transfers per page. This function handles pagination
 * automatically using the cursor mechanism.
 */
async function fetchFromMoralis(
  address: string,
  apiKey: string,
  chain: keyof typeof CHAINS,
  contractAddress?: string,
  fromDate?: string, // YYYY-MM-DDTHH:mm format (local time)
  toDate?: string, // YYYY-MM-DDTHH:mm format (local time)
  paginationOptions?: PaginationOptions
): Promise<TokenTransfer[]> {
  const moralisChain = MORALIS_CHAINS[chain];
  if (!moralisChain) throw new Error(`Chain ${chain} not supported by Moralis`);

  const maxPages = paginationOptions?.maxPages ?? DEFAULT_MAX_PAGES;
  const maxTransactions =
    paginationOptions?.maxTransactions ?? DEFAULT_MAX_TRANSACTIONS;

  const allTransfers: TokenTransfer[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    // Build URL with query params
    const params = new URLSearchParams({
      chain: moralisChain,
      order: "ASC",
      limit: "100", // Max per request
    });

    // Filter by specific token if provided
    if (contractAddress) {
      params.set("contract_addresses", contractAddress);
    }

    // Filter by date range
    // Convert local datetime string (e.g., 2023-12-25T14:30) to ISO UTC string for API
    if (fromDate) {
      const isoFrom = new Date(fromDate).toISOString();
      params.set("from_date", isoFrom);
    }
    if (toDate) {
      const isoTo = new Date(toDate).toISOString();
      params.set("to_date", isoTo);
    }

    // Add cursor for pagination
    if (cursor) {
      params.set("cursor", cursor);
    }

    const url = `${MORALIS_API_BASE}/${address}/erc20/transfers?${params}`;

    const response = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Mark this key as failed if rate limited or unauthorized
      if (response.status === 429 || response.status === 401) {
        failedApiKeys.add(apiKey);
        console.warn(
          `API key ${apiKey.slice(0, 8)}... marked as failed (status ${
            response.status
          })`
        );
      }
      throw new Error(`Moralis API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const transfers: MoralisTransfer[] = data.result || [];

    // Convert and add to all transfers
    const converted = transfers.map((t) => ({
      hash: t.transaction_hash,
      from: t.from_address,
      to: t.to_address,
      value: t.value,
      tokenDecimal: t.token_decimals || "18",
      tokenSymbol: t.token_symbol || "UNKNOWN",
      timeStamp: (new Date(t.block_timestamp).getTime() / 1000).toString(),
      blockNumber: t.block_number,
      contractAddress: t.address,
    }));

    allTransfers.push(...converted);
    pageCount++;

    // Get cursor for next page
    cursor = data.cursor || null;

    // Log progress for debugging
    if (pageCount > 1 || cursor) {
      console.log(
        `[${address.slice(0, 8)}...] Page ${pageCount}: ${
          transfers.length
        } transfers (total: ${allTransfers.length})${
          cursor ? ", more available" : ", done"
        }`
      );
    }

    // Check limits
    if (pageCount >= maxPages) {
      console.log(
        `[${address.slice(0, 8)}...] Reached max pages limit (${maxPages})`
      );
      break;
    }

    if (allTransfers.length >= maxTransactions) {
      console.log(
        `[${address.slice(
          0,
          8
        )}...] Reached max transactions limit (${maxTransactions})`
      );
      // Trim to exact limit
      allTransfers.length = maxTransactions;
      break;
    }

    // Small delay between pages to avoid rate limiting
    if (cursor) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } while (cursor);

  return allTransfers;
}

/**
 * Fetch all token transfers for an address using Moralis API
 * Supports multiple API keys - rotates on error/rate limit
 */
export async function fetchTokenTransfers(
  address: string,
  apiKeysInput: string,
  chain: keyof typeof CHAINS = "bsc",
  contractAddress?: string,
  fromDate?: string,
  toDate?: string,
  paginationOptions?: PaginationOptions
): Promise<TokenTransfer[]> {
  const config = CHAINS[chain];
  if (!config) throw new Error(`Unknown chain: ${chain}`);

  // Parse multiple API keys
  const allKeys = parseApiKeys(apiKeysInput);
  if (allKeys.length === 0) {
    throw new Error(
      "Moralis API key required. Get a free key at: https://moralis.com"
    );
  }

  // Filter out previously failed keys
  const availableKeys = allKeys.filter((key) => !failedApiKeys.has(key));

  // If all keys failed, reset and try again
  const keysToTry = availableKeys.length > 0 ? availableKeys : allKeys;
  if (availableKeys.length === 0) {
    console.log("All keys previously failed, resetting failed keys list...");
    failedApiKeys.clear();
  }

  // Try each key until one works
  let lastError: Error | null = null;
  for (const apiKey of keysToTry) {
    try {
      console.log(
        `Trying API key ${apiKey.slice(0, 8)}... (${
          keysToTry.indexOf(apiKey) + 1
        }/${keysToTry.length})`
      );
      return await fetchFromMoralis(
        address,
        apiKey,
        chain,
        contractAddress,
        fromDate,
        toDate,
        paginationOptions
      );
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `API key ${apiKey.slice(0, 8)}... failed:`,
        (err as Error).message
      );
      // Continue to next key
    }
  }

  throw new Error(
    `All ${keysToTry.length} API keys failed. Last error: ${lastError?.message}`
  );
}

/**
 * Fetch USDT transfers specifically
 */
export async function fetchUSDTTransfers(
  address: string,
  apiKey: string,
  chain: keyof typeof CHAINS = "bsc",
  fromDate?: string,
  toDate?: string,
  paginationOptions?: PaginationOptions
): Promise<TokenTransfer[]> {
  const config = CHAINS[chain];
  return fetchTokenTransfers(
    address,
    apiKey,
    chain,
    config.usdtContract,
    fromDate,
    toDate,
    paginationOptions
  );
}

/**
 * Convert TokenTransfer to our Transaction type
 */
export function convertToTransaction(
  transfer: TokenTransfer,
  chain: keyof typeof CHAINS = "bsc"
): Transaction {
  const decimals = parseInt(transfer.tokenDecimal) || 18;
  const amount = parseFloat(transfer.value) / Math.pow(10, decimals);

  return {
    id: transfer.hash,
    date: new Date(parseInt(transfer.timeStamp) * 1000),
    from: transfer.from.toLowerCase(),
    to: transfer.to.toLowerCase(),
    amount,
    currency: transfer.tokenSymbol || "USDT",
    type: "transfer",
  };
}

/**
 * Scan a single address with rate limiting and caching
 */
export async function scanAddress(
  address: string,
  apiKey: string,
  chain: keyof typeof CHAINS = "bsc",
  usdtOnly = true,
  useCache = true,
  fromDate?: string,
  toDate?: string,
  paginationOptions?: PaginationOptions
): Promise<Transaction[]> {
  const config = CHAINS[chain];
  const tokenContract = usdtOnly ? config.usdtContract || null : null;

  // Check cache first (skip cache if date filters are applied)
  if (useCache && !fromDate && !toDate) {
    const cached = await getCachedTransactions(address, chain, tokenContract);
    if (cached) {
      // Convert cached raw transfers to Transaction objects
      return cached.map((t: TokenTransfer) => convertToTransaction(t, chain));
    }
  }

  // Cache miss - fetch from API with rate limiting
  return rateLimiter.schedule(async () => {
    const transfers = usdtOnly
      ? await fetchUSDTTransfers(
          address,
          apiKey,
          chain,
          fromDate,
          toDate,
          paginationOptions
        )
      : await fetchTokenTransfers(
          address,
          apiKey,
          chain,
          undefined,
          fromDate,
          toDate,
          paginationOptions
        );

    // Save to cache only if strictly no date filter (full history)
    if (useCache && transfers.length >= 0 && !fromDate && !toDate) {
      await setCachedTransactions(address, chain, tokenContract, transfers);
    }

    return transfers.map((t) => convertToTransaction(t, chain));
  });
}

/**
 * Scan multiple addresses with progress callback and pause/stop support
 */
/**
 * Scan multiple addresses with progress callback and pause/stop support
 */
export async function scanBulkAddresses(
  addresses: string[],
  apiKey: string,
  options: {
    chain?: keyof typeof CHAINS;
    usdtOnly?: boolean;
    useCache?: boolean;
    controller?: ScanController;
    onProgress?: (progress: ScanProgress) => void;
    startLayer?: number;
    fromDate?: string;
    toDate?: string;
    maxPages?: number;
    maxTransactions?: number;
  } = {}
): Promise<BulkScanResult> {
  const {
    chain = "bsc",
    usdtOnly = true,
    useCache = true,
    controller,
    onProgress,
    startLayer = 1,
    fromDate,
    toDate,
    maxPages,
    maxTransactions,
  } = options;

  const paginationOptions: PaginationOptions = { maxPages, maxTransactions };

  const normalizedAddresses = [
    ...new Set(addresses.map((a) => a.toLowerCase().trim())),
  ];
  const allTransactions: Transaction[] = [];
  const layerMap = new Map<number, string[]>();
  const addressToLayer = new Map<string, number>();
  let successCount = 0;
  let errorCount = 0;
  let wasStopped = false;

  // Set initial layer for all input addresses
  layerMap.set(startLayer, normalizedAddresses);
  normalizedAddresses.forEach((addr) => addressToLayer.set(addr, startLayer));

  for (const address of normalizedAddresses) {
    // Check for stop
    if (controller?.isStopped) {
      wasStopped = true;
      break;
    }

    // Wait if paused
    if (controller?.isPaused) {
      onProgress?.({
        address,
        layer: startLayer,
        status: "paused",
        transactions: [],
      });
      await controller.waitIfPaused();
    }

    // Check again after resume (might have been stopped while paused)
    if (controller?.isStopped) {
      wasStopped = true;
      break;
    }

    const progress: ScanProgress = {
      address,
      layer: startLayer,
      status: "loading",
      transactions: [],
    };
    onProgress?.(progress);

    try {
      const transactions = await scanAddress(
        address,
        apiKey,
        chain,
        usdtOnly,
        useCache,
        fromDate,
        toDate,
        paginationOptions
      );
      allTransactions.push(...transactions);
      successCount++;

      progress.status = "success";
      progress.transactions = transactions;
      onProgress?.(progress);
    } catch (error) {
      errorCount++;
      progress.status = "error";
      progress.error = (error as Error).message;
      onProgress?.(progress);
    }
  }

  return {
    totalAddresses: normalizedAddresses.length,
    successCount,
    errorCount,
    allTransactions,
    layerMap,
    addressToLayer,
    wasStopped,
  };
}

/**
 * Scan multiple layers (F1 -> F2 -> F3...) with pause/stop support
 * Starting from layer 1 addresses, find outgoing destinations,
 * then scan those as layer 2, and so on.
 */
export async function scanMultipleLayers(
  initialAddresses: string[],
  apiKey: string,
  options: {
    chain?: keyof typeof CHAINS;
    usdtOnly?: boolean;
    useCache?: boolean;
    controller?: ScanController;
    maxLayers?: number;
    onProgress?: (progress: ScanProgress) => void;
    onLayerComplete?: (layer: number, addresses: string[]) => void;
    fromDate?: string;
    toDate?: string;
    maxPages?: number;
    maxTransactions?: number;
  } = {}
): Promise<BulkScanResult> {
  const {
    chain = "bsc",
    usdtOnly = true,
    useCache = true,
    controller,
    maxLayers = 3,
    onProgress,
    onLayerComplete,
    fromDate,
    toDate,
    maxPages,
    maxTransactions,
  } = options;

  const paginationOptions: PaginationOptions = { maxPages, maxTransactions };

  const allTransactions: Transaction[] = [];
  const layerMap = new Map<number, string[]>();
  const addressToLayer = new Map<string, number>();
  const scannedAddresses = new Set<string>();
  let successCount = 0;
  let errorCount = 0;
  let wasStopped = false;

  // Normalize initial addresses
  let currentLayer = 1;
  let currentAddresses = initialAddresses.map((a) => a.toLowerCase().trim());

  while (currentLayer <= maxLayers && currentAddresses.length > 0) {
    // Check for stop at layer level
    if (controller?.isStopped) {
      wasStopped = true;
      break;
    }

    // Filter out already scanned addresses
    const addressesToScan = currentAddresses.filter(
      (a) => !scannedAddresses.has(a)
    );

    if (addressesToScan.length === 0) break;

    layerMap.set(currentLayer, addressesToScan);
    addressesToScan.forEach((addr) => {
      addressToLayer.set(addr, currentLayer);
      scannedAddresses.add(addr);
    });

    const nextLayerAddresses = new Set<string>();

    for (const address of addressesToScan) {
      // Check for stop
      if (controller?.isStopped) {
        wasStopped = true;
        break;
      }

      // Wait if paused
      if (controller?.isPaused) {
        onProgress?.({
          address,
          layer: currentLayer,
          status: "paused",
          transactions: [],
        });
        await controller.waitIfPaused();
      }

      // Check again after resume
      if (controller?.isStopped) {
        wasStopped = true;
        break;
      }

      const progress: ScanProgress = {
        address,
        layer: currentLayer,
        status: "loading",
        transactions: [],
      };
      onProgress?.(progress);

      try {
        const transactions = await scanAddress(
          address,
          apiKey,
          chain,
          usdtOnly,
          useCache,
          fromDate,
          toDate,
          paginationOptions
        );
        allTransactions.push(...transactions);
        successCount++;

        // Find outgoing addresses for next layer
        transactions
          .filter((tx) => tx.from.toLowerCase() === address)
          .forEach((tx) => {
            const dest = tx.to.toLowerCase();
            if (!scannedAddresses.has(dest)) {
              nextLayerAddresses.add(dest);
            }
          });

        progress.status = "success";
        progress.transactions = transactions;
        onProgress?.(progress);
      } catch (error) {
        errorCount++;
        progress.status = "error";
        progress.error = (error as Error).message;
        onProgress?.(progress);
      }
    }

    if (wasStopped) break;

    onLayerComplete?.(currentLayer, addressesToScan);

    // Move to next layer
    currentLayer++;
    currentAddresses = Array.from(nextLayerAddresses);
  }

  return {
    totalAddresses: scannedAddresses.size,
    successCount,
    errorCount,
    allTransactions,
    layerMap,
    addressToLayer,
    wasStopped,
  };
}

/**
 * Validate if an address looks like a valid EVM address
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Parse a text input containing addresses (one per line)
 * Automatically removes duplicates
 */
export function parseAddressInput(input: string): string[] {
  const addresses = input
    .split(/[\n,;]/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0)
    .filter(isValidEvmAddress);

  // Remove duplicates
  return [...new Set(addresses)];
}
