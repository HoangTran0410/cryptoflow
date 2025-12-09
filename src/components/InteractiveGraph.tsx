import React, { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { GraphData, Node, Link, Transaction } from "../types";
import { getNeighbors } from "../utils/analytics";
import { Maximize, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";

interface InteractiveGraphProps {
  transactions: Transaction[];
  rootAddress: string;
}

const InteractiveGraph: React.FC<InteractiveGraphProps> = ({
  transactions,
  rootAddress,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const simulationRef = useRef<d3.Simulation<
    d3.SimulationNodeDatum,
    undefined
  > | null>(null);

  // Initialize
  useEffect(() => {
    if (!rootAddress) return;
    const initial = getNeighbors(transactions, rootAddress);
    setGraphData(initial);
    setExpandedNodes(new Set([rootAddress]));
  }, [rootAddress, transactions]);

  // Expand Handler
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (expandedNodes.has(nodeId)) return; // Already expanded

      const { nodes: newNodes, links: newLinks } = getNeighbors(
        transactions,
        nodeId
      );

      setGraphData((prev) => {
        const existingNodeIds = new Set(prev.nodes.map((n) => n.id));
        const existingLinkIds = new Set(
          prev.links.map(
            (l) =>
              `${
                l.source instanceof Object ? (l.source as Node).id : l.source
              }-${
                l.target instanceof Object ? (l.target as Node).id : l.target
              }`
          )
        );

        const uniqueNodes = newNodes.filter((n) => !existingNodeIds.has(n.id));
        const uniqueLinks = newLinks.filter((l) => {
          const id = `${l.source}-${l.target}`;
          return !existingLinkIds.has(id);
        });

        return {
          nodes: [...prev.nodes, ...uniqueNodes],
          links: [...prev.links, ...uniqueLinks],
        };
      });

      setExpandedNodes((prev) => new Set(prev).add(nodeId));
    },
    [transactions, expandedNodes]
  );

  // D3 Rendering & Simulation
  useEffect(() => {
    if (
      !svgRef.current ||
      !containerRef.current ||
      graphData.nodes.length === 0
    )
      return;

    const width = containerRef.current.clientWidth;
    const height = 600;

    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    // Forces
    const simulation = d3
      .forceSimulation(graphData.nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(graphData.links)
          .id((d: any) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("collide", d3.forceCollide().radius(30))
      .force("center", d3.forceCenter(width / 2, height / 2));

    simulationRef.current = simulation;

    // Arrow Marker
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#64748b");

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    // Nodes
    const node = g
      .append("g")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .call(
        d3
          .drag<any, any>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on("click", (event, d) => handleNodeClick(d.id));

    // Node Circles
    node
      .append("circle")
      .attr("r", (d) => (expandedNodes.has(d.id) ? 12 : 8))
      .attr("fill", (d) => (expandedNodes.has(d.id) ? "#8b5cf6" : "#10b981"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    // Node Labels
    node
      .append("text")
      .text((d) => d.id.slice(0, 6))
      .attr("x", 15)
      .attr("y", 4)
      .attr("fill", "#cbd5e1")
      .attr("font-size", "10px")
      .style("pointer-events", "none");

    // "Click to Expand" Indicator
    node
      .filter((d) => !expandedNodes.has(d.id))
      .append("circle")
      .attr("r", 14)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-dasharray", "2,2");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, expandedNodes]); // Re-run when data changes

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 h-full relative">
      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 p-2 rounded backdrop-blur border border-slate-700">
        <p className="text-xs text-slate-400">
          <span className="font-bold text-white">Click</span> on green nodes to
          expand their connections. Purple nodes are already expanded.
        </p>
        <div className="mt-2 text-xs text-indigo-400">
          Current Nodes: {graphData.nodes.length} | Links:{" "}
          {graphData.links.length}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full h-[600px] bg-slate-950 rounded-lg overflow-hidden"
      >
        <svg ref={svgRef} className="w-full h-full"></svg>
      </div>
    </div>
  );
};

export default InteractiveGraph;
