import React, { useState, useEffect, useCallback } from "react";
import { Transaction, SuspiciousPattern, AddressCluster } from "../types";
import { useForensicsWorker } from "../hooks/useForensicsWorker";
import { patternCache, generateCacheKey } from "../utils/cache";
import { exportData } from "../utils/export";
import LoadingSpinner from "./shared/LoadingSpinner";
import SeverityBadge from "./shared/SeverityBadge";
import ExportButton from "./shared/ExportButton";
import { Shield, AlertTriangle, Network, X, RefreshCw } from "lucide-react";

interface ForensicsDashboardProps {
  transactions: Transaction[];
}

const ForensicsDashboard: React.FC<ForensicsDashboardProps> = ({
  transactions,
}) => {
  const { executeTask, isReady } = useForensicsWorker();
  const [patterns, setPatterns] = useState<SuspiciousPattern[]>([]);
  const [clusters, setClusters] = useState<AddressCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");
  const [selectedPattern, setSelectedPattern] =
    useState<SuspiciousPattern | null>(null);

  // Run pattern detection
  const runAnalysis = useCallback(async () => {
    if (!isReady) return;

    setIsLoading(true);
    setLoadingProgress(10);
    setLoadingMessage("Initializing forensic engine...");

    // Check cache first
    const patternCacheKey = generateCacheKey("patterns", {
      txCount: transactions.length,
    });
    const clusterCacheKey = generateCacheKey("clusters", {
      txCount: transactions.length,
    });

    let cachedPatterns = patternCache.get(patternCacheKey);
    let cachedClusters = patternCache.get(clusterCacheKey);

    if (!cachedPatterns) {
      setLoadingProgress(30);
      setLoadingMessage("Detecting suspicious patterns...");
      cachedPatterns = await executeTask<SuspiciousPattern[]>({
        type: "DETECT_PATTERNS",
        payload: { transactions },
      });
      if (cachedPatterns) {
        patternCache.set(patternCacheKey, cachedPatterns);
      }
    }

    if (!cachedClusters) {
      setLoadingProgress(60);
      setLoadingMessage("Clustering addresses & analyzing behaviors...");
      cachedClusters = await executeTask<AddressCluster[]>({
        type: "CLUSTER_ADDRESSES",
        payload: { transactions },
      });
      if (cachedClusters) {
        patternCache.set(clusterCacheKey, cachedClusters);
      }
    }

    setLoadingProgress(90);
    setLoadingMessage("Finalizing analysis...");

    setPatterns(cachedPatterns || []);
    setClusters(cachedClusters || []);

    // Small delay to show 100%
    setTimeout(() => {
      setLoadingProgress(100);
      setIsLoading(false);
    }, 500);
  }, [transactions, isReady, executeTask]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const handleReRun = () => {
    const patternCacheKey = generateCacheKey("patterns", {
      txCount: transactions.length,
    });
    const clusterCacheKey = generateCacheKey("clusters", {
      txCount: transactions.length,
    });

    patternCache.delete(patternCacheKey);
    patternCache.delete(clusterCacheKey);

    runAnalysis();
  };

  const handleExport = (format: string) => {
    if (format === "json") {
      exportData({ patterns, clusters }, "json");
    } else {
      exportData(patterns, "patterns");
    }
  };

  const severityColors = {
    low: "from-green-500 to-emerald-500",
    medium: "from-yellow-500 to-orange-500",
    high: "from-orange-500 to-red-500",
    critical: "from-red-500 to-rose-600",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner message={loadingMessage} progress={loadingProgress} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-500/20">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Forensics Suite</h2>
            <p className="text-slate-400 text-sm">
              Advanced pattern detection and analysis
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReRun}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
            title="Re-run Analysis"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Rerun</span>
          </button>
          <ExportButton
            onExport={handleExport}
            formats={["csv", "json"]}
            label="Export Report"
          />
        </div>
      </div>

      {/* Pattern Detection Cards */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-400" />
          Suspicious Activity Detected
        </h3>

        {patterns.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center">
            <Shield className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-slate-300">No suspicious patterns detected</p>
            <p className="text-slate-500 text-sm mt-1">
              All transactions appear normal
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {patterns.map((pattern, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedPattern(pattern)}
                className="bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-xl p-5 text-left transition-all hover:shadow-lg hover:shadow-indigo-500/10 group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={`w-12 h-12 bg-gradient-to-br ${
                      severityColors[pattern.severity]
                    } rounded-lg flex items-center justify-center shadow-lg opacity-80 group-hover:opacity-100 transition-opacity`}
                  >
                    <AlertTriangle className="w-6 h-6 text-white" />
                  </div>
                  <SeverityBadge
                    severity={pattern.severity}
                    score={Math.round(pattern.score)}
                    size="sm"
                  />
                </div>

                <h4 className="text-white font-semibold mb-1 capitalize">
                  {pattern.type.replace(/_/g, " ")}
                </h4>
                <p className="text-slate-400 text-xs mb-3 line-clamp-2">
                  {pattern.description}
                </p>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {pattern.affectedAddresses.length} addresses
                  </span>
                  <span className="text-slate-500">
                    {pattern.transactions.length} txs
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Address Clusters */}
      {clusters.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-400" />
            Address Clusters ({clusters.length})
          </h3>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {clusters.slice(0, 10).map((cluster, idx) => (
                <div
                  key={cluster.clusterId}
                  className="border-b border-slate-800 last:border-b-0 p-4 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-indigo-400 font-mono text-sm font-semibold">
                        {cluster.clusterId}
                      </span>
                      <p className="text-slate-400 text-xs mt-1">
                        {cluster.commonBehavior}
                      </p>
                    </div>
                    <span className="text-slate-500 text-xs">
                      Confidence: {(cluster.confidenceScore * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-400">
                      <span className="text-white font-semibold">
                        {cluster.addresses.length}
                      </span>{" "}
                      addresses
                    </span>
                    <span className="text-slate-400">
                      <span className="text-white font-semibold">
                        {cluster.transactionCount}
                      </span>{" "}
                      txs
                    </span>
                    <span className="text-slate-400">
                      Volume:{" "}
                      <span className="text-white font-semibold">
                        {cluster.totalVolume.toLocaleString()}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pattern Detail Modal */}
      {selectedPattern && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-800 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-white capitalize mb-2">
                  {selectedPattern.type.replace(/_/g, " ")}
                </h3>
                <SeverityBadge
                  severity={selectedPattern.severity}
                  score={Math.round(selectedPattern.score)}
                />
              </div>
              <button
                onClick={() => setSelectedPattern(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-slate-300 mb-6">
                {selectedPattern.description}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-500 text-xs mb-1">
                    Affected Addresses
                  </p>
                  <p className="text-white text-2xl font-bold">
                    {selectedPattern.affectedAddresses.length}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <p className="text-slate-500 text-xs mb-1">Transactions</p>
                  <p className="text-white text-2xl font-bold">
                    {selectedPattern.transactions.length}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-white font-semibold mb-3">
                  Sample Affected Addresses
                </h4>
                <div className="space-y-2">
                  {selectedPattern.affectedAddresses
                    .slice(0, 10)
                    .map((addr, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-800/30 rounded px-3 py-2 font-mono text-sm text-slate-300"
                      >
                        {addr}
                      </div>
                    ))}
                  {selectedPattern.affectedAddresses.length > 10 && (
                    <p className="text-slate-500 text-xs text-center py-2">
                      + {selectedPattern.affectedAddresses.length - 10} more
                      addresses
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setSelectedPattern(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  exportData(
                    [selectedPattern],
                    "patterns",
                    `pattern-${selectedPattern.type}.csv`
                  );
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
              >
                Export Pattern Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForensicsDashboard;
