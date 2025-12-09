import React, { useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { Transaction, TimelineEvent } from '../types';
import { getTransactionTimeline } from '../utils/analytics';
import { Search, Calendar, TrendingUp, TrendingDown, Activity, Moon } from 'lucide-react';

interface TimelineTracerProps {
  transactions: Transaction[];
  initialAddress?: string;
}

const TimelineTracer: React.FC<TimelineTracerProps> = ({ transactions, initialAddress = '' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [address, setAddress] = useState(initialAddress);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const handleAnalyze = () => {
    if (!address) return;

    const timeline = getTransactionTimeline(transactions, address);
    setEvents(timeline);
    setSelectedEvent(timeline.length > 0 ? timeline[0] : null);
  };

  useEffect(() => {
    if (events.length > 0 && svgRef.current) {
      renderTimeline();
    }
  }, [events]);

  const renderTimeline = () => {
    if (!svgRef.current || events.length === 0) return;

    const margin = { top: 40, right: 40, bottom: 60, left: 40 };
    const width = 1200 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Time scale
    const xScale = d3.scaleTime()
      .domain(d3.extent(events, d => d.timestamp) as [Date, Date])
      .range([0, width]);

    // Y scale for amount
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(events, d => d.amount) || 1])
      .range([height, 0]);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('fill', '#94a3b8');

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .attr('color', '#64748b')
      .selectAll('text')
      .attr('fill', '#94a3b8');

    // Event type colors
    const eventColors = {
      transfer: '#6366f1',
      aggregation: '#10b981',
      split: '#f59e0b',
      spike: '#ef4444',
      dormant: '#64748b',
    };

    // Event type icons
    const eventIcons = {
      transfer: '●',
      aggregation: '▼',
      split: '▲',
      spike: '★',
      dormant: '○',
    };

    // Draw events
    const eventGroups = g.selectAll('.event')
      .data(events)
      .enter()
      .append('g')
      .attr('class', 'event')
      .attr('transform', d => `translate(${xScale(d.timestamp)},${yScale(d.amount)})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => setSelectedEvent(d));

    // Event circles
    eventGroups.append('circle')
      .attr('r', d => 3 + d.significance * 5)
      .attr('fill', d => eventColors[d.type])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);

    // Event labels
    eventGroups.append('text')
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e2e8f0')
      .attr('font-size', '16px')
      .text(d => eventIcons[d.type]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale)
        .ticks(5)
        .tickSize(-width)
        .tickFormat(() => '')
      );

    // Labels
    svg.append('text')
      .attr('x', width / 2 + margin.left)
      .attr('y', height + margin.top + 50)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '12px')
      .text('Date');

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -(height / 2 + margin.top))
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '12px')
      .text('Amount');
  };

  const getEventIcon = (type: TimelineEvent['type']) => {
    const icons = {
      transfer: Activity,
      aggregation: TrendingDown,
      split: TrendingUp,
      spike: Activity,
      dormant: Moon,
    };
    return icons[type];
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Search className="w-4 h-4 inline mr-1" />
              Address to Analyze
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter wallet address..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleAnalyze}
              disabled={!address}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              Analyze Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {events.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Timeline Visualization */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Activity Timeline</h3>
              <svg ref={svgRef} className="w-full" style={{ height: '300px' }} />
            </div>

            {/* Legend */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-slate-400 text-sm font-semibold mb-3">Event Types</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { type: 'transfer', label: 'Transfer', color: 'bg-indigo-500' },
                  { type: 'aggregation', label: 'Aggregation', color: 'bg-emerald-500' },
                  { type: 'split', label: 'Split', color: 'bg-orange-500' },
                  { type: 'spike', label: 'Spike', color: 'bg-red-500' },
                  { type: 'dormant', label: 'Dormant', color: 'bg-slate-500' },
                ].map(({ type, label, color }) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <span className="text-slate-300 text-xs">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Event Details */}
          <div className="lg:col-span-1">
            {selectedEvent ? (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-4 sticky top-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">Event Details</h3>
                  {React.createElement(getEventIcon(selectedEvent.type), {
                    className: 'w-5 h-5 text-indigo-400',
                  })}
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">Type</p>
                    <p className="text-white capitalize">{selectedEvent.type}</p>
                  </div>

                  <div>
                    <p className="text-slate-500 text-xs mb-1">Date</p>
                    <p className="text-white text-sm">{selectedEvent.timestamp.toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-slate-500 text-xs mb-1">Amount</p>
                    <p className="text-white text-xl font-bold">
                      {selectedEvent.amount.toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-500 text-xs mb-1">Significance</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-800 rounded-full h-2">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all"
                          style={{ width: `${selectedEvent.significance * 100}%` }}
                        />
                      </div>
                      <span className="text-white text-xs font-semibold">
                        {(selectedEvent.significance * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {selectedEvent.relatedAddresses.length > 0 && (
                    <div>
                      <p className="text-slate-500 text-xs mb-2">
                        Related Addresses ({selectedEvent.relatedAddresses.length})
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {selectedEvent.relatedAddresses.slice(0, 10).map((addr, idx) => (
                          <div key={idx} className="bg-slate-800/50 rounded px-2 py-1 font-mono text-xs text-slate-300 truncate">
                            {addr}
                          </div>
                        ))}
                        {selectedEvent.relatedAddresses.length > 10 && (
                          <p className="text-slate-500 text-xs text-center py-1">
                            +{selectedEvent.relatedAddresses.length - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
                <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400">Click an event on the timeline</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!address && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
          <Calendar className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-300 text-lg mb-2">Timeline Analysis</p>
          <p className="text-slate-500">Enter an address to view chronological transaction activity</p>
        </div>
      )}
    </div>
  );
};

export default TimelineTracer;
