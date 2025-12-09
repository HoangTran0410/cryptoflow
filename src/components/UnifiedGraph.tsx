import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import * as d3 from "d3";
import { Transaction, Node, Link } from "../types";
import { generateGraphData } from "../utils/analytics";
import {
  Search,
  Filter,
  RefreshCw,
  Maximize,
  Calendar,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  X,
} from "lucide-react";

interface UnifiedGraphProps {
  transactions: Transaction[];
  initialAddress: string;
}

const UnifiedGraph: React.FC<UnifiedGraphProps> = ({
  transactions,
  initialAddress,
}) => {
  // --- State ---
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Date Picker State
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  // Filters
  const [minAmountFilter, setMinAmountFilter] = useState<number>(0);
  const [minInflow, setMinInflow] = useState<string>("");
  const [minOutflow, setMinOutflow] = useState<string>("");

  // Initial Date Range Setup
  useEffect(() => {
    if (transactions.length > 0 && !dateRange.start) {
      // Default to empty (All Time)
    }
  }, [transactions]);

  // Filter Transactions Logic
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Date Filter (DateTime comparison)
    if (dateRange.start || dateRange.end) {
      const start = dateRange.start ? new Date(dateRange.start).getTime() : 0;
      const end = dateRange.end ? new Date(dateRange.end).getTime() : Infinity;

      filtered = filtered.filter((t) => {
        const time = t.date.getTime();
        return time >= start && time <= end;
      });
    }

    return filtered;
  }, [transactions, dateRange]);

  // --- Graph Data Generation (Re-runs when filters change) ---
  useEffect(() => {
    // Pass 0 to get ALL nodes (no limit)
    const data = generateGraphData(filteredTransactions, 0);

    // Apply Min Inflow/Outflow Filter at Node Level
    let validNodes = data.nodes;
    if (minInflow || minOutflow) {
      const minIn = parseFloat(minInflow) || 0;
      const minOut = parseFloat(minOutflow) || 0;

      const flows = new Map<string, { in: number; out: number }>();
      data.links.forEach((l) => {
        const s = l.source as string;
        const t = l.target as string;
        if (!flows.has(s)) flows.set(s, { in: 0, out: 0 });
        if (!flows.has(t)) flows.set(t, { in: 0, out: 0 });
        flows.get(s)!.out += l.value;
        flows.get(t)!.in += l.value;
      });

      validNodes = validNodes.filter((n) => {
        const f = flows.get(n.id) || { in: 0, out: 0 };
        return f.in >= minIn && f.out >= minOut;
      });

      const validIds = new Set(validNodes.map((n) => n.id));
      data.links = data.links.filter(
        (l) =>
          validIds.has(l.source as string) && validIds.has(l.target as string)
      );
      data.nodes = validNodes;
    }

    setNodes(data.nodes);
    setLinks(data.links);
  }, [filteredTransactions, minInflow, minOutflow]);

  // --- Stats for the selected node ---
  const selectedNodeStats = useMemo(() => {
    if (!selectedNodeId) return null;
    let inflow = 0,
      outflow = 0,
      count = 0;
    filteredTransactions.forEach((t) => {
      if (t.to === selectedNodeId) {
        inflow += t.amount;
        count++;
      }
      if (t.from === selectedNodeId) {
        outflow += t.amount;
        count++;
      }
    });
    return {
      id: selectedNodeId,
      inflow,
      outflow,
      net: inflow - outflow,
      count,
    };
  }, [selectedNodeId, filteredTransactions]);

  // Determine connected nodes for highlighting
  const connectedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (selectedNodeId) {
      set.add(selectedNodeId);
      links.forEach((l) => {
        const s =
          typeof l.source === "object"
            ? (l.source as Node).id
            : (l.source as string);
        const t =
          typeof l.target === "object"
            ? (l.target as Node).id
            : (l.target as string);
        if (s === selectedNodeId) set.add(t);
        if (t === selectedNodeId) set.add(s);
      });
    }
    return set;
  }, [selectedNodeId, links]);

  // --- Graph Manipulation Logic ---

  const handleNodeClick = (node: Node, event: any) => {
    event.stopPropagation();
    if (selectedNodeId !== node.id) {
      setSelectedNodeId(node.id);
    }
  };

  const handleBgClick = () => {
    setSelectedNodeId(null);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    const exists = nodes.some((n) => n.id === searchQuery);
    if (exists) {
      setSelectedNodeId(searchQuery);
      // Manual zoom to searched node
      setTimeout(() => {
        const found = nodes.find((n) => n.id === searchQuery);
        if (found && found.x && found.y && svgRef.current && zoomRef.current) {
          const width = containerRef.current?.clientWidth || 800;
          const height = containerRef.current?.clientHeight || 800;
          d3.select(svgRef.current)
            .transition()
            .duration(750)
            .call(
              zoomRef.current.transform,
              d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(1.5)
                .translate(-found.x, -found.y)
            );
        }
      }, 300);
    }
  };

  const handleReset = () => {
    // Re-generate to reset layout state
    const data = generateGraphData(filteredTransactions, 0);
    setNodes(data.nodes);
    setLinks(data.links);
    setSelectedNodeId(null);
    setTimeout(handleFitView, 300);
  };

  const handleFitView = useCallback(() => {
    if (
      !svgRef.current ||
      !containerRef.current ||
      !zoomRef.current ||
      nodes.length === 0
    )
      return;

    let targets: Node[] = [];

    if (selectedNodeId) {
      targets = nodes.filter((n) => connectedNodeIds.has(n.id));
      if (targets.length === 0)
        targets = nodes.filter((n) => n.id === selectedNodeId);
    } else {
      targets = nodes;
    }

    targets = targets.filter(
      (n) => typeof n.x === "number" && typeof n.y === "number"
    );
    if (targets.length === 0) return;

    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    };
    targets.forEach((n) => {
      bounds.minX = Math.min(bounds.minX, n.x!);
      bounds.maxX = Math.max(bounds.maxX, n.x!);
      bounds.minY = Math.min(bounds.minY, n.y!);
      bounds.maxY = Math.max(bounds.maxY, n.y!);
    });

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const padding = 100;
    const dx = bounds.maxX - bounds.minX || 10;
    const dy = bounds.maxY - bounds.minY || 10;
    const x = (bounds.minX + bounds.maxX) / 2;
    const y = (bounds.minY + bounds.maxY) / 2;

    let scale =
      0.9 / Math.max(dx / (width - padding * 2), dy / (height - padding * 2));
    scale = Math.max(0.01, Math.min(2, scale));

    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }, [nodes, selectedNodeId, connectedNodeIds]);

  // Initial Fit
  useEffect(() => {
    const timer = setTimeout(() => {
      handleFitView();
    }, 800);
    return () => clearTimeout(timer);
  }, [nodes.length === 0]);

  // --- Display Data Calculation ---
  const { displayNodes, displayLinks } = useMemo(() => {
    const filteredLinks = links.filter((l) => l.value >= minAmountFilter);

    const activeNodeIds = new Set<string>();
    filteredLinks.forEach((l) => {
      const s =
        typeof l.source === "object"
          ? (l.source as Node).id
          : (l.source as string);
      const t =
        typeof l.target === "object"
          ? (l.target as Node).id
          : (l.target as string);
      activeNodeIds.add(s);
      activeNodeIds.add(t);
    });

    const dNodes = nodes.filter(
      (n) => activeNodeIds.has(n.id) || n.id === selectedNodeId
    );

    return { displayNodes: dNodes, displayLinks: filteredLinks };
  }, [nodes, links, minAmountFilter, selectedNodeId]);

  // --- Date Picker Logic ---
  const applyDatePreset = (days: number | "all") => {
    if (days === "all") {
      setDateRange({ start: "", end: "" });
    } else {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      setDateRange({
        start: start.toISOString().slice(0, 16),
        end: end.toISOString().slice(0, 16),
      });
    }
    setIsDateOpen(false);
  };

  const formatDateDisplay = () => {
    if (!dateRange.start && !dateRange.end) return "All Time";
    const s = dateRange.start
      ? new Date(dateRange.start).toLocaleDateString()
      : "Start";
    const e = dateRange.end
      ? new Date(dateRange.end).toLocaleDateString()
      : "Now";
    return `${s} - ${e}`;
  };

  // --- D3 Effect 1: Physics & Topology ---
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .on("click", handleBgClick);

    // Initial SVG Setup
    if (svg.select("defs").empty()) {
      const defs = svg.append("defs");
      defs
        .append("marker")
        .attr("id", "arrow-unified")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 18)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#64748b");
    }

    let g = svg.select<SVGGElement>(".main-group");
    if (g.empty()) {
      g = svg.append("g").attr("class", "main-group");
      g.append("g").attr("class", "link-group");
      g.append("g").attr("class", "node-group");
    }

    if (!zoomRef.current) {
      zoomRef.current = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.01, 8])
        .on("zoom", (event) => g.attr("transform", event.transform));
      svg.call(zoomRef.current);
    }

    // --- Render Elements ---
    const linkGroup = g.select(".link-group");
    const nodeGroup = g.select(".node-group");

    // Links
    const linkSelection = linkGroup
      .selectAll<SVGLineElement, Link>("line")
      .data(
        displayLinks,
        (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`
      );
    linkSelection.exit().remove();
    const linkEnter = linkSelection
      .enter()
      .append("line")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .attr("marker-end", "url(#arrow-unified)");
    const allLinks = linkEnter
      .merge(linkSelection)
      .attr("class", "graph-link")
      .attr("stroke-width", (d) => Math.min(Math.sqrt(d.value) * 0.5 + 0.5, 4));

    // Nodes
    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, Node>("g")
      .data(displayNodes, (d) => d.id);
    nodeSelection.exit().remove();

    // Node Enter (No Drag Attached)
    const nodeEnter = nodeSelection
      .enter()
      .append("g")
      .attr("class", "graph-node")
      .attr("cursor", "pointer")
      .on("click", (e, d) => handleNodeClick(d, e));

    nodeEnter
      .append("circle")
      .attr("r", (d) => Math.min(Math.sqrt(d.val || 1) + 3, 25))
      .attr("stroke-width", 1.5)
      .attr("stroke", "#1e293b");

    nodeEnter
      .append("text")
      .attr("x", 12)
      .attr("y", 4)
      .attr("fill", "#e2e8f0")
      .attr("font-size", "10px")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 2px black")
      .style("opacity", 0)
      .text((d) => (d.id.length > 8 ? d.id.slice(0, 6) + ".." : d.id));

    const allNodes = nodeEnter.merge(nodeSelection);

    // --- Simulation & Layout ---
    if (simulationRef.current) simulationRef.current.stop();

    const simulation = d3
      .forceSimulation(displayNodes)
      .force(
        "link",
        d3
          .forceLink(displayLinks)
          .id((d: any) => d.id)
          .distance(50)
      ) // Added distance constraint
      .force("charge", d3.forceManyBody().strength(-30)) // Significantly reduced repulsion (was -200)
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.8)) // Stronger centering (was 0.05)
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((d: any) => Math.sqrt(d.val || 1) + 5)
          .iterations(2)
      );

    simulation.alpha(0.5).restart();

    // FREEZE ON END: Prevents nodes from moving after simulation cools down
    simulation.on("end", () => {
      displayNodes.forEach((n) => {
        n.fx = n.x;
        n.fy = n.y;
      });
    });

    simulation.on("tick", () => {
      allLinks
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      allNodes.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    simulationRef.current = simulation;
  }, [displayNodes, displayLinks]);

  // --- D3 Effect 2: Visual Styling (Selection/Highlighting) ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const nodesG = svg.selectAll<SVGGElement, Node>(".graph-node");
    const linksG = svg.selectAll<SVGLineElement, Link>(".graph-link");

    // Update Links
    linksG
      .transition()
      .duration(300)
      .attr("stroke-opacity", (d) => {
        if (!selectedNodeId) return 0.5;
        const s =
          typeof d.source === "object" ? (d.source as Node).id : d.source;
        const t =
          typeof d.target === "object" ? (d.target as Node).id : d.target;
        const isConnected = s === selectedNodeId || t === selectedNodeId;
        return isConnected ? 0.8 : 0.05;
      })
      .attr("stroke", (d) => {
        if (!selectedNodeId) return "#475569";
        const s =
          typeof d.source === "object" ? (d.source as Node).id : d.source;
        const t =
          typeof d.target === "object" ? (d.target as Node).id : d.target;
        return s === selectedNodeId || t === selectedNodeId
          ? "#818cf8"
          : "#334155";
      });

    // Update Nodes
    nodesG
      .transition()
      .duration(300)
      .style("opacity", (d) => {
        if (!selectedNodeId) return 1;
        return connectedNodeIds.has(d.id) ? 1 : 0.2;
      });

    // Update Text Visibility
    nodesG
      .select("text")
      .transition()
      .duration(300)
      .style("opacity", (d) => {
        if (d.id === selectedNodeId) return 1;
        if (selectedNodeId && connectedNodeIds.has(d.id)) return 1;
        if (!selectedNodeId && (d.id.includes("_") || d.val > 2000)) return 1;
        return 0;
      });

    // Update Circle Color
    nodesG
      .select("circle")
      .attr("fill", (d) => {
        if (d.id === selectedNodeId) return "#a78bfa"; // Selected: Purple
        if (d.id.includes("Whale")) return "#f43f5e";
        if (d.id.includes("_")) return "#8b5cf6";
        if (d.type === "source") return "#34d399";
        return "#3b82f6";
      })
      .attr("stroke", (d) => (d.id === selectedNodeId ? "#fff" : "#1e293b"))
      .attr("stroke-width", (d) => (d.id === selectedNodeId ? 3 : 1.5));
  }, [selectedNodeId, connectedNodeIds, displayNodes]);

  return (
    <div className="flex flex-col h-[calc(100vh-85px)] gap-4">
      {/* --- Toolbar --- */}
      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center z-20 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          {/* Controls */}
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700"
              title="Reset Layout"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitView}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-700"
              title="Fit to Screen"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden xl:block"></div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Date Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsDateOpen(!isDateOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  dateRange.start || dateRange.end
                    ? "bg-indigo-900/30 border-indigo-500/50 text-indigo-300"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>{formatDateDisplay()}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>

              {isDateOpen && (
                <div className="absolute top-full mt-2 left-0 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-50 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => applyDatePreset(1)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 transition-colors"
                    >
                      Last 24 Hours
                    </button>
                    <button
                      onClick={() => applyDatePreset(7)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 transition-colors"
                    >
                      Last 7 Days
                    </button>
                    <button
                      onClick={() => applyDatePreset(30)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 transition-colors"
                    >
                      Last 30 Days
                    </button>
                    <button
                      onClick={() => applyDatePreset("all")}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 transition-colors"
                    >
                      All Time
                    </button>
                  </div>

                  <div className="h-px bg-slate-800"></div>

                  <div className="space-y-3">
                    <label className="block text-xs text-slate-500 uppercase font-semibold">
                      Custom Range
                    </label>
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">Start</span>
                      <input
                        type="datetime-local"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        value={dateRange.start}
                        onChange={(e) =>
                          setDateRange((prev) => ({
                            ...prev,
                            start: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">End</span>
                      <input
                        type="datetime-local"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                        value={dateRange.end}
                        onChange={(e) =>
                          setDateRange((prev) => ({
                            ...prev,
                            end: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setIsDateOpen(false)}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
              {/* Backdrop to close */}
              {isDateOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsDateOpen(false)}
                ></div>
              )}
            </div>

            {/* Amount Filter */}
            <div
              className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800"
              title="Minimum Transaction Value"
            >
              <Filter className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-500 hidden sm:inline">
                Min Amt:
              </span>
              <input
                type="number"
                className="bg-transparent text-xs text-slate-300 focus:outline-none w-16"
                value={minAmountFilter}
                onChange={(e) => setMinAmountFilter(Number(e.target.value))}
                placeholder="0"
              />
            </div>

            {/* Flow Filters */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <ArrowDownRight className="w-3 h-3 text-emerald-500" />
              <input
                type="number"
                className="bg-transparent text-xs text-slate-300 focus:outline-none w-16"
                value={minInflow}
                onChange={(e) => setMinInflow(e.target.value)}
                placeholder="Min In"
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <ArrowUpRight className="w-3 h-3 text-orange-500" />
              <input
                type="number"
                className="bg-transparent text-xs text-slate-300 focus:outline-none w-16"
                value={minOutflow}
                onChange={(e) => setMinOutflow(e.target.value)}
                placeholder="Min Out"
              />
            </div>
          </div>
        </div>

        {/* Right: Search */}
        <form onSubmit={handleSearch} className="relative w-full xl:w-64">
          <input
            type="text"
            placeholder="Search Address..."
            className="w-full bg-slate-950 border border-slate-700 text-slate-200 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        </form>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden relative">
        {/* --- Main Graph Canvas --- */}
        <div
          className="flex-1 bg-slate-950 rounded-xl border border-slate-800 relative overflow-hidden shadow-inner"
          ref={containerRef}
        >
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          ></svg>

          {/* Overlay Help Text */}
          <div className="absolute top-4 left-4 pointer-events-none z-10">
            <h3 className="text-white font-semibold text-sm shadow-black drop-shadow-md">
              Network Explorer
            </h3>
            <p className="text-slate-400 text-xs mt-1 max-w-[220px] shadow-black drop-shadow-md bg-slate-950/50 p-2 rounded backdrop-blur-sm border border-slate-800/50">
              Scroll to Zoom. Click to Select. Nodes positions are locked after
              loading (No Drag).
            </p>
            <div className="mt-2 text-[10px] text-slate-500 bg-slate-900/50 p-1 rounded inline-block border border-slate-800/50">
              Nodes: {displayNodes.length} | Links: {displayLinks.length}
            </div>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 pointer-events-none z-10">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/80 rounded border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_5px_rgba(139,92,246,0.6)]"></div>{" "}
              <span className="text-[10px] text-slate-300">Entity/Hub</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900/80 rounded border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.6)]"></div>{" "}
              <span className="text-[10px] text-slate-300">Whale</span>
            </div>
          </div>
        </div>

        {/* --- Sidebar (Inspector) --- */}
        {selectedNodeId && (
          <div className="absolute top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur border-l border-slate-800 p-6 flex flex-col shadow-2xl transition-transform animate-in slide-in-from-right duration-200 z-20">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h4 className="text-xs uppercase text-slate-500 font-bold tracking-wider">
                  Wallet Details
                </h4>
                <p className="text-white font-mono text-sm break-all mt-1">
                  {selectedNodeId}
                </p>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedNodeStats && (
              <div className="space-y-6">
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <div className="text-xs text-slate-400 mb-1">Net Flow</div>
                  <div
                    className={`text-2xl font-bold ${
                      selectedNodeStats.net >= 0
                        ? "text-emerald-400"
                        : "text-orange-400"
                    }`}
                  >
                    {selectedNodeStats.net > 0 ? "+" : ""}
                    {selectedNodeStats.net.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Total In</div>
                    <div className="text-emerald-500 font-medium">
                      +{selectedNodeStats.inflow.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Total Out</div>
                    <div className="text-orange-500 font-medium">
                      -{selectedNodeStats.outflow.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">Activity</div>
                  <div className="text-white font-medium">
                    {selectedNodeStats.count} Transactions
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedGraph;
