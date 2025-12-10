import React, { useState, useMemo } from "react";
import { Transaction } from "../../types";
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Search,
  Calendar,
} from "lucide-react";

interface TransactionModalProps {
  walletAddress: string;
  transactions: Transaction[];
  onClose: () => void;
  onAddWallet: (address: string) => void;
  existingWallets: Set<string>;
}

type FlowTab = "inflows" | "outflows";

const TransactionModal: React.FC<TransactionModalProps> = ({
  walletAddress,
  transactions,
  onClose,
  onAddWallet,
  existingWallets,
}) => {
  const [activeTab, setActiveTab] = useState<FlowTab>("inflows");
  const [searchQuery, setSearchQuery] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // Filter transactions for this wallet
  const { inflows, outflows, counterparties } = useMemo(() => {
    const inflows = transactions.filter((t) => t.to === walletAddress);
    const outflows = transactions.filter((t) => t.from === walletAddress);

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
      inflows,
      outflows,
      counterparties: Array.from(counterpartyMap.values()),
    };
  }, [transactions, walletAddress]);

  // Filter counterparties based on active tab and search
  const filteredCounterparties = useMemo(() => {
    let filtered = counterparties;

    // Filter by tab
    if (activeTab === "inflows") {
      filtered = filtered.filter((c) => c.inflow > 0);
    } else {
      filtered = filtered.filter((c) => c.outflow > 0);
    }

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter((c) =>
        c.address.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by amount
    const min = parseFloat(minAmount) || 0;
    const max = parseFloat(maxAmount) || Infinity;
    filtered = filtered.filter((c) => {
      const amount = activeTab === "inflows" ? c.inflow : c.outflow;
      return amount >= min && amount <= max;
    });

    // Sort by amount descending
    return filtered.sort((a, b) => {
      const aAmount = activeTab === "inflows" ? a.inflow : a.outflow;
      const bAmount = activeTab === "inflows" ? b.inflow : b.outflow;
      return bAmount - aAmount;
    });
  }, [counterparties, activeTab, searchQuery, minAmount, maxAmount]);

  const totalInflow = inflows.reduce((sum, t) => sum + t.amount, 0);
  const totalOutflow = outflows.reduce((sum, t) => sum + t.amount, 0);

  const formatAddress = (addr: string) => {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {walletAddress.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-white font-semibold">
                {formatAddress(walletAddress)}
              </h3>
              <div className="flex items-center gap-4 text-xs mt-0.5">
                <span className="text-emerald-400 flex items-center gap-1">
                  <ArrowDownLeft className="w-3 h-3" />$
                  {totalInflow.toLocaleString()}
                </span>
                <span className="text-orange-400 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" />$
                  {totalOutflow.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab("inflows")}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "inflows"
                ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            Inflows ({inflows.length})
          </button>
          <button
            onClick={() => setActiveTab("outflows")}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "outflows"
                ? "text-orange-400 border-b-2 border-orange-400 bg-orange-400/5"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            Outflows ({outflows.length})
          </button>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-slate-800 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <input
            type="number"
            placeholder="Min $"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
          <input
            type="number"
            placeholder="Max $"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
              <tr className="text-xs text-slate-400 uppercase">
                <th className="text-left p-3 font-medium">Counterparty</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="text-right p-3 font-medium">Txs</th>
                <th className="text-right p-3 font-medium">Last</th>
                <th className="w-12 p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredCounterparties.map((cp) => {
                const amount = activeTab === "inflows" ? cp.inflow : cp.outflow;
                const alreadyAdded = existingWallets.has(cp.address);

                return (
                  <tr
                    key={cp.address}
                    className="hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="p-3">
                      <span className="text-sm text-slate-200 font-mono">
                        {formatAddress(cp.address)}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={`text-sm font-medium ${
                          activeTab === "inflows"
                            ? "text-emerald-400"
                            : "text-orange-400"
                        }`}
                      >
                        ${amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3 text-right text-sm text-slate-400">
                      {cp.count}
                    </td>
                    <td className="p-3 text-right text-sm text-slate-500">
                      {cp.lastTx.toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => onAddWallet(cp.address)}
                        disabled={alreadyAdded}
                        className={`p-1.5 rounded-lg transition-colors ${
                          alreadyAdded
                            ? "text-slate-600 cursor-not-allowed"
                            : "text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300"
                        }`}
                        title={alreadyAdded ? "Already added" : "Add to canvas"}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredCounterparties.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No counterparties found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TransactionModal;
