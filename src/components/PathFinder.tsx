import React, { useState } from "react";
import { Transaction, PathFinderResult, TransactionPath } from "../types";
import { useForensicsWorker } from "../hooks/useForensicsWorker";
import { pathFinderCache, generateCacheKey } from "../utils/cache";
import { exportData } from "../utils/export";
import LoadingSpinner from "./shared/LoadingSpinner";
import DepthSlider from "./shared/DepthSlider";
import ExportButton from "./shared/ExportButton";
import SeverityBadge from "./shared/SeverityBadge";
import {
  Search,
  Star,
  ArrowRight,
  Clock,
  TrendingUp,
  Route,
} from "lucide-react";

interface PathFinderProps {
  transactions: Transaction[];
}

const PathFinder: React.FC<PathFinderProps> = ({ transactions }) => {
  const { executeTask, isReady } = useForensicsWorker();
  const [sourceAddress, setSourceAddress] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [maxDepth, setMaxDepth] = useState(10);
  const [result, setResult] = useState<PathFinderResult | null>(null);
  const [selectedPath, setSelectedPath] = useState<TransactionPath | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleFindPaths = async () => {
    if (!sourceAddress || !targetAddress || !isReady) return;

    setIsLoading(true);

    const cacheKey = generateCacheKey("pathFinder", {
      sourceAddress,
      targetAddress,
      maxDepth,
    });
    let pathResult = pathFinderCache.get(cacheKey);

    if (!pathResult) {
      pathResult = await executeTask<PathFinderResult>({
        type: "FIND_PATHS",
        payload: {
          transactions,
          source: sourceAddress,
          target: targetAddress,
          maxDepth,
          maxPaths: 100,
        },
      });
      if (pathResult) {
        pathFinderCache.set(cacheKey, pathResult);
      }
    }

    setResult(pathResult);
    if (pathResult && pathResult.paths.length > 0) {
      setSelectedPath(pathResult.shortestPath);
    }
    setIsLoading(false);
  };

  const handleExport = (format: "csv" | "json") => {
    if (result) {
      exportData(result.paths, "paths");
    }
  };

  const getSeverity = (
    score: number
  ): "low" | "medium" | "high" | "critical" => {
    if (score >= 80) return "critical";
    if (score >= 60) return "high";
    if (score >= 40) return "medium";
    return "low";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Route className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Path Finder</h2>
          <p className="text-slate-400 text-sm">
            Find all paths connecting two addresses
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Source Address
            </label>
            <input
              type="text"
              value={sourceAddress}
              onChange={(e) => setSourceAddress(e.target.value)}
              placeholder="Enter source address..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Target Address
            </label>
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="Enter target address..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <DepthSlider
          value={maxDepth}
          onChange={setMaxDepth}
          min={2}
          max={15}
          label="Maximum Path Depth"
        />

        <div className="flex gap-3">
          <button
            onClick={handleFindPaths}
            disabled={!sourceAddress || !targetAddress || isLoading}
            className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            {isLoading ? "Searching..." : "Find Paths"}
          </button>
          {result && result.paths.length > 0 && (
            <ExportButton onExport={handleExport} formats={["csv", "json"]} />
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading && (
        <LoadingSpinner message="Finding paths between addresses..." />
      )}

      {result && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Path List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Found Paths ({result.statistics.totalPathsFound})
              </h3>
              <p className="text-slate-500 text-xs mb-3">
                Avg length: {result.statistics.avgPathLength.toFixed(1)} hops
              </p>

              {result.paths.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400">No paths found</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Try increasing max depth or check addresses
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {result.paths.map((path, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPath(path)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedPath === path
                          ? "bg-indigo-900/30 border-indigo-500"
                          : "bg-slate-800/30 border-slate-700 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-xs">
                          Path #{idx + 1}
                        </span>
                        {path === result.shortestPath && (
                          <div className="flex items-center gap-1 text-yellow-400 text-xs">
                            <Star className="w-3 h-3 fill-current" />
                            Shortest
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{path.hops} hops</span>
                        <SeverityBadge
                          severity={getSeverity(path.suspicionScore)}
                          score={Math.round(path.suspicionScore)}
                          size="sm"
                          showIcon={false}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Path Details */}
          <div className="lg:col-span-2">
            {selectedPath ? (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">Path Details</h3>
                  <SeverityBadge
                    severity={getSeverity(selectedPath.suspicionScore)}
                    score={Math.round(selectedPath.suspicionScore)}
                  />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs mb-1">Hops</p>
                    <p className="text-white text-xl font-bold">
                      {selectedPath.hops}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs mb-1">Total Amount</p>
                    <p className="text-white text-xl font-bold">
                      {selectedPath.totalAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs mb-1">Duration</p>
                    <p className="text-white text-xl font-bold">
                      {(
                        (selectedPath.endDate.getTime() -
                          selectedPath.startDate.getTime()) /
                        (1000 * 60 * 60)
                      ).toFixed(0)}
                      h
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-slate-500 text-xs mb-1">Avg Delay</p>
                    <p className="text-white text-xl font-bold">
                      {(selectedPath.avgDelay / (1000 * 60)).toFixed(0)}m
                    </p>
                  </div>
                </div>

                {/* Path Visualization */}
                <div className="bg-slate-950 rounded-lg p-4">
                  <p className="text-slate-400 text-xs mb-3">
                    Transaction Flow
                  </p>
                  <div className="space-y-2">
                    {selectedPath.addresses.map((addr, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-indigo-900/50 rounded-full flex items-center justify-center border border-indigo-500/30">
                          <span className="text-indigo-400 text-xs font-bold">
                            {idx}
                          </span>
                        </div>
                        <div className="flex-1 bg-slate-800/50 rounded px-3 py-2">
                          <p
                            className="text-slate-300 font-mono text-xs truncate copyable"
                            title={addr}
                            data-copy={addr}
                          >
                            {addr}
                          </p>
                        </div>
                        {idx < selectedPath.addresses.length - 1 && (
                          <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Transaction Details */}
                <div>
                  <p className="text-slate-400 text-sm font-semibold mb-3">
                    Transactions
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedPath.transactions.map((tx, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-800/30 rounded-lg p-3 text-xs"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-slate-500">
                            Transaction #{idx + 1}
                          </span>
                          <span className="text-white font-semibold">
                            {tx.amount.toLocaleString()} {tx.currency}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Clock className="w-3 h-3" />
                          {tx.date.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                <Search className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400">Select a path to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PathFinder;
