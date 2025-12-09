import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Transaction, TraceData, Node, DeepTraceResult } from "../types";
import { getTraceData, getDeepTrace } from "../utils/analytics";
import { ArrowRight, Filter, Search } from "lucide-react";
import DepthSlider from "./shared/DepthSlider";

interface FlowTraceProps {
  transactions: Transaction[];
  initialAddress: string;
  maxDepth?: number;
}

const FlowTrace: React.FC<FlowTraceProps> = ({
  transactions,
  initialAddress,
  maxDepth = 3,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [centerAddress, setCenterAddress] = useState(initialAddress);
  const [depth, setDepth] = useState(maxDepth);
  const [data, setData] = useState<TraceData | null>(null);
  const [useDeepTrace, setUseDeepTrace] = useState(false);
  const [deepData, setDeepData] = useState<DeepTraceResult | null>(null);

  useEffect(() => {
    if (initialAddress) setCenterAddress(initialAddress);
  }, [initialAddress]);

  useEffect(() => {
    if (!centerAddress || transactions.length === 0) return;

    if (useDeepTrace && depth > 1) {
      const deepTraceData = getDeepTrace(transactions, {
        startAddress: centerAddress,
        direction: 'both',
        maxDepth: depth,
      });
      setDeepData(deepTraceData);
      setData(null);
    } else {
      const traceData = getTraceData(transactions, centerAddress);
      setData(traceData);
      setDeepData(null);
    }
  }, [centerAddress, transactions, depth, useDeepTrace]);

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

  // Deep trace visualization with force simulation
  useEffect(() => {
    if (!deepData || !svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g");

    // Convert deep trace data to D3 force simulation format
    const nodes = Array.from(deepData.nodes.values()).map(node => ({
      id: node.address,
      depth: node.depth,
      volume: node.volume,
      ...node,
    }));

    const links = deepData.edges.map(edge => ({
      source: edge.from,
      target: edge.to,
      value: edge.amount,
    }));

    // Color scale by depth
    const colorScale = d3.scaleSequential(d3.interpolatePlasma)
      .domain([0, depth]);

    // Force simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#64748b')
      .attr('stroke-width', (d: any) => Math.max(1, Math.sqrt(d.value) * 0.3))
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      )
      .on('click', (e, d: any) => setCenterAddress(d.id));

    node.append('circle')
      .attr('r', (d: any) => 8 + Math.sqrt(d.volume) * 0.5)
      .attr('fill', (d: any) => colorScale(d.depth))
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 2);

    node.append('text')
      .text((d: any) => d.id.slice(0, 6) + '...')
      .attr('x', 12)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#e2e8f0')
      .attr('font-family', 'monospace');

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom as any);

    return () => {
      simulation.stop();
    };
  }, [deepData, depth]);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
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

        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useDeepTrace}
                onChange={(e) => setUseDeepTrace(e.target.checked)}
                className="w-4 h-4 text-indigo-600 bg-slate-800 border-slate-600 rounded focus:ring-indigo-500"
              />
              Multi-hop Deep Trace
            </label>
          </div>

          {useDeepTrace && (
            <div className="flex-1 max-w-md">
              <DepthSlider
                value={depth}
                onChange={setDepth}
                min={2}
                max={10}
                label="Trace Depth (hops)"
              />
            </div>
          )}

          {deepData && (
            <div className="flex gap-4 text-xs">
              <div className="text-slate-400">
                <span className="text-white font-bold">{deepData.nodes.size}</span> nodes
              </div>
              <div className="text-slate-400">
                <span className="text-white font-bold">{deepData.edges.length}</span> edges
              </div>
              <div className="text-slate-400">
                Max depth: <span className="text-white font-bold">{deepData.stats.maxDepth}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative w-full h-[600px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
        <svg ref={svgRef} className="w-full h-full"></svg>

        {/* Legend Overlay */}
        {!useDeepTrace ? (
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
        ) : (
          <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-2 font-semibold">Node Depth</p>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5].map(d => (
                <div key={d} className="flex flex-col items-center gap-1">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-slate-900"
                    style={{ backgroundColor: d3.interpolatePlasma(d / depth) }}
                  />
                  <span className="text-xs text-slate-500">{d}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Drag nodes • Scroll to zoom</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlowTrace;
