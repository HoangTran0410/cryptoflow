import * as d3 from 'd3';

export interface Transaction {
  id: string;
  date: Date;
  from: string;
  to: string;
  amount: number;
  currency: string;
  type?: 'transfer' | 'mint' | 'burn' | 'fee';
}

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  group?: number;
  val: number; // Volume
  type: 'source' | 'target' | 'mixed' | 'main';
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
  endDate: string;   // YYYY-MM-DD
  minInflow?: number;
  minOutflow?: number;
}
