import React, { useState, useMemo, useRef } from "react";
import { TracerConnection, Transaction, CombinedConnection } from "../../types";
import {
  X,
  ArrowUpRight,
  Link2,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  ChevronDown,
  FilterX,
} from "lucide-react";

interface ConnectionPanelProps {
  connection: CombinedConnection;
  onClose: () => void;
}

type DirectionFilter = "all" | "forward" | "reverse";

type SortColumn = "date" | "amount";
type SortDirection = "asc" | "desc";

const ROW_HEIGHT = 48; // px - height of each transaction row
const VIEWPORT_BUFFER = 5; // number of items to render outside viewport

const formatAddress = (addr: string) => {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
};

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  connection,
  onClose,
}) => {
  // Direction filter state
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilter>("all");

  // Filter state
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // UI state
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Virtual scroll state
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sort handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setMinAmount("");
    setMaxAmount("");
    setStartDate("");
    setEndDate("");
  };

  // Check if any filters are active
  const hasActiveFilters = minAmount || maxAmount || startDate || endDate;

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

  // Get all transactions based on direction filter
  const allTransactions = useMemo(() => {
    const txs: Transaction[] = [];

    if (directionFilter === "all" || directionFilter === "forward") {
      txs.push(...(connection.aToB?.transactions || []));
    }
    if (directionFilter === "all" || directionFilter === "reverse") {
      txs.push(...(connection.bToA?.transactions || []));
    }

    return txs;
  }, [connection, directionFilter]);

  // Filtered and sorted transactions
  const filteredTransactions = useMemo(() => {
    let filtered = [...allTransactions];

    // Filter by amount
    const minAmt = parseFloat(minAmount) || 0;
    const maxAmt = parseFloat(maxAmount) || Infinity;
    filtered = filtered.filter(
      (tx) => tx.amount >= minAmt && tx.amount <= maxAmt
    );

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((tx) => tx.date >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((tx) => tx.date <= end);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === "date") {
        comparison = a.date.getTime() - b.date.getTime();
      } else {
        comparison = a.amount - b.amount;
      }
      return sortDirection === "desc" ? -comparison : comparison;
    });

    return filtered;
  }, [
    allTransactions,
    minAmount,
    maxAmount,
    startDate,
    endDate,
    sortColumn,
    sortDirection,
  ]);

  // Virtualization calculations
  const totalHeight = filteredTransactions.length * ROW_HEIGHT;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - VIEWPORT_BUFFER
  );
  const endIndex = Math.min(
    filteredTransactions.length,
    Math.ceil((scrollTop + 600) / ROW_HEIGHT) + VIEWPORT_BUFFER // Assuming ~600px viewport
  );

  const visibleTransactions = filteredTransactions.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden h-full">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <Link2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Connection Details</h3>
              <p className="text-xs text-slate-400">
                {(connection.aToB?.txCount || 0) +
                  (connection.bToA?.txCount || 0)}{" "}
                transaction
                {(connection.aToB?.txCount || 0) +
                  (connection.bToA?.txCount || 0) !==
                1
                  ? "s"
                  : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            title="Close panel"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Address display - conditional based on connection type */}
        {connection.aToB && connection.bToA ? (
          // Bidirectional connection
          <div className="flex items-center gap-2 text-sm">
            <div className="flex-1 bg-slate-950 rounded-lg px-3 py-2 border border-slate-700">
              <span className="text-xs text-slate-500 block">Address A</span>
              <span
                className="text-slate-200 font-mono truncate block copyable"
                data-copy={connection.addressA}
              >
                {formatAddress(connection.addressA)}
              </span>
            </div>
            <ArrowLeftRight className="w-5 h-5 text-indigo-400 shrink-0" />
            <div className="flex-1 bg-slate-950 rounded-lg px-3 py-2 border border-slate-700">
              <span className="text-xs text-slate-500 block">Address B</span>
              <span
                className="text-slate-200 font-mono truncate block copyable"
                data-copy={connection.addressB}
              >
                {formatAddress(connection.addressB)}
              </span>
            </div>
          </div>
        ) : (
          // One-way connection
          <div className="flex items-center gap-2 text-sm">
            <div className="flex-1 bg-slate-950 rounded-lg px-3 py-2 border border-slate-700">
              <span className="text-xs text-slate-500 block">Source</span>
              <span
                className="text-slate-200 font-mono truncate block copyable"
                data-copy={
                  connection.aToB
                    ? connection.aToB.fromAddress
                    : connection.bToA!.toAddress
                }
              >
                {formatAddress(
                  connection.aToB
                    ? connection.aToB.fromAddress
                    : connection.bToA!.toAddress
                )}
              </span>
            </div>
            <ArrowUpRight className="w-5 h-5 text-orange-400 shrink-0" />
            <div className="flex-1 bg-slate-950 rounded-lg px-3 py-2 border border-slate-700">
              <span className="text-xs text-slate-500 block">Target</span>
              <span
                className="text-slate-200 font-mono truncate block copyable"
                data-copy={
                  connection.aToB
                    ? connection.aToB.toAddress
                    : connection.bToA!.fromAddress
                }
              >
                {formatAddress(
                  connection.aToB
                    ? connection.aToB.toAddress
                    : connection.bToA!.fromAddress
                )}
              </span>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="mt-3 flex items-center justify-between bg-slate-950 rounded-lg px-3 py-2 border border-slate-700">
          <span className="text-sm text-slate-400">Total Amount</span>
          <span className="text-lg font-semibold text-orange-400">
            ${connection.totalAmount.toLocaleString()}
          </span>
        </div>
        {/* Direction Filter - only show for bidirectional connections */}
        {connection.aToB && connection.bToA && (
          <div className="mt-3 flex gap-1 bg-slate-950 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setDirectionFilter("all")}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                directionFilter === "all"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All (
              {(connection.aToB?.txCount || 0) +
                (connection.bToA?.txCount || 0)}
              )
            </button>
            {connection.aToB && (
              <button
                onClick={() => setDirectionFilter("forward")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  directionFilter === "forward"
                    ? "bg-orange-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                A → B ({connection.aToB.txCount})
              </button>
            )}
            {connection.bToA && (
              <button
                onClick={() => setDirectionFilter("reverse")}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  directionFilter === "reverse"
                    ? "bg-green-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                B → A ({connection.bToA.txCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="border-b border-slate-800">
        {/* Filters Header */}
        <div className="p-3 flex items-center justify-between">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                filtersExpanded ? "" : "-rotate-90"
              }`}
            />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded">
                Active
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="Clear all filters"
            >
              <FilterX className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Filters Content */}
        {filtersExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {/* Date Range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            {/* Amount Range */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-xs w-4 text-center">$</span>
              <input
                type="number"
                placeholder="Min"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="number"
                placeholder="Max"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            {/* Results count */}
            <div className="text-xs text-slate-500 text-right">
              Showing {filteredTransactions.length} of {allTransactions.length}{" "}
              transactions
            </div>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
          <div className="flex text-xs text-slate-400 uppercase">
            <button
              onClick={() => handleSort("date")}
              className="flex-1 p-2 font-medium flex items-center gap-1 hover:text-slate-200 transition-colors text-left"
            >
              Date <SortIcon column="date" />
            </button>
            <button
              onClick={() => handleSort("amount")}
              className="w-24 p-2 font-medium flex items-center justify-end gap-1 hover:text-slate-200 transition-colors"
            >
              Amount <SortIcon column="amount" />
            </button>
          </div>
        </div>

        {/* Virtual list container */}
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleTransactions.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">
                No transactions match filters
              </div>
            ) : (
              visibleTransactions.map((tx, idx) => (
                <div
                  key={tx.id || startIndex + idx}
                  className="flex items-center hover:bg-slate-800/50 transition-colors border-b border-slate-800/50"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="flex-1 p-2">
                    <span className="text-sm text-slate-200">
                      {tx.date.toLocaleDateString()}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      {tx.date.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="w-24 p-2 text-right">
                    <span className="text-sm font-medium text-orange-400">
                      $
                      {tx.amount >= 1000
                        ? `${(tx.amount / 1000).toFixed(1)}K`
                        : tx.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionPanel;
