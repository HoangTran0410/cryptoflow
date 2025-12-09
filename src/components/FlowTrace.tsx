import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Transaction, TraceData, Node } from "../types";
import { getTraceData } from "../utils/analytics";
import { ArrowRight, Filter, Search } from "lucide-react";

interface FlowTraceProps {
  transactions: Transaction[];
  initialAddress: string;
}

const FlowTrace: React.FC<FlowTraceProps> = ({
  transactions,
  initialAddress,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [centerAddress, setCenterAddress] = useState(initialAddress);
  const [data, setData] = useState<TraceData | null>(null);

  useEffect(() => {
    if (initialAddress) setCenterAddress(initialAddress);
  }, [initialAddress]);

  useEffect(() => {
    if (!centerAddress || transactions.length === 0) return;
    const traceData = getTraceData(transactions, centerAddress);
    setData(traceData);
  }, [centerAddress, transactions]);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = 600;
    const cardHeight = 50;
    const cardWidth = 160;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Define Arrowhead Marker
    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", cardWidth / 2 + 10) // Position at edge of card
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("xoverflow", "visible")
      .append("path")
      .attr("d", "M 0,-5 L 10 ,0 L 0,5")
      .attr("fill", "#64748b")
      .style("stroke", "none");

    const g = svg.append("g");

    // Coordinates
    const centerX = width / 2;
    const centerY = height / 2;
    const leftX = width * 0.2;
    const rightX = width * 0.8;

    // Helper to calculate Y positions for columns
    const getYPositions = (count: number) => {
      const totalH = count * (cardHeight + 20);
      const startY = centerY - totalH / 2;
      return Array.from({ length: count }).map(
        (_, i) => startY + i * (cardHeight + 20)
      );
    };

    // Calculate Positions
    const leftY = getYPositions(data.inflowNodes.length);
    const rightY = getYPositions(data.outflowNodes.length);

    // Prepare Node Data with visual coordinates
    const visualNodes: (Node & {
      x: number;
      y: number;
      w: number;
      h: number;
    })[] = [];

    // Main Node
    visualNodes.push({
      ...data.mainNode,
      x: centerX,
      y: centerY,
      w: cardWidth,
      h: cardHeight,
    });

    // Inflow Nodes
    data.inflowNodes.forEach((n, i) => {
      visualNodes.push({
        ...n,
        x: leftX,
        y: leftY[i],
        w: cardWidth,
        h: cardHeight,
      });
    });

    // Outflow Nodes
    data.outflowNodes.forEach((n, i) => {
      visualNodes.push({
        ...n,
        x: rightX,
        y: rightY[i],
        w: cardWidth,
        h: cardHeight,
      });
    });

    // Links Generator
    const linkGen = d3
      .linkHorizontal()
      .x((d: any) => d.x)
      .y((d: any) => d.y);

    // Draw Links
    const linksData = [
      ...data.inflowNodes.map((n, i) => ({
        source: { x: leftX + cardWidth / 2, y: leftY[i] },
        target: { x: centerX - cardWidth / 2, y: centerY },
        value: n.val,
      })),
      ...data.outflowNodes.map((n, i) => ({
        source: { x: centerX + cardWidth / 2, y: centerY },
        target: { x: rightX - cardWidth / 2, y: rightY[i] },
        value: n.val,
      })),
    ];

    g.selectAll("path.link")
      .data(linksData)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", (d: any) => linkGen({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", (d: any, i: number) =>
        i < data.inflowNodes.length ? "url(#gradIn)" : "url(#gradOut)"
      )
      .attr("stroke-width", (d) =>
        Math.max(1, Math.min(Math.sqrt(d.value) * 0.5, 5))
      )
      .attr("stroke-opacity", 0.6);

    // Gradients
    const defs = svg.append("defs");

    // Inflow Gradient (Green to Grey)
    const gradIn = defs.append("linearGradient").attr("id", "gradIn");
    gradIn.append("stop").attr("offset", "0%").attr("stop-color", "#10b981");
    gradIn.append("stop").attr("offset", "100%").attr("stop-color", "#475569");

    // Outflow Gradient (Grey to Orange)
    const gradOut = defs.append("linearGradient").attr("id", "gradOut");
    gradOut.append("stop").attr("offset", "0%").attr("stop-color", "#475569");
    gradOut.append("stop").attr("offset", "100%").attr("stop-color", "#f97316");

    // Draw Nodes (Cards)
    const nodes = g
      .selectAll(".node")
      .data(visualNodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x - d.w / 2},${d.y - d.h / 2})`)
      .style("cursor", "pointer")
      .on("click", (e, d) => setCenterAddress(d.id));

    // Card Rect
    nodes
      .append("rect")
      .attr("width", (d) => d.w)
      .attr("height", (d) => d.h)
      .attr("rx", 6)
      .attr("fill", (d) => {
        if (d.type === "main") return "#4c1d95"; // Deep Purple for center
        if (d.type === "source") return "#064e3b"; // Deep Green
        return "#7c2d12"; // Deep Orange/Red
      })
      .attr("stroke", (d) => {
        if (d.type === "main") return "#a78bfa";
        if (d.type === "source") return "#34d399";
        return "#fdba74";
      })
      .attr("stroke-width", 1);

    // Text: Address
    nodes
      .append("text")
      .text((d) => (d.id.length > 12 ? d.id.slice(0, 10) + "..." : d.id))
      .attr("x", 10)
      .attr("y", 20)
      .attr("fill", "#e2e8f0")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("font-family", "monospace");

    // Text: Value
    nodes
      .append("text")
      .text((d) => `${d.val.toFixed(2)} (${d.transactionCount} tx)`)
      .attr("x", 10)
      .attr("y", 38)
      .attr("fill", "#94a3b8")
      .attr("font-size", "10px");
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400 text-sm">Tracing:</span>
          <span className="text-indigo-400 font-mono font-bold">
            {centerAddress}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Click any node to re-center the trace on that address.
        </div>
      </div>

      <div className="relative w-full h-[600px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
        <svg ref={svgRef} className="w-full h-full"></svg>

        {/* Legend Overlay */}
        <div className="absolute bottom-4 left-4 flex gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-900 border border-emerald-500 rounded"></div>
            <span className="text-emerald-400">Inflow Source</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-indigo-900 border border-indigo-500 rounded"></div>
            <span className="text-indigo-400">Selected Wallet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-900 border border-orange-500 rounded"></div>
            <span className="text-orange-400">Outflow Target</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowTrace;
