import React, { useMemo, useState } from "react";
import { Transaction } from "../types";
import { getWalletFlowStats } from "../utils/analytics";
import { ArrowUpRight, TrendingUp, List, ArrowRightLeft } from "lucide-react";

interface MoneyFlowProps {
  transactions: Transaction[];
}

const ROW_HEIGHT = 50; // Increased row height for better readability
const CARD_HEIGHT = 80;

type SubTab = "leaderboard" | "corridors";

const MoneyFlow: React.FC<MoneyFlowProps> = ({ transactions }) => {
  const [activeTab, setActiveTab] = useState<SubTab>("leaderboard");
  const stats = useMemo(() => getWalletFlowStats(transactions), [transactions]);

  // Virtual Scroll State
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate Top Pairs
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

  // --- Stats Virtualization Logic ---
  const statsTotalHeight = stats.length * ROW_HEIGHT;
  const statsStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const statsEndIndex = Math.min(
    stats.length,
    Math.ceil((scrollTop + 800) / ROW_HEIGHT) + 3
  );
  const statsVisible = stats.slice(statsStartIndex, statsEndIndex);
  const statsOffsetY = statsStartIndex * ROW_HEIGHT;

  // --- Pairs Virtualization Logic ---
  const pairsTotalHeight = topPairs.length * CARD_HEIGHT;
  const pairsStartIndex = Math.max(0, Math.floor(scrollTop / CARD_HEIGHT) - 3);
  const pairsEndIndex = Math.min(
    topPairs.length,
    Math.ceil((scrollTop + 800) / CARD_HEIGHT) + 3
  );
  const pairsVisible = topPairs.slice(pairsStartIndex, pairsEndIndex);
  const pairsOffsetY = pairsStartIndex * CARD_HEIGHT;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Sub Tab Navigation */}
      <div className="flex justify-center">
        <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 inline-flex">
          <button
            onClick={() => {
              setActiveTab("leaderboard");
              setScrollTop(0);
            }}
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
            onClick={() => {
              setActiveTab("corridors");
              setScrollTop(0);
            }}
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

      {activeTab === "leaderboard" ? (
        /* Wallet Flow Statistics Table */
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-220px)] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="p-5 border-b border-slate-800 bg-slate-950/50 shrink-0 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <List className="w-5 h-5 text-emerald-400" />
                Wallet Volume Rankings
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                Aggregated inflow/outflow analysis for{" "}
                {stats.length.toLocaleString()} wallets.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                Top by Volume
              </span>
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 bg-slate-950 text-xs uppercase text-slate-500 border-b border-slate-800 shrink-0 gap-4 px-6 py-3 font-semibold tracking-wider">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Wallet Address</div>
            <div className="col-span-2 text-right">Inflow</div>
            <div className="col-span-2 text-right">Outflow</div>
            <div className="col-span-2 text-right">Net Flow</div>
          </div>

          {/* Virtualized Table Body */}
          <div
            className="overflow-y-auto flex-1 custom-scrollbar bg-slate-900/20"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div style={{ height: statsTotalHeight, position: "relative" }}>
              <div style={{ transform: `translateY(${statsOffsetY}px)` }}>
                {statsVisible.map((s, idx) => {
                  const rank = statsStartIndex + idx + 1;
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
                        {s.address}
                        {/* Simple tag for sample data hubs */}
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
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Top Transfers List */
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[calc(100vh-220px)] animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="p-5 border-b border-slate-800 bg-slate-950/50 shrink-0">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-indigo-400" />
              Top Value Corridors
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Largest cumulative transfers between pairs.
            </p>
          </div>

          {/* Virtualized List */}
          <div
            className="overflow-y-auto flex-1 p-6 custom-scrollbar bg-slate-900/20"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div style={{ height: pairsTotalHeight, position: "relative" }}>
              <div
                style={{
                  transform: `translateY(${pairsOffsetY}px)`,
                  width: "100%",
                }}
              >
                {pairsVisible.map((pair, idx) => {
                  const percent =
                    (pair.amount / (topPairs[0]?.amount || 1)) * 100;
                  const realIndex = idx + pairsStartIndex + 1;
                  return (
                    <div
                      key={realIndex}
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
                              className="text-sm font-mono text-indigo-300 truncate"
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
                              className="text-sm font-mono text-emerald-300 truncate"
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoneyFlow;
