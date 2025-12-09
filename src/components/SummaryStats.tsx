import React from "react";
import { AnalyticsSummary } from "../types";
import { DollarSign, Activity, Users, ArrowRightLeft } from "lucide-react";

interface SummaryStatsProps {
  summary: AnalyticsSummary;
}

const SummaryStats: React.FC<SummaryStatsProps> = ({ summary }) => {
  const cards = [
    {
      label: "Total Volume",
      value: summary.totalVolume.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      icon: DollarSign,
      color: "text-emerald-400",
      bg: "bg-emerald-900/20",
      border: "border-emerald-800/50",
    },
    {
      label: "Transactions",
      value: summary.transactionCount.toLocaleString(),
      icon: ArrowRightLeft,
      color: "text-blue-400",
      bg: "bg-blue-900/20",
      border: "border-blue-800/50",
    },
    {
      label: "Unique Wallets",
      value: summary.uniqueAddresses.toLocaleString(),
      icon: Users,
      color: "text-purple-400",
      bg: "bg-purple-900/20",
      border: "border-purple-800/50",
    },
    {
      label: "Avg Value",
      value: summary.avgTransactionValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      icon: Activity,
      color: "text-amber-400",
      bg: "bg-amber-900/20",
      border: "border-amber-800/50",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className={`p-5 rounded-xl border backdrop-blur-sm ${card.bg} ${card.border}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400 mb-1">
                {card.label}
              </p>
              <h3 className="text-2xl font-bold text-white">{card.value}</h3>
            </div>
            <div className={`p-2 rounded-lg bg-slate-950/30 ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SummaryStats;
