import React, { useState, useMemo, useRef, useEffect } from "react";
import { Transaction } from "../types";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

interface TransactionTableProps {
  transactions: Transaction[];
}

const ROW_HEIGHT = 48; // px
const HEADER_HEIGHT = 50; // px
const VIEWPORT_HEIGHT = 600; // px

const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
}) => {
  const [sortField, setSortField] = useState<keyof Transaction>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");

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
      .filter(
        (t) =>
          t.from.toLowerCase().includes(filter.toLowerCase()) ||
          t.to.toLowerCase().includes(filter.toLowerCase()) ||
          t.id.toLowerCase().includes(filter.toLowerCase())
      )
      .sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];

        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
  }, [transactions, sortField, sortDirection, filter]);

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
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[700px]">
      <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
        <h3 className="text-lg font-semibold text-white">
          Transaction Ledger ({filteredData.length.toLocaleString()})
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search address or ID..."
            className="bg-slate-950 border border-slate-700 text-slate-200 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full md:w-64"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950/50 text-slate-200 font-medium uppercase text-xs border-b border-slate-800 flex shrink-0 pr-4">
          {/* pr-4 accounts for scrollbar width approx */}
          <div
            className="flex-1 px-6 py-4 cursor-pointer hover:bg-slate-800/50 flex items-center gap-1"
            onClick={() => handleSort("date")}
          >
            Date <SortIcon field="date" />
          </div>
          <div
            className="flex-[2] px-6 py-4 cursor-pointer hover:bg-slate-800/50 flex items-center gap-1"
            onClick={() => handleSort("from")}
          >
            From <SortIcon field="from" />
          </div>
          <div
            className="flex-[2] px-6 py-4 cursor-pointer hover:bg-slate-800/50 flex items-center gap-1"
            onClick={() => handleSort("to")}
          >
            To <SortIcon field="to" />
          </div>
          <div
            className="flex-1 px-6 py-4 cursor-pointer hover:bg-slate-800/50 flex items-center justify-end gap-1"
            onClick={() => handleSort("amount")}
          >
            Amount <SortIcon field="amount" />
          </div>
          <div className="flex-1 px-6 py-4 text-right">Currency</div>
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
                  <div className="flex-1 px-6 whitespace-nowrap text-slate-300">
                    {tx.date.toLocaleDateString()}
                  </div>
                  <div className="flex-[2] px-6 truncate" title={tx.from}>
                    <span className="px-2 py-1 rounded text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300">
                      {tx.from}
                    </span>
                  </div>
                  <div className="flex-[2] px-6 truncate" title={tx.to}>
                    <span className="px-2 py-1 rounded text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300">
                      {tx.to}
                    </span>
                  </div>
                  <div className="flex-1 px-6 text-right font-medium text-emerald-400">
                    {tx.amount.toLocaleString()}
                  </div>
                  <div className="flex-1 px-6 text-right text-slate-500">
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
  );
};

export default TransactionTable;
