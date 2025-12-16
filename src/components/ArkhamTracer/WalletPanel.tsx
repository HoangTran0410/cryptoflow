import React, { useState, useRef, useCallback, useMemo } from "react";
import { Transaction, TracerWallet } from "../../types";
import {
  Search,
  Plus,
  Trash2,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Minus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { formatAddress, formatRelativeTime } from "@/src/utils/helpers";

interface WalletPanelProps {
  selectedWallet: string;
  wallet: TracerWallet;
  transactions: Transaction[];
  onClose: () => void;
  onRemoveWallet: (address: string) => void;
  onAddWallet: (
    address: string,
    sourceLane?: number,
    isInflow?: boolean
  ) => void;
  existingWalletSet: Set<string>;
  selectedWalletLane?: number;
}

type SortColumn = "address" | "amount" | "count" | "time";
type SortDirection = "asc" | "desc";

const ROW_HEIGHT = 56;

const WalletPanel: React.FC<WalletPanelProps> = ({
  selectedWallet,
  wallet,
  transactions,
  onClose,
  onRemoveWallet,
  onAddWallet,
  existingWalletSet,
  selectedWalletLane,
}) => {
  const [activeFlowTab, setActiveFlowTab] = useState<"inflows" | "outflows">(
    "inflows"
  );
  const [panelSearchQuery, setPanelSearchQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>("amount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Get selected wallet data
  const selectedWalletData = useMemo(() => {
    const inflows = transactions.filter((t) => t.to === selectedWallet);
    const outflows = transactions.filter((t) => t.from === selectedWallet);

    // Aggregate by counterparty
    const counterpartyMap = new Map<
      string,
      {
        address: string;
        inflow: number;
        outflow: number;
        count: number;
        lastTx: Date;
      }
    >();

    inflows.forEach((t) => {
      const existing = counterpartyMap.get(t.from) || {
        address: t.from,
        inflow: 0,
        outflow: 0,
        count: 0,
        lastTx: t.date,
      };
      existing.inflow += t.amount;
      existing.count++;
      if (t.date > existing.lastTx) existing.lastTx = t.date;
      counterpartyMap.set(t.from, existing);
    });

    outflows.forEach((t) => {
      const existing = counterpartyMap.get(t.to) || {
        address: t.to,
        inflow: 0,
        outflow: 0,
        count: 0,
        lastTx: t.date,
      };
      existing.outflow += t.amount;
      existing.count++;
      if (t.date > existing.lastTx) existing.lastTx = t.date;
      counterpartyMap.set(t.to, existing);
    });

    return {
      wallet,
      inflows,
      outflows,
      counterparties: Array.from(counterpartyMap.values()),
      totalInflow: inflows.reduce((sum, t) => sum + t.amount, 0),
      totalOutflow: outflows.reduce((sum, t) => sum + t.amount, 0),
    };
  }, [selectedWallet, wallet, transactions]);

  // Filter counterparties for panel
  const filteredCounterparties = useMemo(() => {
    if (!selectedWalletData) return [];

    let filtered = selectedWalletData.counterparties;

    if (activeFlowTab === "inflows") {
      filtered = filtered.filter((c) => c.inflow > 0);
    } else {
      filtered = filtered.filter((c) => c.outflow > 0);
    }

    if (panelSearchQuery) {
      filtered = filtered.filter((c) =>
        c.address.toLowerCase().includes(panelSearchQuery.toLowerCase())
      );
    }

    // Sort based on current sort column and direction
    return filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case "address":
          comparison = a.address.localeCompare(b.address);
          break;
        case "amount":
          const aAmount = activeFlowTab === "inflows" ? a.inflow : a.outflow;
          const bAmount = activeFlowTab === "inflows" ? b.inflow : b.outflow;
          comparison = aAmount - bAmount;
          break;
        case "count":
          comparison = a.count - b.count;
          break;
        case "time":
          comparison = a.lastTx.getTime() - b.lastTx.getTime();
          break;
      }
      return sortDirection === "desc" ? -comparison : comparison;
    });
  }, [
    selectedWalletData,
    activeFlowTab,
    panelSearchQuery,
    sortColumn,
    sortDirection,
  ]);

  // Toggle sort handler
  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(column);
        setSortDirection("desc");
      }
      setScrollTop(0); // Reset scroll on sort
    },
    [sortColumn]
  );

  // Sort icon component
  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    }
    return sortDirection === "desc" ? (
      <ArrowDown className="w-3 h-3" />
    ) : (
      <ArrowUp className="w-3 h-3" />
    );
  };

  if (!wallet) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden shrink-0 h-full max-h-[calc(100vh-100px)]">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white font-semibold text-sm">
              {selectedWallet.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <h3
              className="text-white font-semibold truncate copyable"
              data-copy={selectedWallet}
            >
              {formatAddress(selectedWallet)}
            </h3>
            <div className="flex items-center gap-3 text-xs mt-0.5">
              <span className="text-emerald-400 flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3" />$
                {selectedWalletData.totalInflow.toLocaleString()}
              </span>
              <span className="text-orange-400 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />$
                {selectedWalletData.totalOutflow.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRemoveWallet(selectedWallet)}
            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Remove from graph"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            title="Close panel"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveFlowTab("inflows")}
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeFlowTab === "inflows"
              ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          Inflows ({selectedWalletData.inflows.length})
        </button>
        <button
          onClick={() => setActiveFlowTab("outflows")}
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeFlowTab === "outflows"
              ? "text-orange-400 border-b-2 border-orange-400 bg-orange-400/5"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          Outflows ({selectedWalletData.outflows.length})
        </button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search address..."
            value={panelSearchQuery}
            onChange={(e) => setPanelSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Virtual Scroll Table */}
      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto"
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
          <div className="flex text-xs text-slate-400 uppercase">
            <button
              onClick={() => handleSort("address")}
              className="flex-1 p-2 font-medium flex items-center gap-1 hover:text-slate-200 transition-colors text-left"
            >
              Address <SortIcon column="address" />
            </button>
            <button
              onClick={() => handleSort("amount")}
              className="w-20 p-2 font-medium flex items-center justify-end gap-1 hover:text-slate-200 transition-colors"
            >
              Amount <SortIcon column="amount" />
            </button>
            <button
              onClick={() => handleSort("count")}
              className="w-12 p-2 font-medium flex items-center justify-end gap-1 hover:text-slate-200 transition-colors"
            >
              Tx <SortIcon column="count" />
            </button>
            <button
              onClick={() => handleSort("time")}
              className="w-20 p-2 font-medium flex items-center justify-end gap-1 hover:text-slate-200 transition-colors"
            >
              Last <SortIcon column="time" />
            </button>
            <div className="w-10 p-2"></div>
          </div>
        </div>

        {/* Virtual scroll container */}
        <div
          style={{
            height: filteredCounterparties.length * ROW_HEIGHT,
            position: "relative",
          }}
        >
          {filteredCounterparties.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              No counterparties found
            </div>
          ) : (
            (() => {
              const containerHeight =
                tableContainerRef.current?.clientHeight || 400;
              const overscan = 3;
              const startIndex = Math.max(
                0,
                Math.floor(scrollTop / ROW_HEIGHT) - overscan
              );
              const visibleCount =
                Math.ceil(containerHeight / ROW_HEIGHT) + overscan * 2;
              const endIndex = Math.min(
                filteredCounterparties.length,
                startIndex + visibleCount
              );

              return filteredCounterparties
                .slice(startIndex, endIndex)
                .map((cp, idx) => {
                  const amount =
                    activeFlowTab === "inflows" ? cp.inflow : cp.outflow;
                  const isInGraph = existingWalletSet.has(cp.address);
                  const actualIndex = startIndex + idx;

                  return (
                    <div
                      key={cp.address}
                      className="flex items-center hover:bg-slate-800/50 transition-colors border-b border-slate-800/50"
                      style={{
                        position: "absolute",
                        top: actualIndex * ROW_HEIGHT,
                        left: 0,
                        right: 0,
                        height: ROW_HEIGHT,
                      }}
                    >
                      {/* Address */}
                      <div className="flex-1 p-2 truncate">
                        <span
                          className="text-sm text-slate-200 font-mono copyable"
                          data-copy={cp.address}
                        >
                          {formatAddress(cp.address)}
                        </span>
                      </div>
                      {/* Amount */}
                      <div className="w-20 p-2 text-right">
                        <span
                          className={`text-sm font-medium ${
                            activeFlowTab === "inflows"
                              ? "text-emerald-400"
                              : "text-orange-400"
                          }`}
                        >
                          $
                          {amount >= 1000
                            ? `${(amount / 1000).toFixed(1)}K`
                            : amount.toLocaleString()}
                        </span>
                      </div>
                      {/* Transaction count */}
                      <div className="w-12 p-2 text-right">
                        <span className="text-xs text-slate-400">
                          {cp.count}
                        </span>
                      </div>
                      {/* Relative time */}
                      <div className="w-20 p-2 text-right">
                        <span className="text-xs text-slate-500">
                          {formatRelativeTime(cp.lastTx)}
                        </span>
                      </div>
                      {/* Action */}
                      <div className="w-10 p-2 text-center">
                        {isInGraph ? (
                          <button
                            onClick={() => onRemoveWallet(cp.address)}
                            className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Remove from graph"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              onAddWallet(
                                cp.address,
                                selectedWalletLane,
                                activeFlowTab === "inflows"
                              )
                            }
                            className="p-1 rounded text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                            title="Add to graph"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
            })()
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletPanel;
