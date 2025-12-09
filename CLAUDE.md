# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CryptoFlow Analytics is a React-based web application for visualizing cryptocurrency transaction flows. It processes transaction CSV data and generates interactive network graphs, flow analysis, and volume statistics using D3.js force simulations.

**Key Technologies:**
- React 19 with TypeScript
- Vite for build tooling
- D3.js for graph visualizations and force simulations
- Recharts for statistical charts
- Lucide React for icons

## Development Commands

```bash
# Install dependencies
npm install

# Run development server (starts on port 3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm preview
```

## Project Structure

```
src/
├── components/          # React components
│   ├── FileUpload.tsx          # CSV file upload handler
│   ├── SummaryStats.tsx        # Dashboard statistics display
│   ├── ChartsSection.tsx       # Volume charts using Recharts
│   ├── TransactionTable.tsx    # Transaction ledger table
│   ├── UnifiedGraph.tsx        # Interactive network graph (D3 force simulation)
│   ├── MoneyFlow.tsx           # Wallet flow leaderboard and corridors
│   ├── FlowGraph.tsx           # Legacy graph component
│   ├── FlowTrace.tsx           # Address trace visualization
│   └── InteractiveGraph.tsx    # Legacy interactive component
├── utils/
│   └── analytics.ts     # Core analytics and graph generation logic
├── types.ts             # TypeScript type definitions
├── constants.ts         # Application constants
├── App.tsx             # Main application with tab navigation
└── index.tsx           # Application entry point
```

## Architecture Highlights

### Data Flow

1. **CSV Upload** ([FileUpload.tsx](src/components/FileUpload.tsx)) → Parses CSV using `parseCSV()` in [analytics.ts](src/utils/analytics.ts)
2. **Transaction Storage** → Stored in `App.tsx` state and passed down to components
3. **Data Processing** → All analytics functions in [analytics.ts](src/utils/analytics.ts) transform transactions into graph data, statistics, and flow metrics
4. **Visualization** → Components consume processed data for rendering

### Tab System & Performance

The app uses a **tab persistence strategy** to prevent D3 simulation lag:

- Tabs are hidden via `display: none` rather than unmounted
- Components maintain their internal state (D3 simulations, scroll positions)
- Lazy loading: tabs only render when first visited (tracked via `visitedTabs` Set)
- Located in [App.tsx:133-185](src/App.tsx#L133-L185)

### D3 Force Simulation Pattern

The [UnifiedGraph.tsx](src/components/UnifiedGraph.tsx) component demonstrates the canonical pattern:

1. **Two separate useEffects**:
   - Effect 1 (lines 334-476): Handles physics simulation and graph topology
   - Effect 2 (lines 478-542): Handles visual styling based on selection state
2. **Node locking**: Nodes are frozen (`fx`, `fy`) after simulation ends to prevent drift
3. **Simulation reference**: Stored in `simulationRef` to prevent recreation
4. **Zoom behavior**: Stored in `zoomRef` with manual transform control

### Analytics Functions

All located in [utils/analytics.ts](src/utils/analytics.ts):

| Function | Purpose |
|----------|---------|
| `parseCSV()` | Flexible CSV parser supporting multiple column name formats |
| `calculateSummary()` | Aggregate statistics (volume, count, date range, top address) |
| `getDailyVolume()` | Time-series data for charts |
| `generateGraphData()` | Creates D3 force graph nodes/links with optional limiting |
| `getTraceData()` | Single-address inflow/outflow trace (Arkham-style) |
| `getWalletFlowStats()` | Per-address flow aggregation for leaderboard |
| `getNeighbors()` | Returns immediate neighbors for interactive exploration |

### Virtual Scrolling

[MoneyFlow.tsx](src/components/MoneyFlow.tsx) implements virtual scrolling for large datasets:
- Only renders visible rows (calculated from `scrollTop`)
- Uses absolute positioning with `translateY` offset
- Maintains full-height container for scrollbar accuracy

## Configuration Notes

### Vite Configuration

- **Root directory**: `src/` (not project root)
- **Build output**: `../` (builds to project root)
- **Code splitting**: React vendor and UI vendor chunks separated
- **Path alias**: `@/` resolves to project root
- **Environment variables**: `GEMINI_API_KEY` from `.env.local` (currently unused placeholder)

### TypeScript

- Module resolution: `bundler`
- JSX: `react-jsx` (auto-import React)
- Path alias: `@/*` for root imports
- Decorators enabled with `useDefineForClassFields: false`

## Data Format

Transaction CSVs must include columns matching these patterns (case-insensitive):
- **Date**: "date", "time", or "timestamp"
- **Amount**: "amount", "value", or "qty"
- **From** (optional): "from", "sender", or "source"
- **To** (optional): "to", "receiver", or "destination"
- **Currency** (optional): "currency", "coin", "symbol", or "asset"

Example:
```csv
Date,From,To,Amount,Currency
2024-01-15,0xABC...,0xDEF...,1000,USDT
```

## Type System

Key interfaces in [types.ts](src/types.ts):

- **Transaction**: Core data model with `id`, `date`, `from`, `to`, `amount`, `currency`
- **Node**: D3 simulation node extending `d3.SimulationNodeDatum` with `val` (volume), `type`, and position data
- **Link**: D3 link with `source`, `target`, `value` (amount), and `count`
- **GraphData**: Container for `nodes` and `links` arrays

## Known Patterns

### Color Coding

- **Violet (#8b5cf6)**: Named entities (addresses with underscores)
- **Rose (#f43f5e)**: Whale addresses
- **Blue (#3b82f6)**: Standard nodes
- **Emerald (#34d399)**: Source nodes / Inflow
- **Orange/Red**: Target nodes / Outflow
- **Purple (#a78bfa)**: Selected node

### State Management

No Redux/Context used. All state is:
1. Local component state (useState)
2. Derived/memoized data (useMemo)
3. Props drilling from App.tsx

### Filtering System

[UnifiedGraph.tsx](src/components/UnifiedGraph.tsx) implements multi-dimensional filtering:
- Date range (with presets: 24h, 7d, 30d, all time)
- Minimum transaction amount
- Minimum inflow/outflow at node level
- Filters regenerate graph data rather than hiding elements
