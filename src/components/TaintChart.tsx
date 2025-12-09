import React, { useState, useRef, useEffect } from "react";
import * as d3 from "d3";
import {
  sankey,
  sankeyLinkHorizontal,
  SankeyNode,
  SankeyLink,
} from "d3-sankey";
import { Transaction, TaintFlow } from "../types";
import { Search, Download, Droplet } from "lucide-react";
import { useForensicsWorker } from "../hooks/useForensicsWorker";
import LoadingSpinner from "./shared/LoadingSpinner";
import ExportButton from "./shared/ExportButton";
import { exportTaintToCSV } from "../utils/export";

interface TaintChartProps {
  transactions: Transaction[];
  initialSource?: string;
  initialTarget?: string;
}

interface SankeyNodeData extends SankeyNode<{}, {}> {
  name: string;
  address: string;
}

interface SankeyLinkData extends SankeyLink<SankeyNodeData, {}> {
  value: number;
  percentage: number;
}

const TaintChart: React.FC<TaintChartProps> = ({
  transactions,
  initialSource = "",
  initialTarget = "",
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(initialTarget);
  const [maxHops, setMaxHops] = useState(5);
  const [taintFlow, setTaintFlow] = useState<TaintFlow | null>(null);
  const [loading, setLoading] = useState(false);
  const { executeTask } = useForensicsWorker();

  const handleAnalyze = async () => {
    if (!source || !target) return;

    setLoading(true);
    try {
      const result = await executeTask<TaintFlow>({
        type: "TAINT_ANALYSIS",
        payload: {
          transactions,
          sourceAddress: source,
          targetAddress: target,
          maxHops,
        },
      });
      setTaintFlow(result);
    } catch (error) {
      console.error("Taint analysis failed:", error);
      alert("Taint analysis failed. Please check the console for details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taintFlow && svgRef.current) {
      renderSankey();
    }
  }, [taintFlow]);

  const renderSankey = () => {
    if (!svgRef.current || !taintFlow) return;

    const margin = { top: 20, right: 150, bottom: 20, left: 150 };
    const width = 1200 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // 1. Build Nodes and Aggregate Links
    // Use a Map to aggregate parallel links between the same source and target
    const nodeMap = new Map<string, SankeyNodeData>();
    const linkMap = new Map<
      string,
      { source: string; target: string; value: number }
    >();

    taintFlow.paths.forEach((path) => {
      // Ensure path has at least 2 nodes
      if (path.path.length < 2) return;

      for (let i = 0; i < path.path.length; i++) {
        const addr = path.path[i];
        if (!nodeMap.has(addr)) {
          nodeMap.set(addr, {
            name: addr.slice(0, 8) + "..." + addr.slice(-6),
            address: addr,
          } as SankeyNodeData);
        }

        if (i < path.path.length - 1) {
          const sourceAddr = path.path[i];
          const targetAddr = path.path[i + 1];
          const key = `${sourceAddr}->${targetAddr}`;

          // Correct logic: The flow on this link is the full path amount
          // We sum up amounts if multiple paths use the same link
          const amount = path.amount;

          if (linkMap.has(key)) {
            linkMap.get(key)!.value += amount;
          } else {
            linkMap.set(key, {
              source: sourceAddr,
              target: targetAddr,
              value: amount,
            });
          }
        }
      }
    });

    // 2. Cycle Detection and Removal
    // D3 Sankey crashes on cycles. We must remove back-edges.
    const nodesArray = Array.from(nodeMap.values());
    const validLinks: SankeyLinkData[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // Build Adjacency List for DFS
    const adjacency = new Map<string, string[]>();
    linkMap.forEach((link, key) => {
      if (!adjacency.has(link.source)) adjacency.set(link.source, []);
      adjacency.get(link.source)!.push(link.target);
    });

    // Helper to check if a link creates a cycle
    // A simple DFS cycle removal approach:
    // If we encounter a node that is currently in the recursion stack, it's a back edge.
    // However, since we have pre-built links, we can just filter the linkMap.

    // Better approach for Sankey:
    // Only add links that do NOT point back to an ancestor in the current DFS path.
    // Actually, simply checking if target is in recursionStack during a traversal is enough
    // provided we traverse the graph structure implied by linkMap.

    // Let's filter the linkMap entries directly.
    // We will do a full DFS from 'Source' (or all nodes) to define a valid topological order if possible,
    // or just drop back-edges.

    const isCyclic = (curr: string, target: string, stack: Set<string>) => {
      if (stack.has(target)) return true; // Back edge
      return false;
    };

    // We can't easily run isCyclic on individual links without context.
    // Instead, let's just use the 'visited' set during graph traversal to build validLinks.
    // BUT, simply dropping random edges might disconnect important flows.
    // A standard heuristic is: specific cycles usually come from small loopbacks.
    // Let's try to keep it simple: any link where (target, source) exists with higher value?
    // No. The most robust way is BFS/DFS from source and tracking depth.
    // If target depth <= source depth, it MIGHT be a cycle, but in complex graphs (DAGs) horizontal links are fine.
    // STRICT CYCLES: If we can reach Source from Target, then adding Source->Target makes a cycle.

    // Pragmantic fix: Maintain a set of "upstream" nodes for each node. (Expensive)
    // Fast fix: DFS to detect cycles and drop the closing edge.

    const safeLinks = new Set<string>();
    const dfs = (node: string, stack: Set<string>) => {
      visited.add(node);
      stack.add(node);

      const neighbors = adjacency.get(node) || [];
      neighbors.forEach((next) => {
        const linkKey = `${node}->${next}`;
        if (stack.has(next)) {
          // Detected cycle (Back Edge), skip this link
          console.warn(`Cycle detected: dropping link ${node} -> ${next}`);
        } else {
          safeLinks.add(linkKey);
          if (!visited.has(next)) {
            dfs(next, stack);
          }
        }
      });

      stack.delete(node);
    };

    // Start DFS from the user-selected Source, then any unvisited nodes
    if (nodeMap.has(source)) {
      dfs(source, recursionStack);
    }
    nodesArray.forEach((n) => {
      if (!visited.has(n.address)) {
        dfs(n.address, recursionStack);
      }
    });

    // 3. Construct Final Links Array
    linkMap.forEach((data, key) => {
      if (safeLinks.has(key)) {
        validLinks.push({
          source: nodeMap.get(data.source)!,
          target: nodeMap.get(data.target)!,
          value: data.value,
          percentage: (data.value / taintFlow.totalTainted) * 100, // Approximate % of total taint
        } as SankeyLinkData);
      }
    });

    if (nodesArray.length === 0 || validLinks.length === 0) return;

    const nodes = nodesArray;

    // Create Sankey layout
    const sankeyLayout = sankey<SankeyNodeData, SankeyLinkData>()
      .nodeWidth(20)
      .nodePadding(20)
      .extent([
        [0, 0],
        [width, height],
      ]);

    const graph = sankeyLayout({
      nodes: nodes.map((d) => ({ ...d })),
      links: validLinks.map((d) => ({ ...d })),
    });

    // Color scale
    const colorScale = d3
      .scaleSequential(d3.interpolateViridis)
      .domain([0, d3.max(validLinks, (d) => d.percentage) || 100]);

    // Draw links
    g.append("g")
      .selectAll(".link")
      .data(graph.links)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", sankeyLinkHorizontal())
      .attr("stroke", (d) => colorScale(d.percentage))
      .attr("stroke-width", (d) => Math.max(1, d.width || 0))
      .attr("fill", "none")
      .attr("opacity", 0.5)
      .append("title")
      .text(
        (d) =>
          `${d.source.name} → ${
            d.target.name
          }\nTaint: ${d.value.toLocaleString()}\nPercentage: ${d.percentage.toFixed(
            2
          )}%`
      );

    // Draw link labels
    g.append("g")
      .selectAll(".link-label")
      .data(graph.links.filter((d) => d.percentage > 5)) // Only show labels for significant flows
      .enter()
      .append("text")
      .attr("class", "link-label")
      .attr("x", (d) => ((d.source.x1 || 0) + (d.target.x0 || 0)) / 2)
      .attr("y", (d) => ((d.y0 || 0) + (d.y1 || 0)) / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#e2e8f0")
      .attr("font-size", "11px")
      .attr("font-weight", "bold")
      .text((d) => `${d.percentage.toFixed(1)}%`);

    // Draw nodes
    const nodeGroups = g
      .append("g")
      .selectAll(".node")
      .data(graph.nodes)
      .enter()
      .append("g")
      .attr("class", "node");

    nodeGroups
      .append("rect")
      .attr("x", (d) => d.x0 || 0)
      .attr("y", (d) => d.y0 || 0)
      .attr("height", (d) => (d.y1 || 0) - (d.y0 || 0))
      .attr("width", sankeyLayout.nodeWidth())
      .attr("fill", (d) => {
        if (d.address === source) return "#6366f1"; // Source: indigo
        if (d.address === target) return "#ef4444"; // Target: red
        return "#64748b"; // Intermediate: slate
      })
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 2)
      .append("title")
      .text((d) => `${d.name}\n${d.address}`);

    // Node labels
    nodeGroups
      .append("text")
      .attr("x", (d) =>
        (d.x0 || 0) < width / 2 ? (d.x1 || 0) + 6 : (d.x0 || 0) - 6
      )
      .attr("y", (d) => ((d.y1 || 0) + (d.y0 || 0)) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (d) => ((d.x0 || 0) < width / 2 ? "start" : "end"))
      .attr("fill", "#e2e8f0")
      .attr("font-size", "12px")
      .text((d) => d.name);
  };

  const handleExport = (format: "csv" | "json") => {
    if (!taintFlow) return;

    if (format === "csv") {
      exportTaintToCSV(taintFlow, source, target);
    } else {
      const blob = new Blob([JSON.stringify(taintFlow, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taint-analysis-${source.slice(0, 8)}-to-${target.slice(
        0,
        8
      )}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center shadow-lg shadow-pink-500/20">
          <Droplet className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Taint Analysis</h2>
          <p className="text-slate-400 text-sm">
            Track fund flow percentages between addresses
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Source Address
            </label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Enter source address..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Target Address
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Enter target address..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Max Hops: {maxHops}
            </label>
            <input
              type="range"
              min={2}
              max={10}
              value={maxHops}
              onChange={(e) => setMaxHops(parseInt(e.target.value))}
              className="w-full"
              style={{
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${
                  ((maxHops - 2) / 8) * 100
                }%, #334155 ${((maxHops - 2) / 8) * 100}%, #334155 100%)`,
              }}
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleAnalyze}
              disabled={!source || !target || loading}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
            >
              Analyze Taint
            </button>

            {taintFlow && (
              <ExportButton
                onExport={handleExport}
                formats={["csv", "json"]}
                label="Export"
              />
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl">
          <LoadingSpinner message="Analyzing fund flow..." />
        </div>
      )}

      {/* Results */}
      {taintFlow && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">
              Taint Analysis Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-500 text-xs mb-1">
                  Total Taint Amount
                </p>
                <p className="text-white text-xl font-bold">
                  {taintFlow.totalTainted.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Taint Percentage</p>
                <p className="text-white text-xl font-bold">
                  {taintFlow.taintPercentage.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Paths Found</p>
                <p className="text-white text-xl font-bold">
                  {taintFlow.paths.length}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">Max Hops Used</p>
                <p className="text-white text-xl font-bold">
                  {Math.max(...taintFlow.paths.map((p) => p.hops), 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Sankey Diagram */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">Fund Flow Diagram</h3>
            <svg ref={svgRef} className="w-full" style={{ height: "600px" }} />
            <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-indigo-600 rounded" />
                <span>Source</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 rounded" />
                <span>Target</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-slate-600 rounded" />
                <span>Intermediate</span>
              </div>
            </div>
          </div>

          {/* Top Taint Paths */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-4">
              Top Taint Paths ({taintFlow.paths.slice(0, 10).length})
            </h3>
            <div className="space-y-3">
              {taintFlow.paths.slice(0, 10).map((path, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 border border-slate-700 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-slate-500 text-xs">
                        Path #{idx + 1}
                      </span>
                      <div className="text-white text-sm font-mono mt-1">
                        {path.path.map((addr, i) => (
                          <span key={i}>
                            {addr.slice(0, 6)}...{addr.slice(-4)}
                            {i < path.path.length - 1 && (
                              <span className="text-indigo-400 mx-1">→</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500 text-xs">Taint Amount</p>
                      <p className="text-white font-bold">
                        {path.amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">{path.hops} hops</span>
                    <span className="text-indigo-400 font-semibold">
                      {path.taintPercentage.toFixed(2)}% of target funds
                    </span>
                  </div>
                </div>
              ))}
              {taintFlow.paths.length > 10 && (
                <p className="text-slate-500 text-sm text-center py-2">
                  +{taintFlow.paths.length - 10} more paths (export to view all)
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!taintFlow && !loading && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
          <Download className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-300 text-lg mb-2">Taint Analysis</p>
          <p className="text-slate-500">
            Track what percentage of funds from a source address reached a
            target address
          </p>
        </div>
      )}
    </div>
  );
};

export default TaintChart;
