import React, { useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Transaction, DeepTraceResult, DeepTraceConfig } from '../types';
import { useForensicsWorker } from '../hooks/useForensicsWorker';
import { deepTraceCache, generateCacheKey } from '../utils/cache';
import LoadingSpinner from './shared/LoadingSpinner';
import DepthSlider from './shared/DepthSlider';
import ExportButton from './shared/ExportButton';
import { exportVisualization } from '../utils/export';
import { Search, ArrowDown, ArrowUp, ArrowLeftRight } from 'lucide-react';

interface PathExplorerProps {
  transactions: Transaction[];
  initialAddress?: string;
}

const PathExplorer: React.FC<PathExplorerProps> = ({ transactions, initialAddress = '' }) => {
  const { executeTask, isReady } = useForensicsWorker();
  const svgRef = useRef<SVGSVGElement>(null);
  const [address, setAddress] = useState(initialAddress);
  const [depth, setDepth] = useState(3);
  const [direction, setDirection] = useState<'inflow' | 'outflow' | 'both'>('both');
  const [result, setResult] = useState<DeepTraceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTrace = async () => {
    if (!address || !isReady) return;

    setIsLoading(true);

    const config: DeepTraceConfig = {
      startAddress: address,
      direction,
      maxDepth: depth,
    };

    const cacheKey = generateCacheKey('deepTrace', { address, direction, depth });
    let traceResult = deepTraceCache.get(cacheKey);

    if (!traceResult) {
      traceResult = await executeTask<DeepTraceResult>({
        type: 'DEEP_TRACE',
        payload: { transactions, config },
      });
      if (traceResult) {
        deepTraceCache.set(cacheKey, traceResult);
      }
    }

    setResult(traceResult);
    setIsLoading(false);
  };

  useEffect(() => {
    if (result && svgRef.current) {
      renderGraph();
    }
  }, [result]);

  const renderGraph = () => {
    if (!result || !svgRef.current) return;

    const width = 1200;
    const height = 800;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', [0, 0, width, height]);

    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Convert Map to array for D3
    const nodes = Array.from(result.nodes.values()).map(n => ({
      ...n,
      id: n.address,
    }));

    const links = result.edges.map(e => ({
      source: e.from,
      target: e.to,
      value: e.amount,
    }));

    // Color scale by depth
    const colorScale = d3.scaleSequential(d3.interpolateViridis)
      .domain([0, result.statistics.maxDepth]);

    // Create force simulation
    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#64748b')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d: any) => Math.sqrt(d.value) * 0.1 + 1);

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
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
      );

    node.append('circle')
      .attr('r', (d: any) => Math.sqrt(d.totalVolume) * 0.5 + 5)
      .attr('fill', (d: any) => d.address === address ? '#a78bfa' : colorScale(d.depth))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    node.append('text')
      .attr('x', 12)
      .attr('y', 4)
      .attr('fill', '#e2e8f0')
      .attr('font-size', '10px')
      .style('pointer-events', 'none')
      .text((d: any) => d.address.slice(0, 8) + '...');

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
  };

  const handleExport = (format: 'svg' | 'png') => {
    if (svgRef.current) {
      exportVisualization(svgRef.current, `path-explorer-${address}.${format}`, format);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Address Input */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Start Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter wallet address..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Direction Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Direction
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection('inflow')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'inflow'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                title="Inflow"
              >
                <ArrowDown className="w-4 h-4 mx-auto" />
              </button>
              <button
                onClick={() => setDirection('both')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'both'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                title="Both"
              >
                <ArrowLeftRight className="w-4 h-4 mx-auto" />
              </button>
              <button
                onClick={() => setDirection('outflow')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'outflow'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                title="Outflow"
              >
                <ArrowUp className="w-4 h-4 mx-auto" />
              </button>
            </div>
          </div>
        </div>

        {/* Depth Slider */}
        <DepthSlider value={depth} onChange={setDepth} min={2} max={20} />

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleTrace}
            disabled={!address || isLoading}
            className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
          >
            {isLoading ? 'Tracing...' : 'Trace Transactions'}
          </button>
          {result && (
            <ExportButton onExport={handleExport} formats={['svg', 'png']} />
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading && <LoadingSpinner message="Tracing multi-hop transactions..." />}

      {result && !isLoading && (
        <div className="space-y-4">
          {/* Statistics */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">Nodes</p>
              <p className="text-white text-2xl font-bold">{result.statistics.totalNodes}</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">Edges</p>
              <p className="text-white text-2xl font-bold">{result.statistics.totalEdges}</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">Max Depth</p>
              <p className="text-white text-2xl font-bold">{result.statistics.maxDepth}</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">Execution Time</p>
              <p className="text-white text-2xl font-bold">{result.statistics.executionTime.toFixed(0)}ms</p>
            </div>
          </div>

          {/* Graph Visualization */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <svg ref={svgRef} className="w-full" style={{ height: '600px' }} />
          </div>

          {/* Legend */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <p className="text-slate-400 text-sm mb-2">
              <strong className="text-white">Legend:</strong> Node size = volume, Color = depth from start, Purple = start address
            </p>
            <p className="text-slate-500 text-xs">
              Drag nodes to rearrange. Scroll to zoom. Click and drag background to pan.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PathExplorer;
