import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  Transaction,
  TracerWallet,
  TracerConnection,
  CombinedConnection,
} from "../../types";
import {
  Search,
  Plus,
  Crosshair,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Spline,
  Minus,
  GitBranch,
  Download,
} from "lucide-react";
import loadable from "@loadable/component";
import { LoadingFallback } from "@/src/utils/loader";
import { select, type ZoomBehavior, zoom as d3zoom, zoomIdentity } from "d3";

const WalletCard = loadable(() => import("./WalletCard"), {
  fallback: LoadingFallback,
});
const ConnectionPanel = loadable(() => import("./ConnectionPanel"), {
  fallback: LoadingFallback,
});
const ConnectionRenderer = loadable(() => import("./ConnectionRenderer"), {
  fallback: LoadingFallback,
});
const WalletPanel = loadable(() => import("./WalletPanel"), {
  fallback: LoadingFallback,
});

interface ArkhamTracerProps {
  transactions: Transaction[];
}

const LANE_WIDTH = 250;
const CARD_HEIGHT = 80;
const CARD_GAP = 20;
const CARD_WIDTH = 180; // Width of wallet cards

type ConnectionStyle = "curve" | "straight" | "step";

const ArkhamTracer: React.FC<ArkhamTracerProps> = ({ transactions }) => {
  // State
  const [wallets, setWallets] = useState<TracerWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] =
    useState<CombinedConnection | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [connectionStyle, setConnectionStyle] =
    useState<ConnectionStyle>("curve");

  // Dragging state
  const [draggedWallet, setDraggedWallet] = useState<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragWalletStartRef = useRef({ laneIndex: 0, yPosition: 0 });

  // Panel state
  const [panelWidth, setPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: 400 });

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

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
    const positions = new Map<
      string,
      { x: number; y: number; leftEdge: number; rightEdge: number }
    >();
    wallets.forEach((w) => {
      const centerX = w.laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
      const y = w.yPosition;
      positions.set(w.address, {
        x: centerX,
        y,
        leftEdge: centerX - CARD_WIDTH / 2,
        rightEdge: centerX + CARD_WIDTH / 2,
      });
    });
    return positions;
  }, [wallets]);

  // Get lane range to display (supports negative lanes and vertical bounds)
  const laneRange = useMemo(() => {
    if (wallets.length === 0) {
      return {
        minX: -2,
        maxX: 5,
        minY: -500,
        maxY: 1500,
      };
    }
    const lanes = wallets.map((w) => w.laneIndex);
    const yPositions = wallets.map((w) => w.yPosition);
    const minLane = Math.min(...lanes);
    const maxLane = Math.max(...lanes);
    const minY = Math.min(...yPositions);
    const maxY = Math.max(...yPositions);
    return {
      minX: Math.min(-2, minLane - 2),
      maxX: Math.max(5, maxLane + 3),
      minY: Math.min(-500, minY - 500),
      maxY: Math.max(1500, maxY + 500),
    };
  }, [wallets]);

  // Setup D3 zoom
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = select(svgRef.current);

    // Create zoom behavior with filter to exclude wallet cards from panning but allow zoom
    const zoom = d3zoom<SVGSVGElement, unknown>()
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
    const initialTransform = zoomIdentity.translate(100, 200).scale(1);
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
      select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomRef.current) {
      select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.scaleBy, 0.7);
    }
  };

  const handleFitView = () => {
    if (
      !svgRef.current ||
      !containerRef.current ||
      !zoomRef.current ||
      wallets.length === 0
    )
      return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Calculate bounding box of all wallets
    const walletAddresses = wallets.map((w) => w.address);
    const positions = walletAddresses
      .map((addr) => walletPositions.get(addr))
      .filter(Boolean);

    if (positions.length === 0) return;

    const padding = 100;
    const minX = Math.min(...positions.map((p) => p!.leftEdge)) - padding;
    const maxX = Math.max(...positions.map((p) => p!.rightEdge)) + padding;
    const minY = Math.min(...positions.map((p) => p!.y)) - padding;
    const maxY =
      Math.max(...positions.map((p) => p!.y)) + CARD_HEIGHT + padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate scale to fit content in viewport
    const scaleX = width / contentWidth;
    const scaleY = height / contentHeight;
    const scale = Math.min(scaleX, scaleY, 1.5); // Cap at 1.5x zoom

    // Calculate center position
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Create transform that centers and scales the content
    const transform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    select(svgRef.current)
      .transition()
      .duration(500)
      .call(zoomRef.current.transform, transform);
  };

  // Export SVG as image
  const handleExportData = useCallback(() => {
    if (!svgRef.current || wallets.length === 0) return;

    try {
      // Clone the SVG to avoid modifying the original
      const svgElement = svgRef.current.cloneNode(true) as SVGSVGElement;

      // Copy computed styles to inline styles for all elements
      const copyStylesToInline = (
        sourceElement: Element,
        targetElement: Element
      ) => {
        const computedStyle = window.getComputedStyle(sourceElement);
        const targetSvgElement = targetElement as SVGElement;

        // Copy important style properties that affect rendering
        const stylesToCopy = [
          "width",
          "height",
          "fill",
          "stroke",
          "stroke-width",
          "opacity",
          "font-size",
          "font-family",
          "font-weight",
        ];
        stylesToCopy.forEach((prop) => {
          const value = computedStyle.getPropertyValue(prop);
          if (value && value !== "none" && value !== "auto") {
            targetSvgElement.style.setProperty(prop, value);
          }
        });

        // Recursively process children
        Array.from(sourceElement.children).forEach((sourceChild, index) => {
          const targetChild = targetElement.children[index];
          if (targetChild) {
            copyStylesToInline(sourceChild, targetChild);
          }
        });
      };

      // Apply styles from original to cloned SVG
      if (svgRef.current) {
        copyStylesToInline(svgRef.current, svgElement);
      }

      // Calculate bounding box based on wallet positions
      const walletAddresses = wallets.map((w) => w.address);
      const positions = walletAddresses
        .map((addr) => walletPositions.get(addr))
        .filter(Boolean);

      if (positions.length === 0) return;

      const padding = 100;
      const minX = Math.min(...positions.map((p) => p!.leftEdge)) - padding;
      const maxX = Math.max(...positions.map((p) => p!.rightEdge)) + padding;
      const minY = Math.min(...positions.map((p) => p!.y)) - padding;
      const maxY =
        Math.max(...positions.map((p) => p!.y)) + CARD_HEIGHT + padding;

      const width = maxX - minX;
      const height = maxY - minY;

      // Set viewBox to show all content
      svgElement.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
      svgElement.setAttribute("width", width.toString());
      svgElement.setAttribute("height", height.toString());

      // Remove transform from the g element since we're using viewBox
      const gElement = svgElement.querySelector("g");
      if (gElement) {
        gElement.removeAttribute("transform");
      }

      // Serialize SVG to string
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);

      // Create blob and download
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `arkham-tracer-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export graph. Please try again.");
    }
  }, [wallets, walletPositions]);

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

  const existingWalletSet = useMemo(
    () => new Set(wallets.map((w) => w.address)),
    [wallets]
  );

  const selectedWalletLane = useMemo(() => {
    if (!selectedWallet) return undefined;
    return wallets.find((w) => w.address === selectedWallet)?.laneIndex;
  }, [selectedWallet, wallets]);

  const selectedWalletObj = useMemo(() => {
    if (!selectedWallet) return null;
    return wallets.find((w) => w.address === selectedWallet) || null;
  }, [selectedWallet, wallets]);

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

        {/* Connection Style */}
        <div className="flex items-center gap-1 border-l border-slate-800 pl-4">
          {/* <span className="text-xs text-slate-500 mr-2">Connection:</span> */}
          <div className="flex gap-1 bg-slate-950 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setConnectionStyle("curve")}
              className={`p-2 rounded transition-colors ${
                connectionStyle === "curve"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Curved connections"
            >
              <Spline className="w-4 h-4" />
            </button>
            <button
              onClick={() => setConnectionStyle("straight")}
              className={`p-2 rounded transition-colors ${
                connectionStyle === "straight"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Straight line connections"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setConnectionStyle("step")}
              className={`p-2 rounded transition-colors ${
                connectionStyle === "step"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Step/elbow connections"
            >
              <GitBranch className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Export/Import */}
        {wallets.length > 0 && (
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg border border-slate-700"
            title="Export graph as SVG image"
          >
            <Download className="w-4 h-4" />
            Export SVG
          </button>
        )}

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
                y1={laneRange.minY}
                x2="0"
                y2={laneRange.maxY}
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
              {Array.from({ length: laneRange.maxX - laneRange.minX }).map(
                (_, i) => {
                  const laneIndex = laneRange.minX + i;
                  return (
                    <line
                      key={`lane-${laneIndex}`}
                      x1={laneIndex * LANE_WIDTH + LANE_WIDTH / 2}
                      y1={laneRange.minY}
                      x2={laneIndex * LANE_WIDTH + LANE_WIDTH / 2}
                      y2={laneRange.maxY}
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
                connectionStyle={connectionStyle}
                selectedConnection={
                  selectedConnection
                    ? {
                        from:
                          selectedConnection.aToB?.fromAddress ||
                          selectedConnection.addressA,
                        to:
                          selectedConnection.aToB?.toAddress ||
                          selectedConnection.addressB,
                      }
                    : null
                }
                onConnectionClick={(combined) => {
                  setSelectedConnection(combined);
                  setSelectedWallet(null);
                }}
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
                    onSelect={() => {
                      setSelectedWallet(wallet.address);
                      setSelectedConnection(null);
                    }}
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
        {selectedWallet && selectedWalletObj && (
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

            {/* Wallet Panel Component */}
            <div style={{ width: panelWidth }} className="shrink-0">
              <WalletPanel
                selectedWallet={selectedWallet}
                wallet={selectedWalletObj}
                transactions={transactions}
                onClose={() => setSelectedWallet(null)}
                onRemoveWallet={removeWallet}
                onAddWallet={addWallet}
                existingWalletSet={existingWalletSet}
                selectedWalletLane={selectedWalletLane}
              />
            </div>
          </>
        )}

        {/* Connection Transactions Side Panel */}
        {selectedConnection && (
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

            {/* Connection Panel */}
            <div style={{ width: panelWidth }} className="shrink-0">
              <ConnectionPanel
                connection={selectedConnection}
                onClose={() => setSelectedConnection(null)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ArkhamTracer;
