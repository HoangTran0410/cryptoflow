import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import * as d3 from "d3";
import { Transaction, TracerWallet, TracerConnection } from "../../types";
import {
  Search,
  Plus,
  Crosshair,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  ArrowDownLeft,
  ArrowUpRight,
  Minus,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from "lucide-react";
import WalletCard from "./WalletCard";
import ConnectionRenderer from "./ConnectionRenderer";

interface ArkhamTracerProps {
  transactions: Transaction[];
}

const LANE_WIDTH = 250;
const CARD_HEIGHT = 80;
const CARD_GAP = 20;
const ROW_HEIGHT = 56;

type SortColumn = "address" | "amount" | "count" | "time";
type SortDirection = "asc" | "desc";

const ArkhamTracer: React.FC<ArkhamTracerProps> = ({ transactions }) => {
  // State
  const [wallets, setWallets] = useState<TracerWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  // Dragging state
  const [draggedWallet, setDraggedWallet] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragWalletStartRef = useRef({ laneIndex: 0, yPosition: 0 });

  // Transaction panel state
  const [activeFlowTab, setActiveFlowTab] = useState<"inflows" | "outflows">(
    "inflows"
  );
  const [panelSearchQuery, setPanelSearchQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>("amount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: 400 });
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Calculate wallet stats from transactions
  const walletStats = useMemo(() => {
    const stats = new Map<
      string,
      { inflow: number; outflow: number; txCount: number }
    >();

    transactions.forEach((t) => {
      const fromStats = stats.get(t.from) || {
        inflow: 0,
        outflow: 0,
        txCount: 0,
      };
      fromStats.outflow += t.amount;
      fromStats.txCount++;
      stats.set(t.from, fromStats);

      const toStats = stats.get(t.to) || { inflow: 0, outflow: 0, txCount: 0 };
      toStats.inflow += t.amount;
      toStats.txCount++;
      stats.set(t.to, toStats);
    });

    return stats;
  }, [transactions]);

  // Get all unique addresses for autocomplete
  const allAddresses = useMemo(() => {
    const addresses = new Set<string>();
    transactions.forEach((t) => {
      addresses.add(t.from);
      addresses.add(t.to);
    });
    return Array.from(addresses);
  }, [transactions]);

  // Calculate connections between visible wallets
  const connections = useMemo<TracerConnection[]>(() => {
    const walletSet = new Set(wallets.map((w) => w.address));
    const connectionMap = new Map<string, TracerConnection>();

    transactions.forEach((t) => {
      if (walletSet.has(t.from) && walletSet.has(t.to)) {
        const key = `${t.from}->${t.to}`;
        const existing = connectionMap.get(key) || {
          fromAddress: t.from,
          toAddress: t.to,
          totalAmount: 0,
          txCount: 0,
          transactions: [],
        };
        existing.totalAmount += t.amount;
        existing.txCount++;
        existing.transactions.push(t);
        connectionMap.set(key, existing);
      }
    });

    return Array.from(connectionMap.values());
  }, [wallets, transactions]);

  // Calculate wallet positions - during drag, use temporary X position
  const walletPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    wallets.forEach((w) => {
      const x = w.laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
      const y = w.yPosition;
      positions.set(w.address, { x, y });
    });
    return positions;
  }, [wallets]);

  // Get lane range to display (supports negative lanes)
  const laneRange = useMemo(() => {
    if (wallets.length === 0) return { min: -2, max: 5 };
    const lanes = wallets.map((w) => w.laneIndex);
    const minLane = Math.min(...lanes);
    const maxLane = Math.max(...lanes);
    return {
      min: Math.min(-2, minLane - 2),
      max: Math.max(5, maxLane + 3),
    };
  }, [wallets]);

  // Setup D3 zoom
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);

    // Create zoom behavior with filter to exclude wallet cards from panning but allow zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => {
        // Always allow wheel events (scroll zoom) everywhere
        if (event.type === "wheel") {
          return true;
        }

        // For mouse events (pan/drag), check if on wallet card
        if (event.type === "mousedown") {
          let target = event.target as Element | null;
          while (target && target !== svgRef.current) {
            if (target.classList?.contains("wallet-card")) {
              return false; // Don't pan when dragging on wallet cards
            }
            target = target.parentElement;
          }
        }

        // Allow other interactions
        return !event.button;
      })
      .on("zoom", (event) => {
        setTransform({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        });
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Initial transform
    const initialTransform = d3.zoomIdentity.translate(100, 200).scale(1);
    svg.call(zoom.transform, initialTransform);

    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  // Add wallet to canvas
  const addWallet = useCallback(
    (address: string, sourceLane?: number, isInflow?: boolean) => {
      if (wallets.some((w) => w.address === address)) return;

      const stats = walletStats.get(address) || {
        inflow: 0,
        outflow: 0,
        txCount: 0,
      };

      // Determine lane: inflows go left (-1), outflows go right (+1)
      let laneIndex = 0;
      if (sourceLane !== undefined) {
        laneIndex = isInflow ? sourceLane - 1 : sourceLane + 1;
      }

      const walletsInLane = wallets.filter((w) => w.laneIndex === laneIndex);
      const yPosition =
        walletsInLane.length > 0
          ? Math.max(...walletsInLane.map((w) => w.yPosition)) +
            CARD_HEIGHT +
            CARD_GAP
          : 100;

      const newWallet: TracerWallet = {
        address,
        laneIndex,
        yPosition,
        totalInflow: stats.inflow,
        totalOutflow: stats.outflow,
        txCount: stats.txCount,
      };

      setWallets((prev) => [...prev, newWallet]);
      setSearchQuery("");
    },
    [wallets, walletStats]
  );

  // Remove wallet
  const removeWallet = useCallback(
    (address: string) => {
      setWallets((prev) => prev.filter((w) => w.address !== address));
      if (selectedWallet === address) {
        setSelectedWallet(null);
      }
    },
    [selectedWallet]
  );

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (allAddresses.includes(searchQuery.trim())) {
      addWallet(searchQuery.trim());
    }
  };

  // Drag handlers - track both X and Y during drag
  const handleDragStart = useCallback(
    (e: React.MouseEvent, address: string) => {
      e.stopPropagation();
      e.preventDefault();

      const wallet = wallets.find((w) => w.address === address);
      if (!wallet) return;

      setDraggedWallet(address);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragWalletStartRef.current = {
        laneIndex: wallet.laneIndex,
        yPosition: wallet.yPosition,
      };
    },
    [wallets]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggedWallet) return;

      const dx = (e.clientX - dragStartRef.current.x) / transform.k;
      const dy = (e.clientY - dragStartRef.current.y) / transform.k;

      // Calculate new lane from X movement - allow infinite movement both directions
      const startX =
        dragWalletStartRef.current.laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
      const newX = startX + dx;
      const newLaneIndex = Math.round((newX - LANE_WIDTH / 2) / LANE_WIDTH);

      // Free Y movement
      const newY = dragWalletStartRef.current.yPosition + dy;

      setWallets((prev) =>
        prev.map((w) =>
          w.address === draggedWallet
            ? { ...w, laneIndex: newLaneIndex, yPosition: newY }
            : w
        )
      );
    },
    [draggedWallet, transform.k]
  );

  const handleMouseUp = useCallback(() => {
    if (!draggedWallet) return;
    // Lane is already being updated during drag with snapping
    setDraggedWallet(null);
  }, [draggedWallet]);

  // Zoom controls
  const handleZoomIn = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 0.7);
    }
  };

  const handleFitView = () => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const initialTransform = d3.zoomIdentity
      .translate(width / 4, height / 3)
      .scale(0.8);

    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(zoomRef.current.transform, initialTransform);
  };

  // Filter addresses for autocomplete
  const filteredAddresses = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return allAddresses
      .filter(
        (addr) =>
          addr.toLowerCase().includes(query) &&
          !wallets.some((w) => w.address === addr)
      )
      .slice(0, 5);
  }, [searchQuery, allAddresses, wallets]);

  // Get selected wallet data for panel
  const selectedWalletData = useMemo(() => {
    if (!selectedWallet) return null;

    const wallet = wallets.find((w) => w.address === selectedWallet);
    if (!wallet) return null;

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
  }, [selectedWallet, wallets, transactions]);

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

  const existingWalletSet = useMemo(
    () => new Set(wallets.map((w) => w.address)),
    [wallets]
  );

  const selectedWalletLane = useMemo(() => {
    if (!selectedWallet) return undefined;
    return wallets.find((w) => w.address === selectedWallet)?.laneIndex;
  }, [selectedWallet, wallets]);

  const formatAddress = (addr: string) => {
    if (addr.length <= 14) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
  };

  // Relative time formatter
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears}y ago`;
    if (diffMonths > 0) return `${diffMonths}mo ago`;
    if (diffWeeks > 0) return `${diffWeeks}w ago`;
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "just now";
  };

  // Toggle sort handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    setScrollTop(0); // Reset scroll on sort
  };

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

  // Splitter resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartRef.current = { x: e.clientX, width: panelWidth };
    },
    [panelWidth]
  );

  // Handle resize during mouse move - use global event listener
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartRef.current.x - e.clientX;
      const newWidth = Math.min(
        800,
        Math.max(300, resizeStartRef.current.width + delta)
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex flex-col h-[calc(100vh-50px)] gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Crosshair className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Arkham Tracer</h2>
          <p className="text-slate-400 text-sm">
            Trace wallet connections and transaction flows
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center gap-4 shrink-0">
        {/* Search / Add Wallet */}
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search wallet address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-slate-200 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />

          {filteredAddresses.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {filteredAddresses.map((addr) => (
                <button
                  key={addr}
                  type="button"
                  onClick={() => {
                    addWallet(addr);
                    setSearchQuery("");
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <span className="font-mono truncate">{addr}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 border-l border-slate-800 pl-4">
          <button
            onClick={handleZoomOut}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitView}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
            title="Fit View"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>

        {/* Clear All */}
        {wallets.length > 0 && (
          <button
            onClick={() => {
              setWallets([]);
              setSelectedWallet(null);
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/30"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        )}
      </div>

      {/* Main Content - Graph and Side Panel */}
      <div className="flex-1 flex gap-1 min-h-0">
        {/* Canvas */}
        <div
          ref={containerRef}
          className={`${
            selectedWallet ? "flex-1" : "w-full"
          } bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative`}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg
            ref={svgRef}
            className="w-full h-full"
            style={{ cursor: draggedWallet ? "grabbing" : "grab" }}
          >
            <defs>
              {/* Lane gradient - uses userSpaceOnUse to work with actual coordinates */}
              <linearGradient
                id="laneGradient"
                x1="0"
                y1="-500"
                x2="0"
                y2="1500"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#475569" stopOpacity="0" />
                <stop offset="20%" stopColor="#475569" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#475569" stopOpacity="0.6" />
                <stop offset="80%" stopColor="#475569" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#475569" stopOpacity="0" />
              </linearGradient>
            </defs>

            <g
              transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
            >
              {/* Lane lines */}
              {Array.from({ length: laneRange.max - laneRange.min }).map(
                (_, i) => {
                  const laneIndex = laneRange.min + i;
                  return (
                    <line
                      key={`lane-${laneIndex}`}
                      x1={laneIndex * LANE_WIDTH + LANE_WIDTH / 2}
                      y1={-5000}
                      x2={laneIndex * LANE_WIDTH + LANE_WIDTH / 2}
                      y2={5000}
                      stroke="url(#laneGradient)"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                    />
                  );
                }
              )}

              {/* Connections */}
              <ConnectionRenderer
                connections={connections}
                walletPositions={walletPositions}
                transform={transform}
              />

              {/* Wallet Cards */}
              {wallets.map((wallet) => {
                const pos = walletPositions.get(wallet.address);
                if (!pos) return null;

                return (
                  <WalletCard
                    key={wallet.address}
                    wallet={wallet}
                    isSelected={selectedWallet === wallet.address}
                    isDragging={draggedWallet === wallet.address}
                    position={pos}
                    onSelect={() => setSelectedWallet(wallet.address)}
                    onDragStart={(e) => handleDragStart(e, wallet.address)}
                  />
                );
              })}
            </g>
          </svg>

          {/* Empty state */}
          {wallets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Crosshair className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-400 text-lg mb-2">
                  No wallets added yet
                </p>
                <p className="text-slate-500 text-sm">
                  Search for a wallet address above to start tracing
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Splitter + Side Panel */}
        {selectedWallet && selectedWalletData && (
          <>
            {/* Splitter */}
            <div
              onMouseDown={handleResizeStart}
              className={`w-2 flex-shrink-0 cursor-col-resize group flex items-center justify-center hover:bg-indigo-500/20 transition-colors rounded ${
                isResizing ? "bg-indigo-500/30" : ""
              }`}
            >
              <div className="w-1 h-16 bg-slate-700 group-hover:bg-indigo-500 transition-colors rounded" />
            </div>

            {/* Side Panel - Transaction Table */}
            <div
              style={{ width: panelWidth }}
              className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden shrink-0"
            >
              {/* Panel Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-semibold text-sm">
                      {selectedWallet.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold truncate">
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
                    onClick={() => removeWallet(selectedWallet)}
                    className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                    title="Remove from graph"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                  <button
                    onClick={() => setSelectedWallet(null)}
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
                onScroll={(e) =>
                  setScrollTop((e.target as HTMLDivElement).scrollTop)
                }
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
                      const startIndex = Math.max(
                        0,
                        Math.floor(scrollTop / ROW_HEIGHT) - 2
                      );
                      const visibleCount =
                        Math.ceil(containerHeight / ROW_HEIGHT) + 4;
                      const endIndex = Math.min(
                        filteredCounterparties.length,
                        startIndex + visibleCount
                      );

                      return filteredCounterparties
                        .slice(startIndex, endIndex)
                        .map((cp, idx) => {
                          const amount =
                            activeFlowTab === "inflows"
                              ? cp.inflow
                              : cp.outflow;
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
                                <span className="text-sm text-slate-200 font-mono">
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
                                    onClick={() => removeWallet(cp.address)}
                                    className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                                    title="Remove from graph"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() =>
                                      addWallet(
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
          </>
        )}
      </div>
    </div>
  );
};

export default ArkhamTracer;
