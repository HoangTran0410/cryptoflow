import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Database,
  Trash2,
  RefreshCw,
  Pause,
  Play,
  Square,
  Eye,
  EyeOff,
  Calendar,
} from "lucide-react";
import { Transaction } from "../types";
import {
  CHAINS,
  parseAddressInput,
  parseApiKeys,
  scanBulkAddresses,
  scanMultipleLayers,
  ScanProgress,
  BulkScanResult,
  ScanController,
} from "../utils/blockchainApi";
import {
  findLayer2Destinations,
  LayerStats,
  exportToCSV,
} from "../utils/flowAnalysis";
import {
  getCacheStats,
  clearAllCache,
  clearCacheForAddress,
  CacheStats,
} from "../utils/walletCache";
import { formatAddress } from "../utils/helpers";

interface WalletScannerProps {
  onDataLoaded: (data: Transaction[]) => void;
}

type ScanMode = "single-layer" | "multi-layer";

const API_KEY_STORAGE_KEY = "cryptoflow_etherscan_api_key";

const WalletScanner: React.FC<WalletScannerProps> = ({ onDataLoaded }) => {
  // Form state
  const [chain, setChain] = useState<keyof typeof CHAINS>("bsc");
  const [addressInput, setAddressInput] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>("single-layer");
  const [maxLayers, setMaxLayers] = useState(2);

  // API key - single key for all chains (Etherscan API V2)
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
    }
    return "";
  });

  // Auto-save API key to localStorage when it changes
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    }
  }, [apiKey]);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState<ScanProgress[]>([]);
  const [result, setResult] = useState<BulkScanResult | null>(null);
  const [layer2Stats, setLayer2Stats] = useState<LayerStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<ScanController | null>(null);

  // UI state
  const [showProgress, setShowProgress] = useState(true);
  const [showLayer2, setShowLayer2] = useState(true);
  const [showCache, setShowCache] = useState(false);
  const [useCache, setUseCache] = useState(true);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [clearAddressInput, setClearAddressInput] = useState("");
  const [showApiKeys, setShowApiKeys] = useState(false);

  // Date range filter
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const addresses = parseAddressInput(addressInput);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setAddressInput(text);
    };
    reader.readAsText(file);
  };

  const handleScan = useCallback(async () => {
    if (!apiKey.trim()) {
      setError(
        "Moralis API key required. Get a free key at https://admin.moralis.com/web3apis"
      );
      return;
    }

    if (addresses.length === 0) {
      setError("Please enter at least one valid address");
      return;
    }

    // Create new controller for this scan
    const controller = new ScanController();
    controllerRef.current = controller;

    setIsScanning(true);
    setIsPaused(false);
    setError(null);
    setProgress([]);
    setResult(null);
    setLayer2Stats([]);

    try {
      let scanResult: BulkScanResult;

      const onProgress = (p: ScanProgress) => {
        setProgress((prev) => {
          const existing = prev.findIndex((x) => x.address === p.address);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = p;
            return updated;
          }
          return [...prev, p];
        });
      };

      if (scanMode === "multi-layer") {
        scanResult = await scanMultipleLayers(addresses, apiKey, {
          chain,
          usdtOnly: true,
          useCache,
          controller,
          maxLayers,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          onProgress,
          onLayerComplete: (layer, addrs) => {
            console.log(`Layer ${layer} complete:`, addrs.length, "addresses");
          },
        });
      } else {
        scanResult = await scanBulkAddresses(addresses, apiKey, {
          chain,
          usdtOnly: true,
          useCache,
          controller,
          onProgress,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
      }

      setResult(scanResult);

      // Calculate Layer 2 destinations
      const l2Stats = findLayer2Destinations(
        scanResult.allTransactions,
        addresses
      );
      setLayer2Stats(l2Stats);

      // Load transactions into main app
      if (scanResult.allTransactions.length > 0) {
        onDataLoaded(scanResult.allTransactions);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsScanning(false);
      setIsPaused(false);
      controllerRef.current = null;
    }
  }, [apiKey, addresses, chain, scanMode, maxLayers, useCache, onDataLoaded]);

  const handlePause = useCallback(() => {
    if (controllerRef.current && !controllerRef.current.isPaused) {
      controllerRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const handleResume = useCallback(() => {
    if (controllerRef.current && controllerRef.current.isPaused) {
      controllerRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.stop();
      setIsPaused(false);
    }
  }, []);

  const formatAmount = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
    return amount.toFixed(2);
  };

  const completedCount = progress.filter((p) => p.status === "success").length;
  const errorCount = progress.filter((p) => p.status === "error").length;
  const progressPercent =
    addresses.length > 0 ? (completedCount / addresses.length) * 100 : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">
          🔍 Wallet Scanner
        </h2>
        <p className="text-slate-400">
          Scan wallet addresses to fetch USDT transactions and trace fund flows
        </p>
      </div>

      {/* API Keys Section - Moralis (supports multiple) */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-300">
            Moralis API Keys
            <span className="text-slate-500 font-normal ml-2">
              ({parseApiKeys(apiKey).length} keys)
            </span>
            <a
              href="https://admin.moralis.com/web3apis"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
            >
              Get free key <ExternalLink className="w-3 h-3" />
            </a>
          </label>
          <button
            onClick={() => setShowApiKeys(!showApiKeys)}
            className="text-slate-400 hover:text-white transition-colors"
            title={showApiKeys ? "Hide API keys" : "Show API keys"}
          >
            {showApiKeys ? (
              <Eye className="w-5 h-5" />
            ) : (
              <EyeOff className="w-5 h-5" />
            )}
          </button>
        </div>
        <textarea
          value={
            showApiKeys
              ? apiKey
              : apiKey
                  .split("\n")
                  .filter((k) => k)
                  .map((k) => "************************")
                  .join("\n")
          }
          disabled={apiKey && !showApiKeys}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            showApiKeys
              ? "Enter Moralis API keys (one per line)\neyJhbGcixxx...\neyJhbGcixxy..."
              : "API keys are hidden"
          }
          rows={3}
          className={`w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-sm resize-y`}
        />
        <p className="text-xs text-slate-500 mt-2">
          🔑 Enter multiple keys (one per line) - auto-rotates on rate limit.
          Free tier: 40K requests/month per key.
        </p>
      </div>

      {/* Chain & Mode Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Blockchain
          </label>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value as keyof typeof CHAINS)}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-indigo-500 outline-none"
          >
            {Object.entries(CHAINS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name} ({config.symbol})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Scan Mode
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setScanMode("single-layer")}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                scanMode === "single-layer"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-800"
              }`}
            >
              Single Layer (F1)
            </button>
            <button
              onClick={() => setScanMode("multi-layer")}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                scanMode === "multi-layer"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-900 text-slate-400 hover:bg-slate-800"
              }`}
            >
              Multi Layer (F1→F2→...)
            </button>
          </div>
          {scanMode === "multi-layer" && (
            <div className="mt-3 flex items-center gap-3">
              <label className="text-sm text-slate-400">Max layers:</label>
              <input
                type="number"
                min={2}
                max={5}
                value={maxLayers}
                onChange={(e) => setMaxLayers(parseInt(e.target.value) || 2)}
                className="w-20 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-center"
              />
            </div>
          )}
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Date & Time Range (Optional)
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              From Date & Time
            </label>
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              step="1"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              To Date & Time
            </label>
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              step="1"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-indigo-500 outline-none"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          📅 Leave empty to fetch most recent transactions.
        </p>
      </div>

      {/* Address Input */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-slate-300">
            Wallet Addresses ({addresses.length} valid)
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Clean and format the addresses
                const cleaned = addresses.join("\n");
                setAddressInput(cleaned);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg flex items-center gap-2 transition-colors"
              title="Parse and remove duplicates"
            >
              <CheckCircle2 className="w-4 h-4" />
              Clean ({addresses.length})
            </button>
            <label className="cursor-pointer px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg flex items-center gap-2 transition-colors">
              <Upload className="w-4 h-4" />
              Upload TXT
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
        <textarea
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          placeholder="Paste wallet addresses here (one per line)&#10;0x1234...&#10;0x5678...&#10;0xabcd..."
          rows={8}
          className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-sm resize-y"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-xl flex items-center gap-3 text-red-200">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Scan Controls */}
      <div className="flex gap-3">
        {!isScanning ? (
          <button
            onClick={handleScan}
            disabled={addresses.length === 0}
            className={`flex-1 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
              addresses.length === 0
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25"
            }`}
          >
            <Search className="w-5 h-5" />
            Start Scanning{" "}
            {addresses.length > 0 && `(${addresses.length} addresses)`}
          </button>
        ) : (
          <>
            {/* Progress indicator */}
            <div className="flex-1 py-4 rounded-xl bg-slate-700 text-white font-semibold text-lg flex items-center justify-center gap-3">
              <Loader2
                className={`w-5 h-5 ${!isPaused ? "animate-spin" : ""}`}
              />
              {isPaused ? "Paused" : "Scanning..."} ({completedCount}/
              {addresses.length})
            </div>

            {/* Pause/Resume button */}
            <button
              onClick={isPaused ? handleResume : handlePause}
              className={`px-6 py-4 rounded-xl font-semibold flex items-center gap-2 transition-all ${
                isPaused
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-amber-600 hover:bg-amber-500 text-white"
              }`}
            >
              {isPaused ? (
                <>
                  <Play className="w-5 h-5" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-5 h-5" />
                  Pause
                </>
              )}
            </button>

            {/* Stop button */}
            <button
              onClick={handleStop}
              className="px-6 py-4 rounded-xl font-semibold bg-red-600 hover:bg-red-500 text-white flex items-center gap-2 transition-all"
            >
              <Square className="w-5 h-5" />
              Stop
            </button>
          </>
        )}
      </div>

      {/* Progress Section */}
      {progress.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <button
            onClick={() => setShowProgress(!showProgress)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-white">Scan Progress</span>
              <span className="text-sm text-slate-400">
                {completedCount} success, {errorCount} errors
              </span>
            </div>
            {showProgress ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>

          {showProgress && (
            <div className="px-6 pb-4">
              {/* Progress Bar */}
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Progress List */}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {progress.slice(-50).map((p) => (
                  <div
                    key={p.address}
                    className="flex items-center gap-3 py-1.5 text-sm"
                  >
                    {p.status === "loading" && (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    )}
                    {p.status === "success" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {p.status === "error" && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-mono text-slate-300 truncate flex-1">
                      {p.address}
                    </span>
                    {p.status === "success" && (
                      <span className="text-slate-500">
                        {p.transactions.length} tx
                      </span>
                    )}
                    {p.status === "error" && (
                      <span className="text-red-400 text-xs">{p.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Layer 2 Destinations */}
      {layer2Stats.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
          <button
            onClick={() => setShowLayer2(!showLayer2)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-white">
                🎯 Layer 2 Destinations
              </span>
              <span className="text-sm text-emerald-400">
                {layer2Stats.length} wallets found
              </span>
            </div>
            {showLayer2 ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>

          {showLayer2 && (
            <div className="px-6 pb-4">
              <div className="flex justify-end mb-3">
                <button
                  onClick={() =>
                    exportToCSV(layer2Stats, "layer2_destinations.csv")
                  }
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Address</th>
                      <th className="pb-2 pr-4 text-right">Total Received</th>
                      <th className="pb-2 pr-4 text-right">TX Count</th>
                      <th className="pb-2 text-right">Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layer2Stats.slice(0, 20).map((stat, idx) => (
                      <tr
                        key={stat.address}
                        className="border-b border-slate-800 hover:bg-slate-700/30"
                      >
                        <td className="py-2 pr-4 text-slate-500">{idx + 1}</td>
                        <td className="py-2 pr-4">
                          <a
                            href={`${CHAINS[chain].explorerUrl}/address/${stat.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                          >
                            {stat.address.slice(0, 10)}...
                            {stat.address.slice(-8)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-2 pr-4 text-right text-emerald-400 font-medium">
                          {formatAmount(stat.totalReceived)} USDT
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-300">
                          {stat.incomingTxCount}
                        </td>
                        <td className="py-2 text-right text-slate-400">
                          {stat.sourceAddresses.size}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {layer2Stats.length > 20 && (
                <p className="text-center text-slate-500 mt-3 text-sm">
                  Showing top 20 of {layer2Stats.length} destinations
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Result Summary */}
      {result && (
        <div className="bg-gradient-to-r from-emerald-900/30 to-indigo-900/30 rounded-xl p-6 border border-emerald-800/50">
          <h3 className="text-lg font-semibold text-white mb-4">
            ✅ Scan Complete
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Addresses Scanned</p>
              <p className="text-2xl font-bold text-white">
                {result.successCount}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Total Transactions</p>
              <p className="text-2xl font-bold text-indigo-400">
                {result.allTransactions.length}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Layer 2 Destinations</p>
              <p className="text-2xl font-bold text-emerald-400">
                {layer2Stats.length}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Errors</p>
              <p className="text-2xl font-bold text-red-400">
                {result.errorCount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cache Manager */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <button
          onClick={async () => {
            setShowCache(!showCache);
            if (!showCache) {
              const stats = await getCacheStats();
              setCacheStats(stats);
            }
          }}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-slate-400" />
            <span className="font-medium text-white">Cache Manager</span>
            {cacheStats && (
              <span className="text-sm text-slate-400">
                {cacheStats.totalEntries} entries ({cacheStats.totalSize})
              </span>
            )}
          </div>
          {showCache ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showCache && (
          <div className="px-6 pb-4 space-y-4">
            {/* Cache Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Use Cache</p>
                <p className="text-xs text-slate-500">
                  Skip API calls for cached addresses
                </p>
              </div>
              <button
                onClick={() => setUseCache(!useCache)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  useCache ? "bg-indigo-600" : "bg-slate-600"
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    useCache ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Clear specific address */}
            <div className="flex gap-2">
              <input
                type="text"
                value={clearAddressInput}
                onChange={(e) => setClearAddressInput(e.target.value)}
                placeholder="Enter address to clear cache..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:border-indigo-500 outline-none font-mono"
              />
              <button
                onClick={async () => {
                  if (clearAddressInput.trim()) {
                    const count = await clearCacheForAddress(
                      clearAddressInput.trim()
                    );
                    setClearAddressInput("");
                    const stats = await getCacheStats();
                    setCacheStats(stats);
                    alert(`Cleared ${count} cache entries for this address`);
                  }
                }}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded-lg flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>

            {/* Clear all & Refresh */}
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const stats = await getCacheStats();
                  setCacheStats(stats);
                }}
                className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Stats
              </button>
              <button
                onClick={async () => {
                  if (
                    confirm("Clear all cached data? This cannot be undone.")
                  ) {
                    await clearAllCache();
                    const stats = await getCacheStats();
                    setCacheStats(stats);
                  }
                }}
                className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Clear All Cache
              </button>
            </div>

            {/* Cache entries list */}
            {cacheStats && cacheStats.entries.length > 0 && (
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-4">Address</th>
                      <th className="pb-2 pr-4">Chain</th>
                      <th className="pb-2 pr-4 text-right">TX</th>
                      <th className="pb-2 text-right">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cacheStats.entries.slice(0, 20).map((entry, idx) => (
                      <tr key={idx} className="border-b border-slate-800">
                        <td className="py-2 pr-4 font-mono text-slate-300">
                          <span className="copyable">
                            {formatAddress(entry.address)}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-slate-400">
                          {entry.chain.toUpperCase()}
                        </td>
                        <td className="py-2 pr-4 text-right text-indigo-400">
                          {entry.txCount}
                        </td>
                        <td className="py-2 text-right text-slate-500 text-xs">
                          {Math.round(
                            (entry.expiresAt.getTime() - Date.now()) / 60000
                          )}
                          m left
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {cacheStats && cacheStats.entries.length === 0 && (
              <p className="text-center text-slate-500 py-4">No cached data</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WalletScanner;
