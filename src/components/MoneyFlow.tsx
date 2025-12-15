import React, { useMemo, useState, useRef, useLayoutEffect } from "react";
import { Transaction } from "../types";
import { getWalletFlowStats } from "../utils/analytics";
import {
  ArrowUpRight,
  TrendingUp,
  List,
  ArrowRightLeft,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface MoneyFlowProps {
  transactions: Transaction[];
}

const ROW_HEIGHT = 50;
const CARD_HEIGHT = 80;

type SubTab = "leaderboard" | "corridors";
type SortDirection = "asc" | "desc";
type LeaderboardColumn = "address" | "inflow" | "outflow" | "netFlow";

const MoneyFlow: React.FC<MoneyFlowProps> = ({ transactions }) => {
  const [activeTab, setActiveTab] = useState<SubTab>("leaderboard");
  const stats = useMemo(() => getWalletFlowStats(transactions), [transactions]);

  // --- State for Leaderboard ---
  const [leaderboardScroll, setLeaderboardScroll] = useState(0);
  const lbRef = useRef<HTMLDivElement>(null);

  const [sortConfig, setSortConfig] = useState<{
    key: LeaderboardColumn;
    direction: SortDirection;
  }>({ key: "netFlow", direction: "desc" });

  const [lbFilters, setLbFilters] = useState({
    address: "",
    inflow: "",
    outflow: "",
    netFlow: "",
  });

  // --- State for Corridors ---
  const [corridorsScroll, setCorridorsScroll] = useState(0);
  const corRef = useRef<HTMLDivElement>(null);
  const [corridorSearch, setCorridorSearch] = useState({ from: "", to: "" });

  // Scroll Restoration
  useLayoutEffect(() => {
    if (activeTab === "leaderboard" && lbRef.current) {
      lbRef.current.scrollTop = leaderboardScroll;
    } else if (activeTab === "corridors" && corRef.current) {
      corRef.current.scrollTop = corridorsScroll;
    }
  }, [activeTab]);

  // --- Processed Leaderboard Data ---
  const sortedAndFilteredStats = useMemo(() => {
    let result = [...stats];

    // Filter
    if (
      lbFilters.address ||
      lbFilters.inflow ||
      lbFilters.outflow ||
      lbFilters.netFlow
    ) {
      result = result.filter((item) => {
        const addrMatch = item.address
          .toLowerCase()
          .includes(lbFilters.address.toLowerCase());
        const inMatch =
          !lbFilters.inflow || item.inflow > Number(lbFilters.inflow);
        const outMatch =
          !lbFilters.outflow || item.outflow > Number(lbFilters.outflow);
        const netMatch =
          !lbFilters.netFlow || item.netFlow > Number(lbFilters.netFlow);
        return addrMatch && inMatch && outMatch && netMatch;
      });
    }

    // Sort
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [stats, sortConfig, lbFilters]);

  // --- Processed Corridors Data ---
  const topPairs = useMemo(() => {
    const pairMap = new Map<
      string,
      { from: string; to: string; amount: number; count: number }
    >();
    transactions.forEach((t) => {
      const key = `${t.from}|${t.to}`;
      const prev = pairMap.get(key) || {
        from: t.from,
        to: t.to,
        amount: 0,
        count: 0,
      };
      pairMap.set(key, {
        ...prev,
        amount: prev.amount + t.amount,
        count: prev.count + 1,
      });
    });
    return Array.from(pairMap.values()).sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const filteredPairs = useMemo(() => {
    if (!corridorSearch.from && !corridorSearch.to) return topPairs;
    return topPairs.filter(
      (p) =>
        p.from.toLowerCase().includes(corridorSearch.from.toLowerCase()) &&
        p.to.toLowerCase().includes(corridorSearch.to.toLowerCase())
    );
  }, [topPairs, corridorSearch]);

  // --- Virtualization Helpers ---
  const getVisibleRange = (
    scrollTop: number,
    totalItems: number,
    itemHeight: number
  ) => {
    const totalHeight = totalItems * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 3);
    const endIndex = Math.min(
      totalItems,
      Math.ceil((scrollTop + 800) / itemHeight) + 3
    );
    const visibleItems = startIndex * itemHeight;
    return { startIndex, endIndex, offsetY: visibleItems, totalHeight };
  };

  const lbVirt = getVisibleRange(
    leaderboardScroll,
    sortedAndFilteredStats.length,
    ROW_HEIGHT
  );
  const statsVisible = sortedAndFilteredStats.slice(
    lbVirt.startIndex,
    lbVirt.endIndex
  );

  const corVirt = getVisibleRange(
    corridorsScroll,
    filteredPairs.length,
    CARD_HEIGHT
  );
  const pairsVisible = filteredPairs.slice(
    corVirt.startIndex,
    corVirt.endIndex
  );

  // --- Handlers ---
  const handleSort = (key: LeaderboardColumn) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  const SortIcon = ({ col }: { col: LeaderboardColumn }) => {
    if (sortConfig.key !== col)
      return <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-50" />;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="w-3 h-3 text-indigo-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-400" />
    );
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Money Flow Analysis</h2>
          <p className="text-slate-400 text-sm">
            Aggregated wallet statistics and transfer corridor rankings
          </p>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div className="flex justify-center">
        <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 inline-flex">
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "leaderboard"
                ? "bg-indigo-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Net Flow Leaderboard
          </button>
          <button
            onClick={() => setActiveTab("corridors")}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "corridors"
                ? "bg-indigo-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Top Value Corridors
          </button>
        </div>
      </div>

      {/* --- LEADERBOARD TAB --- */}
      <div
        className={`bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex-col h-[calc(100vh-220px)] animate-in fade-in slide-in-from-bottom-2 duration-300 ${
          activeTab === "leaderboard" ? "flex" : "hidden"
        }`}
      >
        <div className="p-5 border-b border-slate-800 bg-slate-950/50 shrink-0 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <List className="w-5 h-5 text-emerald-400" />
              Wallet Volume Rankings
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              {sortedAndFilteredStats.length === stats.length
                ? `Showing all ${stats.length.toLocaleString()} wallets`
                : `Found ${sortedAndFilteredStats.length} / ${stats.length} wallets`}
            </p>
          </div>
        </div>

        {/* Enhanced Table Header with Sort & Search */}
        <div className="bg-slate-950 border-b border-slate-800 shrink-0 px-6 py-3">
          <div className="grid grid-cols-12 gap-4">
            {/* Rank - No sort/filter */}
            <div className="col-span-1 text-xs uppercase text-slate-500 font-semibold tracking-wider flex items-center h-8">
              #
            </div>

            {/* Address */}
            <div className="col-span-5 space-y-2">
              <div
                className="flex items-center gap-1 cursor-pointer group select-none"
                onClick={() => handleSort("address")}
              >
                <span className="text-xs uppercase text-slate-500 font-semibold tracking-wider group-hover:text-slate-300">
                  Wallet Address
                </span>
                <SortIcon col="address" />
              </div>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1.5 text-slate-600" />
                <input
                  type="text"
                  placeholder="Filter address..."
                  value={lbFilters.address}
                  onChange={(e) =>
                    setLbFilters((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 pl-7 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none placeholder:text-slate-700"
                />
              </div>
            </div>

            {/* Inflow */}
            <div className="col-span-2 space-y-2 text-right">
              <div
                className="flex items-center justify-end gap-1 cursor-pointer group select-none"
                onClick={() => handleSort("inflow")}
              >
                <span className="text-xs uppercase text-slate-500 font-semibold tracking-wider group-hover:text-slate-300">
                  Inflow
                </span>
                <SortIcon col="inflow" />
              </div>
              <input
                type="text"
                placeholder="Filter >..."
                value={lbFilters.inflow}
                onChange={(e) =>
                  setLbFilters((prev) => ({ ...prev, inflow: e.target.value }))
                }
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none placeholder:text-slate-700 text-right"
              />
            </div>

            {/* Outflow */}
            <div className="col-span-2 space-y-2 text-right">
              <div
                className="flex items-center justify-end gap-1 cursor-pointer group select-none"
                onClick={() => handleSort("outflow")}
              >
                <span className="text-xs uppercase text-slate-500 font-semibold tracking-wider group-hover:text-slate-300">
                  Outflow
                </span>
                <SortIcon col="outflow" />
              </div>
              <input
                type="text"
                placeholder="Filter >..."
                value={lbFilters.outflow}
                onChange={(e) =>
                  setLbFilters((prev) => ({ ...prev, outflow: e.target.value }))
                }
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none placeholder:text-slate-700 text-right"
              />
            </div>

            {/* Net Flow */}
            <div className="col-span-2 space-y-2 text-right">
              <div
                className="flex items-center justify-end gap-1 cursor-pointer group select-none"
                onClick={() => handleSort("netFlow")}
              >
                <span className="text-xs uppercase text-slate-500 font-semibold tracking-wider group-hover:text-slate-300">
                  Net Flow
                </span>
                <SortIcon col="netFlow" />
              </div>
              <input
                type="text"
                placeholder="Filter >..."
                value={lbFilters.netFlow}
                onChange={(e) =>
                  setLbFilters((prev) => ({ ...prev, netFlow: e.target.value }))
                }
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none placeholder:text-slate-700 text-right"
              />
            </div>
          </div>
        </div>

        {/* Leaderboard Body */}
        <div
          ref={lbRef}
          className="overflow-y-auto flex-1 custom-scrollbar bg-slate-900/20"
          onScroll={(e) => {
            if (activeTab === "leaderboard") {
              setLeaderboardScroll(e.currentTarget.scrollTop);
            }
          }}
        >
          <div style={{ height: lbVirt.totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${lbVirt.offsetY}px)` }}>
              {statsVisible.map((s, idx) => {
                const rank = lbVirt.startIndex + idx + 1;
                return (
                  <div
                    key={s.address}
                    className="grid grid-cols-12 gap-4 items-center hover:bg-slate-800/40 transition-colors border-b border-slate-800/30 h-[50px] text-sm px-6"
                  >
                    <div className="col-span-1 text-slate-500 font-mono text-xs">
                      #{rank}
                    </div>
                    <div
                      className="col-span-5 font-mono text-slate-300 truncate flex items-center gap-2"
                      title={s.address}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          s.netFlow > 0 ? "bg-emerald-500" : "bg-orange-500"
                        }`}
                      ></span>
                      <span className="copyable" data-copy={s.address}>
                        {s.address}
                      </span>
                      {(s.address.includes("_") ||
                        s.address.includes("Whale")) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-900/50 text-indigo-300 border border-indigo-800/50">
                          Entity
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-right text-emerald-500/90 font-mono">
                      +
                      {s.inflow.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div className="col-span-2 text-right text-orange-500/90 font-mono">
                      -
                      {s.outflow.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div
                      className={`col-span-2 text-right font-bold font-mono ${
                        s.netFlow > 0
                          ? "text-emerald-400"
                          : s.netFlow < 0
                          ? "text-red-400"
                          : "text-slate-400"
                      }`}
                    >
                      {s.netFlow > 0 ? "+" : ""}
                      {s.netFlow.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </div>
                );
              })}
              {statsVisible.length === 0 && (
                <div className="p-10 text-center text-slate-500">
                  No wallets match your filters.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- CORRIDORS TAB --- */}
      <div
        className={`bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex-col h-[calc(100vh-220px)] animate-in fade-in slide-in-from-bottom-2 duration-300 ${
          activeTab === "corridors" ? "flex" : "hidden"
        }`}
      >
        <div className="p-5 border-b border-slate-800 bg-slate-950/50 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-indigo-400" />
              Top Value Corridors
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Largest cumulative transfers between pairs ({filteredPairs.length}{" "}
              found).
            </p>
          </div>

          {/* Corridor Search */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-40">
              <span className="absolute left-2 top-2 text-xs text-slate-500 uppercase font-bold">
                From:
              </span>
              <input
                type="text"
                value={corridorSearch.from}
                onChange={(e) =>
                  setCorridorSearch((prev) => ({
                    ...prev,
                    from: e.target.value,
                  }))
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 pl-12 pr-3 text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Address..."
              />
            </div>
            <ArrowRightLeft className="w-4 h-4 text-slate-600" />
            <div className="relative flex-1 md:w-40">
              <span className="absolute left-2 top-2 text-xs text-slate-500 uppercase font-bold">
                To:
              </span>
              <input
                type="text"
                value={corridorSearch.to}
                onChange={(e) =>
                  setCorridorSearch((prev) => ({ ...prev, to: e.target.value }))
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-1.5 pl-8 pr-3 text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Address..."
              />
            </div>
            {(corridorSearch.from || corridorSearch.to) && (
              <button
                onClick={() => setCorridorSearch({ from: "", to: "" })}
                className="text-slate-500 hover:text-white"
                title="Clear filters"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Virtualized List */}
        <div
          ref={corRef}
          className="overflow-y-auto flex-1 p-6 custom-scrollbar bg-slate-900/20"
          onScroll={(e) => {
            if (activeTab === "corridors") {
              setCorridorsScroll(e.currentTarget.scrollTop);
            }
          }}
        >
          <div style={{ height: corVirt.totalHeight, position: "relative" }}>
            <div
              style={{
                transform: `translateY(${corVirt.offsetY}px)`,
                width: "100%",
              }}
            >
              {pairsVisible.map((pair, idx) => {
                const percent =
                  (pair.amount / (topPairs[0]?.amount || 1)) * 100;
                const realIndex = idx + corVirt.startIndex + 1;
                return (
                  <div
                    key={realIndex} // Use real index as key locally or pair key if available
                    className="relative group p-5 mb-3 bg-slate-950/80 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors h-[72px] flex items-center"
                  >
                    {/* Rank */}
                    <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center border-r border-slate-800 bg-slate-900/50 rounded-l-xl text-slate-500 font-mono text-sm">
                      #{realIndex}
                    </div>

                    <div className="ml-12 flex items-center justify-between w-full pl-6 pr-2 relative z-10">
                      <div className="flex items-center gap-6 w-3/5">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs text-slate-500 mb-1">
                            From
                          </span>
                          <span
                            className="text-sm font-mono text-indigo-300 truncate copyable"
                            data-copy={pair.from}
                            title={pair.from}
                          >
                            {pair.from}
                          </span>
                        </div>

                        <div className="flex flex-col items-center px-4">
                          <ArrowRightLeft className="w-4 h-4 text-slate-600" />
                          <div className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">
                            {pair.count} txns
                          </div>
                        </div>

                        <div className="flex flex-col min-w-0 flex-1 text-right">
                          <span className="text-xs text-slate-500 mb-1">
                            To
                          </span>
                          <span
                            className="text-sm font-mono text-emerald-300 truncate copyable"
                            data-copy={pair.to}
                            title={pair.to}
                          >
                            {pair.to}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-white tracking-tight">
                          {pair.amount.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            USDT
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar Background */}
                    <div className="absolute bottom-0 left-12 right-0 h-0.5 bg-slate-800">
                      <div
                        className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
              {pairsVisible.length === 0 && (
                <div className="text-center text-slate-500 py-10">
                  No transfer corridors match your search.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoneyFlow;
