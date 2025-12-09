import React, { useState, useMemo, useEffect } from "react";
import { Transaction } from "./types";
import FileUpload from "./components/FileUpload";
import SummaryStats from "./components/SummaryStats";
import ChartsSection from "./components/ChartsSection";
import TransactionTable from "./components/TransactionTable";
import MoneyFlow from "./components/MoneyFlow";
import UnifiedGraph from "./components/UnifiedGraph";
import ForensicsDashboard from "./components/ForensicsDashboard";
import PathExplorer from "./components/PathExplorer";
import PathFinder from "./components/PathFinder";
import TimelineTracer from "./components/TimelineTracer";
import TaintChart from "./components/TaintChart";
import { calculateSummary, getDailyVolume } from "./utils/analytics";
import {
  LayoutDashboard,
  Wallet,
  Share2,
  TrendingUp,
  Network,
  Shield,
  GitBranch,
  Route,
  Calendar,
  Droplet,
} from "lucide-react";

type Tab =
  | "overview"
  | "interactive"
  | "money-flow"
  | "forensics"
  | "path-explorer"
  | "path-finder"
  | "timeline"
  | "taint"
  | "transactions";

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  // Track which tabs have been visited to lazy load them
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(
    new Set(["overview"])
  );

  const handleDataLoaded = (data: Transaction[]) => {
    setTransactions(data);
    setActiveTab("overview");
    setVisitedTabs(new Set(["overview"]));
  };

  // Update visited tabs when active tab changes
  useEffect(() => {
    if (transactions.length > 0) {
      setVisitedTabs((prev) => {
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab, transactions]);

  const summary = useMemo(() => calculateSummary(transactions), [transactions]);
  const dailyData = useMemo(() => getDailyVolume(transactions), [transactions]);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard },
    { id: "interactive", label: "Interactive Graph", icon: Network },
    { id: "money-flow", label: "Money Flow Analysis", icon: TrendingUp },
    { id: "forensics", label: "Forensics Suite", icon: Shield },
    { id: "path-explorer", label: "Path Explorer", icon: GitBranch },
    { id: "path-finder", label: "Path Finder", icon: Route },
    { id: "timeline", label: "Timeline Tracer", icon: Calendar },
    { id: "taint", label: "Taint Analysis", icon: Droplet },
    { id: "transactions", label: "Ledger", icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              CryptoFlow
            </span>
          </div>
          {transactions.length > 0 && (
            <button
              onClick={() => setTransactions([])}
              className="text-xs font-medium text-slate-400 hover:text-white transition-colors border border-slate-800 px-3 py-1.5 rounded bg-slate-900"
            >
              Reset Data
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        {transactions.length > 0 && (
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-2 overflow-x-auto">
            <nav
              className="flex space-x-1 border-b border-slate-800/50 pb-0"
              aria-label="Tabs"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                      ${
                        isActive
                          ? "border-indigo-500 text-indigo-400"
                          : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      }
                    `}
                  >
                    <tab.icon
                      className={`w-4 h-4 ${
                        isActive ? "text-indigo-400" : "text-slate-500"
                      }`}
                    />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      <main
        className={`flex-1 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 w-full ${
          activeTab === "interactive" ? "py-4" : "py-8"
        }`}
      >
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400">
                Visualize Money Flow
              </h1>
              <p className="text-slate-400 max-w-lg mx-auto text-lg">
                Upload your transaction ledger to instantly generate interactive
                flow graphs, volume analytics, and wallet statistics.
              </p>
            </div>
            <FileUpload onDataLoaded={handleDataLoaded} />
          </div>
        ) : (
          <div className="animate-fade-in h-full relative">
            {/*
              TAB PERSISTENCE:
              Instead of unmounting components, we hide them.
              This preserves D3 simulation state, scroll positions, and prevents lag on tab switch.
            */}

            <div
              style={{ display: activeTab === "overview" ? "block" : "none" }}
            >
              <div className="space-y-8">
                <SummaryStats summary={summary} />
                <ChartsSection dailyData={dailyData} />
              </div>
            </div>

            {/* Lazy load Interactive Graph */}
            <div
              style={{
                display: activeTab === "interactive" ? "block" : "none",
              }}
              className="h-full"
            >
              {visitedTabs.has("interactive") && (
                <UnifiedGraph
                  transactions={transactions}
                  initialAddress={summary.topAddress}
                />
              )}
            </div>

            {/* Lazy load Money Flow */}
            <div
              style={{ display: activeTab === "money-flow" ? "block" : "none" }}
              className="h-full"
            >
              {visitedTabs.has("money-flow") && (
                <MoneyFlow transactions={transactions} />
              )}
            </div>

            {/* Lazy load Forensics Suite */}
            <div
              style={{ display: activeTab === "forensics" ? "block" : "none" }}
              className="h-full"
            >
              {visitedTabs.has("forensics") && (
                <ForensicsDashboard transactions={transactions} />
              )}
            </div>

            {/* Lazy load Path Explorer */}
            <div
              style={{ display: activeTab === "path-explorer" ? "block" : "none" }}
              className="h-full"
            >
              {visitedTabs.has("path-explorer") && (
                <PathExplorer transactions={transactions} />
              )}
            </div>

            {/* Lazy load Path Finder */}
            <div
              style={{ display: activeTab === "path-finder" ? "block" : "none" }}
              className="h-full"
            >
              {visitedTabs.has("path-finder") && (
                <PathFinder transactions={transactions} />
              )}
            </div>

            {/* Lazy load Timeline Tracer */}
            <div
              style={{ display: activeTab === "timeline" ? "block" : "none" }}
              className="h-full"
            >
              {visitedTabs.has("timeline") && (
                <TimelineTracer transactions={transactions} />
              )}
            </div>

            {/* Lazy load Taint Analysis */}
            <div
              style={{ display: activeTab === "taint" ? "block" : "none" }}
              className="h-full"
            >
              {visitedTabs.has("taint") && (
                <TaintChart transactions={transactions} />
              )}
            </div>

            {/* Lazy load Transactions */}
            <div
              style={{
                display: activeTab === "transactions" ? "block" : "none",
              }}
              className="h-full"
            >
              {visitedTabs.has("transactions") && (
                <TransactionTable transactions={transactions} />
              )}
            </div>
          </div>
        )}
      </main>

      {transactions.length > 0 && activeTab !== "interactive" && (
        <footer className="border-t border-slate-900 mt-auto py-8 text-center">
          <p className="text-slate-600 text-sm">
            CryptoFlow Analytics • Local processing only
          </p>
        </footer>
      )}
    </div>
  );
};

export default App;
