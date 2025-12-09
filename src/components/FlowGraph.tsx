import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GraphData, Node, Link } from "../types";
import { ZoomIn, ZoomOut, RefreshCw } from "lucide-react";

interface FlowGraphProps {
  data: GraphData;
}

const FlowGraph: React.FC<FlowGraphProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  // Re-run simulation when data changes
  useEffect(() => {
    if (!data.nodes.length || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = 600;

    // Clear previous
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .attr("class", "cursor-grab active:cursor-grabbing");

    // Zoom behavior
    const g = svg.append("g");

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setZoom(event.transform.k);
      });

    svg.call(zoomBehavior);

    // Simulation Setup
    const simulation = d3
      .forceSimulation(data.nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(data.links)
          .id((d: any) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide().radius((d: any) => Math.sqrt(d.val || 1) + 10)
      );

    // Links
    const link = g
      .append("g")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(data.links)
      .join("line")
      .attr("stroke-width", (d: Link) =>
        Math.min(Math.sqrt(d.value) * 0.5 + 1, 8)
      ); // Cap width

    // Nodes
    const node = g
      .append("g")
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("r", (d: Node) => Math.min(Math.sqrt(d.val || 1) + 3, 20)) // Cap radius
      .attr("fill", (d: Node) => {
        // Color hubs differently?
        if (
          d.id.toLowerCase().includes("main") ||
          d.id.toLowerCase().includes("exchange")
        )
          return "#8b5cf6"; // Violet for hubs
        return "#10b981"; // Emerald for standard
      })
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 1.5)
      .call(drag(simulation) as any);

    // Labels (only for larger nodes to reduce clutter)
    const label = g
      .append("g")
      .selectAll("text")
      .data(data.nodes.filter((d) => (d.val || 0) > 0)) // Only label nodes with volume
      .join("text")
      .text((d: Node) => (d.id.length > 10 ? d.id.slice(0, 8) + "..." : d.id))
      .attr("x", 8)
      .attr("y", 3)
      .attr("fill", "#cbd5e1")
      .attr("font-size", "10px")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 2px rgba(0,0,0,0.8)");

    // Tooltip logic
    const tooltip = d3
      .select(containerRef.current)
      .append("div")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "#0f172a")
      .style("border", "1px solid #334155")
      .style("color", "#f1f5f9")
      .style("padding", "8px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("z-index", "10");

    node
      .on("mouseover", (event, d: Node) => {
        tooltip
          .style("visibility", "visible")
          .html(
            `<strong>ID:</strong> ${
              d.id
            }<br/><strong>Volume:</strong> ${d.val.toFixed(2)}`
          );
      })
      .on("mousemove", (event) => {
        tooltip
          .style("top", event.pageY - 10 + "px")
          .style("left", event.pageX + 10 + "px");
      })
      .on("mouseout", () => {
        tooltip.style("visibility", "hidden");
      });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);

      label.attr("x", (d: any) => d.x + 10).attr("y", (d: any) => d.y + 4);
    });

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [data]);

  // Drag Helper
  const drag = (
    simulation: d3.Simulation<d3.SimulationNodeDatum, undefined>
  ) => {
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return d3
      .drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-8 relative">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-6 bg-purple-500 rounded-full"></span>
          Network Flow Map (Top 100 Active Nodes)
        </h3>
        <div className="flex gap-2">
          <div className="px-3 py-1 bg-slate-800 rounded text-xs text-slate-400">
            Zoom: {zoom.toFixed(1)}x
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-[600px] bg-slate-950/50 rounded-lg overflow-hidden border border-slate-800/50"
      >
        <svg ref={svgRef} className="w-full h-full"></svg>
        <div className="absolute bottom-4 right-4 flex gap-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/80 backdrop-blur rounded border border-slate-700 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> User
            <span className="w-2 h-2 rounded-full bg-purple-500 ml-2"></span>{" "}
            Hub/Exchange
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowGraph;
