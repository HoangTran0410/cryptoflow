import * as d3 from "d3";

export interface Transaction {
  id: string;
  date: Date;
  from: string;
  to: string;
  amount: number;
  currency: string;
  type?: "transfer" | "mint" | "burn" | "fee";
}

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  group?: number;
  val: number; // Volume
  type: "source" | "target" | "mixed" | "main";
  transactionCount?: number;
  // D3 Simulation properties
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  value: number; // Amount
  count?: number;
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

export interface AnalyticsSummary {
  totalVolume: number;
  transactionCount: number;
  uniqueAddresses: number;
  avgTransactionValue: number;
  maxTransactionValue: number;
  startDate: Date;
  endDate: Date;
  topAddress: string;
}

export interface DailyVolume {
  date: string;
  volume: number;
  count: number;
}

export interface AddressFlowStats {
  address: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  txCount: number;
}

export interface TraceData {
  mainNode: Node;
  inflowNodes: Node[];
  outflowNodes: Node[];
  links: Link[];
}

export interface TransactionFilter {
  minAmount: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  minInflow?: number;
  minOutflow?: number;
}

// ===== FORENSICS TYPES =====

// Multi-hop path representation
export interface TransactionPath {
  addresses: string[]; // Ordered sequence of addresses
  transactions: Transaction[]; // Transactions connecting the path
  totalAmount: number; // Sum of amounts along path
  hops: number; // Number of hops (edges)
  startDate: Date; // First transaction timestamp
  endDate: Date; // Last transaction timestamp
  avgDelay: number; // Average time between hops (ms)
  suspicionScore: number; // 0-100 risk score
}

// Deep trace configuration
export interface DeepTraceConfig {
  startAddress: string;
  direction: "inflow" | "outflow" | "both";
  maxDepth: number; // 2-20 hops
  minAmount?: number; // Filter threshold
  maxPaths?: number; // Limit results
  includeCycles?: boolean; // Track circular flows
  timeWindow?: {
    start: Date;
    end: Date;
  };
}

// Deep trace node
export interface DeepTraceNode {
  address: string;
  depth: number; // Distance from origin
  totalVolume: number;
  transactionCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

// Deep trace edge
export interface DeepTraceEdge {
  from: string;
  to: string;
  amount: number;
  count: number; // Number of transactions
  firstTx: Date;
  lastTx: Date;
}

// Deep trace result
export interface DeepTraceResult {
  config: DeepTraceConfig;
  nodes: Map<string, DeepTraceNode>;
  edges: DeepTraceEdge[];
  paths: TransactionPath[];
  statistics: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    executionTime: number; // ms
  };
}

// Path finder result
export interface PathFinderResult {
  source: string;
  target: string;
  paths: TransactionPath[];
  shortestPath: TransactionPath | null;
  statistics: {
    totalPathsFound: number;
    avgPathLength: number;
    executionTime: number;
  };
}

// Taint analysis path
export interface TaintPath {
  path: string[]; // Address sequence
  amount: number; // Tainted amount through this path
  percentage: number; // % of total taint
}

// Taint analysis result
export interface TaintFlow {
  sourceAddress: string; // Origin wallet
  targetAddress: string; // Destination wallet
  totalTainted: number; // Total amount that reached target
  taintPercentage: number; // % of target's funds from source
  paths: TaintPath[]; // Individual taint propagation paths
  hops: number; // Max hops in analysis
}

// Pattern detection
export interface SuspiciousPattern {
  type:
    | "round_amounts"
    | "rapid_transfers"
    | "circular_flow"
    | "layering"
    | "mixer_usage"
    | "high_velocity";
  severity: "low" | "medium" | "high" | "critical";
  score: number; // 0-100
  affectedAddresses: string[];
  transactions: Transaction[];
  description: string;
  metadata: Record<string, any>; // Pattern-specific details
}

// Address clustering
export interface AddressCluster {
  clusterId: string;
  addresses: string[];
  commonBehavior: string; // Description of shared patterns
  totalVolume: number;
  transactionCount: number;
  confidenceScore: number; // 0-1 clustering confidence
  features: {
    avgTransactionSize: number;
    peakActivityHour: number;
    primaryCounterparties: string[];
    roundAmountRatio: number;
  };
}

// Timeline event for temporal analysis
export interface TimelineEvent {
  timestamp: Date;
  type: "transfer" | "aggregation" | "split" | "dormant" | "spike";
  address: string;
  amount: number;
  relatedAddresses: string[];
  significance: number; // Event importance (0-1)
}

// Sankey diagram data structure
export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface SankeyNode {
  id: string;
  name: string;
  depth: number; // Vertical layer
  value: number; // Total flow through node
}

export interface SankeyLink {
  source: number; // Node index
  target: number; // Node index
  value: number; // Flow amount
  percentage: number; // % of source's outflow
}

// Web Worker message types
export interface ForensicsWorkerMessage {
  type:
    | "DEEP_TRACE"
    | "FIND_PATHS"
    | "TAINT_ANALYSIS"
    | "DETECT_PATTERNS"
    | "CLUSTER_ADDRESSES";
  payload: any;
  requestId: string;
}

export interface ForensicsWorkerResponse {
  type: "SUCCESS" | "ERROR" | "PROGRESS";
  requestId: string;
  data?: any;
  error?: string;
  progress?: number; // 0-100
}

// ===== WALLET ANALYSIS TYPES =====

export interface WalletTimeSeries {
  date: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  inflowCount: number;
  outflowCount: number;
}

export interface DailyTransactionCount {
  date: string;
  inflowCount: number;
  outflowCount: number;
  totalCount: number;
}

export interface WalletStats {
  address: string;
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
  inflowCount: number;
  outflowCount: number;
  totalTxCount: number;
  avgInflowSize: number;
  avgOutflowSize: number;
  firstTxDate: Date;
  lastTxDate: Date;
  topCounterparties: { address: string; volume: number; count: number }[];
  peakActivityHour: number;
  activityScore: number;
}

// ===== ARKHAM TRACER TYPES =====

export interface TracerWallet {
  address: string;
  laneIndex: number; // which vertical lane (0, 1, 2, ...)
  yPosition: number; // vertical position within the lane
  totalInflow: number;
  totalOutflow: number;
  txCount: number;
}

export interface TracerConnection {
  fromAddress: string;
  toAddress: string;
  totalAmount: number;
  txCount: number;
  transactions: Transaction[];
}
