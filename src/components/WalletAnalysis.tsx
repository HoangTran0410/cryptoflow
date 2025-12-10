import React, { useState, useMemo, useEffect } from "react";
import { Transaction } from "../types";
import TransactionTable from "./TransactionTable";
import {
  getAllWalletAddresses,
  getWalletStatistics,
  getWalletVolumeOverTime,
  getWalletTransactionCount,
  getTaintAnalysis,
} from "../utils/analytics";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  Clock,
  Users,
  Droplet,
  ChevronDown,
} from "lucide-react";

interface WalletAnalysisProps {
  transactions: Transaction[];
  initialAddress?: string;
}

type TimeInterval = "daily" | "weekly" | "monthly";
type DirectionFilter = "all" | "inbound" | "outbound";

const WalletAnalysis: React.FC<WalletAnalysisProps> = ({
  transactions,
  initialAddress = "",
}) => {
  const [selectedWallet, setSelectedWallet] = useState(initialAddress);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("daily");
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilter>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showTaintAnalysis, setShowTaintAnalysis] = useState(false);
  const [taintSourceAddress, setTaintSourceAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const allAddresses = useMemo(
    () => getAllWalletAddresses(transactions),
    [transactions]
  );

  // Set initial wallet if not provided
  useEffect(() => {
    if (!selectedWallet && allAddresses.length > 0) {
      setSelectedWallet(initialAddress || allAddresses[0]);
    }
  }, [allAddresses, initialAddress, selectedWallet]);

  // Wallet statistics
  const walletStats = useMemo(() => {
    if (!selectedWallet) return null;
    return getWalletStatistics(transactions, selectedWallet);
  }, [transactions, selectedWallet]);

  // Volume over time data
  const volumeData = useMemo(() => {
    if (!selectedWallet) return [];
    return getWalletVolumeOverTime(transactions, selectedWallet, timeInterval);
  }, [transactions, selectedWallet, timeInterval]);

  // Transaction count data - use same interval as volume data
  const countData = useMemo(() => {
    if (!selectedWallet) return [];
    // Use volumeData since it already respects timeInterval
    return volumeData;
  }, [volumeData]);

  // Filter transactions for table
  const filteredTransactions = useMemo(() => {
    let filtered = transactions.filter((tx) => {
      const isRelevant = tx.from === selectedWallet || tx.to === selectedWallet;
      if (!isRelevant) return false;

      if (directionFilter === "inbound" && tx.to !== selectedWallet)
        return false;
      if (directionFilter === "outbound" && tx.from !== selectedWallet)
        return false;

      if (startDate && tx.date < new Date(startDate)) return false;
      if (endDate && tx.date > new Date(endDate)) return false;

      return true;
    });

    return filtered;
  }, [transactions, selectedWallet, directionFilter, startDate, endDate]);

  // Taint analysis
  const taintData = useMemo(() => {
    if (!showTaintAnalysis || !taintSourceAddress || !selectedWallet)
      return null;
    try {
      return getTaintAnalysis(transactions, taintSourceAddress, selectedWallet);
    } catch (e) {
      return null;
    }
  }, [transactions, taintSourceAddress, selectedWallet, showTaintAnalysis]);

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatAddress = (address: string) => {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  // Custom tooltip formatter for volume chart
  const CustomVolumeTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-slate-300 font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div
              key={index}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-semibold text-white">
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip formatter for count chart
  const CustomCountTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-slate-300 font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div
              key={index}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span style={{ color: entry.color }}>{entry.name}:</span>
              <span className="font-semibold text-white">
                {entry.value} transaction{entry.value !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (!walletStats) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading wallet data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Wallet Analysis
          </h1>
          <p className="text-slate-400">
            Deep dive into individual wallet behavior and transaction patterns
          </p>
        </div>
      </div>

      {/* Wallet Selector */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Select Wallet Address
        </label>
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                placeholder="Search or paste wallet address..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {/* Dropdown for filtered addresses */}
              {searchQuery && (
                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {allAddresses
                    .filter((addr) =>
                      addr.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .slice(0, 10)
                    .map((address) => (
                      <button
                        key={address}
                        onClick={() => {
                          setSelectedWallet(address);
                          setSearchQuery("");
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-700 text-sm font-mono text-slate-300 hover:text-white transition-colors border-b border-slate-700/50 last:border-b-0"
                      >
                        {address}
                      </button>
                    ))}
                  {allAddresses.filter((addr) =>
                    addr.toLowerCase().includes(searchQuery.toLowerCase())
                  ).length === 0 && (
                    <div className="px-4 py-2.5 text-sm text-slate-500">
                      No matching addresses found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {selectedWallet && (
          <div className="mt-3 text-xs text-slate-500">
            Selected:{" "}
            <span className="font-mono text-slate-400">{selectedWallet}</span>
          </div>
        )}
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-green-400 rotate-180" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 uppercase">
                Total Inflow
              </div>
              <div className="text-xl font-bold text-white">
                {formatCurrency(walletStats.totalInflow)}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {walletStats.inflowCount} transactions
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 uppercase">
                Total Outflow
              </div>
              <div className="text-xl font-bold text-white">
                {formatCurrency(walletStats.totalOutflow)}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {walletStats.outflowCount} transactions
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-10 h-10 ${
                walletStats.netBalance >= 0
                  ? "bg-green-500/10"
                  : "bg-red-500/10"
              } rounded-lg flex items-center justify-center`}
            >
              <Activity
                className={`w-5 h-5 ${
                  walletStats.netBalance >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 uppercase">
                Net Balance
              </div>
              <div
                className={`text-xl font-bold ${
                  walletStats.netBalance >= 0
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {formatCurrency(Math.abs(walletStats.netBalance))}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {walletStats.totalTxCount} total transactions
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 uppercase">
                Peak Activity
              </div>
              <div className="text-xl font-bold text-white">
                {walletStats.peakActivityHour}:00
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Activity Score: {walletStats.activityScore.toFixed(1)}/100
          </div>
        </div>
      </div>

      {/* Transaction Analytics - Volume & Count */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            Transaction Analytics
          </h2>
          <div className="flex gap-2">
            {/* Time Interval Selector */}
            <select
              value={timeInterval}
              onChange={(e) => setTimeInterval(e.target.value as TimeInterval)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        {/* Transaction Volume Over Time */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Transaction Volume Over Time
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={volumeData} syncId="walletAnalytics">
              <defs>
                <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="outflowGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip content={<CustomVolumeTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="inflow"
                stroke="#10b981"
                fill="url(#inflowGradient)"
                name="Inflow"
              />
              <Area
                type="monotone"
                dataKey="outflow"
                stroke="#ef4444"
                fill="url(#outflowGradient)"
                name="Outflow"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Transaction Count */}
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Transaction Count
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={countData} syncId="walletAnalytics">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip content={<CustomCountTooltip />} />
              <Legend />
              <Bar dataKey="inflowCount" fill="#10b981" name="Inbound" />
              <Bar dataKey="outflowCount" fill="#ef4444" name="Outbound" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Counterparties */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Top Counterparties</h2>
        </div>
        <div className="space-y-3">
          {walletStats.topCounterparties.slice(0, 5).map((cp, idx) => (
            <div
              key={cp.address}
              className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 border border-slate-700/50"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 bg-indigo-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-indigo-400">
                    #{idx + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-slate-300 truncate">
                    {cp.address}
                  </div>
                  <div className="text-xs text-slate-500">
                    {cp.count} transactions
                  </div>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="text-sm font-semibold text-white">
                  {formatCurrency(cp.volume)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Taint Analysis Section */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Droplet className="w-5 h-5 text-purple-400" />
          <h2 className="text-xl font-bold text-white">Quick Taint Check</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Analyze if this wallet has received tainted funds from a specific
          source address
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={taintSourceAddress}
            onChange={(e) => setTaintSourceAddress(e.target.value)}
            placeholder="Enter source address to check taint..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowTaintAnalysis(true)}
            disabled={!taintSourceAddress}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Analyze
          </button>
        </div>

        {taintData && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-300">Taint Percentage:</span>
              <span
                className={`text-xl font-bold ${
                  taintData.taintPercentage > 50
                    ? "text-red-400"
                    : taintData.taintPercentage > 10
                    ? "text-yellow-400"
                    : "text-green-400"
                }`}
              >
                {taintData.taintPercentage.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-300">Total Tainted Amount:</span>
              <span className="text-white font-semibold">
                {formatCurrency(taintData.totalTainted)}
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {taintData.paths.length} taint path(s) found
            </div>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Transaction History</h2>
          <div className="flex gap-2">
            {/* Direction Filter */}
            <select
              value={directionFilter}
              onChange={(e) =>
                setDirectionFilter(e.target.value as DirectionFilter)
              }
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Transactions</option>
              <option value="inbound">Inbound Only</option>
              <option value="outbound">Outbound Only</option>
            </select>

            {/* Date Range */}
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="text-sm text-slate-400 mb-4">
          Showing {filteredTransactions.length} transactions
        </div>

        <div className="h-[600px]">
          <TransactionTable
            transactions={filteredTransactions}
            showHeader={false}
          />
        </div>
      </div>
    </div>
  );
};

export default WalletAnalysis;
