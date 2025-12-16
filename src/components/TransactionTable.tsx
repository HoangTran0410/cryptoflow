import React, { useState, useMemo, useRef, useEffect } from "react";
import { Transaction } from "../types";
import { ChevronDown, ChevronUp, Search, Wallet, X } from "lucide-react";
import { formatAddress } from "../utils/helpers";

interface TransactionTableProps {
  showHeader?: boolean;
  transactions: Transaction[];
}

const ROW_HEIGHT = 48; // px
const HEADER_HEIGHT = 50; // px
const VIEWPORT_HEIGHT = 600; // px

const TransactionTable: React.FC<TransactionTableProps> = ({
  showHeader = true,
  transactions,
}) => {
  const [sortField, setSortField] = useState<keyof Transaction>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Filters
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [amountFilterType, setAmountFilterType] = useState<"gt" | "lt">("gt");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [dateFiltersCollapsed, setDateFiltersCollapsed] = useState(true);

  // Virtual Scroll State
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSort = (field: keyof Transaction) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredData = useMemo(() => {
    return transactions
      .filter((t) => {
        // From Filter
        if (
          fromFilter &&
          !t.from.toLowerCase().includes(fromFilter.toLowerCase())
        ) {
          return false;
        }
        // To Filter
        if (toFilter && !t.to.toLowerCase().includes(toFilter.toLowerCase())) {
          return false;
        }
        // Amount Filter
        if (minAmount) {
          const val = parseFloat(minAmount);
          if (!isNaN(val)) {
            if (amountFilterType === "gt" && t.amount <= val) return false;
            if (amountFilterType === "lt" && t.amount >= val) return false;
          }
        }
        // Date & Time Filter
        if (dateStart) {
          const start = new Date(dateStart);
          if (t.date < start) return false;
        }
        if (dateEnd) {
          const end = new Date(dateEnd);
          if (t.date > end) return false;
        }

        // Time Range Filter (supports overnight ranges)
        if (timeStart && timeEnd) {
          const txHours = t.date.getHours();
          const txMinutes = t.date.getMinutes();
          const txTime = txHours * 60 + txMinutes; // Convert to minutes

          const [startHour, startMin] = timeStart.split(":").map(Number);
          const [endHour, endMin] = timeEnd.split(":").map(Number);
          const startTimeInMin = startHour * 60 + startMin;
          const endTimeInMin = endHour * 60 + endMin;

          // Handle overnight range (e.g., 23:00 - 01:00)
          if (startTimeInMin > endTimeInMin) {
            // If tx time is NOT in the gap between end and start, it's valid
            if (txTime < startTimeInMin && txTime > endTimeInMin) {
              return false;
            }
          } else {
            // Normal range (e.g., 08:00 - 17:00)
            if (txTime < startTimeInMin || txTime > endTimeInMin) {
              return false;
            }
          }
        } else if (timeStart) {
          // Only start time specified
          const txHours = t.date.getHours();
          const txMinutes = t.date.getMinutes();
          const txTime = txHours * 60 + txMinutes;
          const [startHour, startMin] = timeStart.split(":").map(Number);
          const startTimeInMin = startHour * 60 + startMin;
          if (txTime < startTimeInMin) return false;
        } else if (timeEnd) {
          // Only end time specified
          const txHours = t.date.getHours();
          const txMinutes = t.date.getMinutes();
          const txTime = txHours * 60 + txMinutes;
          const [endHour, endMin] = timeEnd.split(":").map(Number);
          const endTimeInMin = endHour * 60 + endMin;
          if (txTime > endTimeInMin) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];

        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
  }, [
    transactions,
    sortField,
    sortDirection,
    fromFilter,
    toFilter,
    minAmount,
    amountFilterType,
    dateStart,
    dateEnd,
    timeStart,
    timeEnd,
  ]);

  // Virtualization Calculations
  const totalHeight = filteredData.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5); // 5 items buffer
  const endIndex = Math.min(
    filteredData.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + 5
  );

  const visibleItems = filteredData.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  const SortIcon = ({ field }: { field: keyof Transaction }) => {
    if (sortField !== field) return <div className="w-4 h-4 opacity-0" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-100px)] gap-4">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Transactions</h2>
            <p className="text-slate-400 text-sm">
              Full history of all processed transactions
            </p>
          </div>
        </div>
      )}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full">
        <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
          <h3 className="text-lg font-semibold text-white">
            Total ({filteredData.length.toLocaleString()})
          </h3>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-slate-950/50 text-slate-200 font-medium uppercase text-xs border-b border-slate-800 flex shrink-0 pr-4">
            {/* Date Column */}
            <div className="flex-[2] px-4 py-3 border-r border-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <div
                  className="flex items-center gap-1 cursor-pointer hover:text-white"
                  onClick={() => handleSort("date")}
                >
                  Date <SortIcon field="date" />
                </div>
                <button
                  onClick={() => setDateFiltersCollapsed(!dateFiltersCollapsed)}
                  className="p-0.5 hover:bg-slate-700 rounded transition-colors"
                  title={
                    dateFiltersCollapsed ? "Expand filters" : "Collapse filters"
                  }
                >
                  {dateFiltersCollapsed ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronUp className="w-3 h-3" />
                  )}
                </button>
              </div>
              {!dateFiltersCollapsed && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <input
                        type="date"
                        value={dateStart}
                        onChange={(e) => setDateStart(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 pr-6 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500"
                        placeholder="Start"
                      />
                      {dateStart && (
                        <X
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                          onClick={() => setDateStart("")}
                        />
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="date"
                        value={dateEnd}
                        onChange={(e) => setDateEnd(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 pr-6 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500"
                        placeholder="End"
                      />
                      {dateEnd && (
                        <X
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                          onClick={() => setDateEnd("")}
                        />
                      )}
                    </div>
                  </div>
                  <div className="text-[9px] text-slate-500 mb-0.5">
                    Time Range (All Days)
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <input
                        type="time"
                        value={timeStart}
                        onChange={(e) => setTimeStart(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 pr-6 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500"
                        placeholder="Start Time"
                      />
                      {timeStart && (
                        <X
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                          onClick={() => setTimeStart("")}
                        />
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="time"
                        value={timeEnd}
                        onChange={(e) => setTimeEnd(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 pr-6 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500"
                        placeholder="End Time"
                      />
                      {timeEnd && (
                        <X
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                          onClick={() => setTimeEnd("")}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
              {dateFiltersCollapsed &&
                (dateStart || dateEnd || timeStart || timeEnd) && (
                  <div className="text-[9px] text-indigo-400 mt-1">
                    {[dateStart && "Date", timeStart && "Time"]
                      .filter(Boolean)
                      .join(" + ")}{" "}
                    filtered
                  </div>
                )}
            </div>

            {/* From Column */}
            <div className="flex-[2] px-4 py-3 border-r border-slate-800/50">
              <div
                className="flex items-center gap-1 cursor-pointer hover:text-white mb-2"
                onClick={() => handleSort("from")}
              >
                From <SortIcon field="from" />
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1.5 w-3 h-3 text-slate-500" />
                <input
                  type="text"
                  value={fromFilter}
                  onChange={(e) => setFromFilter(e.target.value)}
                  placeholder="Filter address..."
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 pl-6 pr-6 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                />
                {fromFilter && (
                  <X
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                    onClick={() => setFromFilter("")}
                  />
                )}
              </div>
            </div>

            {/* To Column */}
            <div className="flex-[2] px-4 py-3 border-r border-slate-800/50">
              <div
                className="flex items-center gap-1 cursor-pointer hover:text-white mb-2"
                onClick={() => handleSort("to")}
              >
                To <SortIcon field="to" />
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1.5 w-3 h-3 text-slate-500" />
                <input
                  type="text"
                  value={toFilter}
                  onChange={(e) => setToFilter(e.target.value)}
                  placeholder="Filter address..."
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 pl-6 pr-6 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                />
                {toFilter && (
                  <X
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                    onClick={() => setToFilter("")}
                  />
                )}
              </div>
            </div>

            {/* Amount Column */}
            <div className="flex-1 px-4 py-3 border-r border-slate-800/50">
              <div
                className="flex items-center justify-end gap-1 cursor-pointer hover:text-white mb-2"
                onClick={() => handleSort("amount")}
              >
                Amount <SortIcon field="amount" />
              </div>
              <div className="flex gap-1">
                <select
                  value={amountFilterType}
                  onChange={(e) =>
                    setAmountFilterType(e.target.value as "gt" | "lt")
                  }
                  className="bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                </select>
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="Value..."
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 pr-6 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 text-right"
                  />
                  {minAmount && (
                    <X
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 hover:text-slate-300 cursor-pointer"
                      onClick={() => setMinAmount("")}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Currency Column - No filter for now */}
            <div className="flex-1 px-4 py-3 text-right flex items-center justify-end">
              Currency
            </div>
          </div>

          {/* Virtual List Container */}
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto flex-1 custom-scrollbar relative"
            onScroll={handleScroll}
          >
            {/* Spacer to simulate full height */}
            <div style={{ height: totalHeight, position: "relative" }}>
              {/* Rendered Items Positioned Absolutely or Relatively with Offset */}
              <div style={{ transform: `translateY(${offsetY}px)` }}>
                {visibleItems.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors h-[48px] items-center text-sm"
                  >
                    <div className="flex-[2] px-4 whitespace-nowrap text-slate-300">
                      {tx.date.toLocaleString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </div>
                    <div className="flex-[2] px-4 truncate" title={tx.from}>
                      <span
                        className="px-2 py-1 rounded text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300 copyable"
                        data-copy={tx.from}
                      >
                        {formatAddress(tx.from)}
                      </span>
                    </div>
                    <div className="flex-[2] px-4 truncate" title={tx.to}>
                      <span
                        className="px-2 py-1 rounded text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300 copyable"
                        data-copy={tx.to}
                      >
                        {formatAddress(tx.to)}
                      </span>
                    </div>
                    <div className="flex-1 px-4 text-right font-medium text-emerald-400">
                      {tx.amount.toLocaleString()}
                    </div>
                    <div className="flex-1 px-4 text-right text-slate-500">
                      {tx.currency}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {filteredData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                No transactions found matching your filter.
              </div>
            )}
          </div>
        </div>

        <div className="p-3 text-center text-xs text-slate-500 border-t border-slate-800 shrink-0 bg-slate-900">
          Showing {filteredData.length.toLocaleString()} transactions
        </div>
      </div>
    </div>
  );
};

export default TransactionTable;
