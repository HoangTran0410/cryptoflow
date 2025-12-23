import { Transaction } from "../types";

// ===== TYPES =====

export interface LayerStats {
  address: string;
  layer: number;
  totalReceived: number;
  totalSent: number;
  netFlow: number;
  incomingTxCount: number;
  outgoingTxCount: number;
  sourceAddresses: Set<string>; // Addresses that sent to this wallet
  destinationAddresses: Set<string>; // Addresses that received from this wallet
}

export interface FlowAnalysisResult {
  // Layer statistics
  layerBreakdown: Map<number, LayerStats[]>;

  // Top destinations (wallets receiving most funds)
  topDestinations: LayerStats[];

  // Top consolidation points (wallets receiving from many sources)
  topConsolidationPoints: LayerStats[];

  // Summary
  summary: {
    totalTransactions: number;
    totalVolume: number;
    uniqueAddresses: number;
    maxLayer: number;
  };
}

export interface ConsolidationAnalysis {
  address: string;
  layer: number;
  receivedFrom: {
    address: string;
    amount: number;
    txCount: number;
  }[];
  totalReceived: number;
  sourceCount: number;
}

// ===== ANALYSIS FUNCTIONS =====

/**
 * Build a map of address -> stats from transactions
 */
export function buildAddressStats(
  transactions: Transaction[],
  addressToLayer: Map<string, number>
): Map<string, LayerStats> {
  const statsMap = new Map<string, LayerStats>();

  const getOrCreate = (address: string): LayerStats => {
    const addr = address.toLowerCase();
    if (!statsMap.has(addr)) {
      statsMap.set(addr, {
        address: addr,
        layer: addressToLayer.get(addr) ?? -1, // -1 = unknown layer
        totalReceived: 0,
        totalSent: 0,
        netFlow: 0,
        incomingTxCount: 0,
        outgoingTxCount: 0,
        sourceAddresses: new Set(),
        destinationAddresses: new Set(),
      });
    }
    return statsMap.get(addr)!;
  };

  for (const tx of transactions) {
    const from = tx.from.toLowerCase();
    const to = tx.to.toLowerCase();

    // Update sender stats
    const senderStats = getOrCreate(from);
    senderStats.totalSent += tx.amount;
    senderStats.outgoingTxCount++;
    senderStats.destinationAddresses.add(to);
    senderStats.netFlow = senderStats.totalReceived - senderStats.totalSent;

    // Update receiver stats
    const receiverStats = getOrCreate(to);
    receiverStats.totalReceived += tx.amount;
    receiverStats.incomingTxCount++;
    receiverStats.sourceAddresses.add(from);
    receiverStats.netFlow =
      receiverStats.totalReceived - receiverStats.totalSent;
  }

  return statsMap;
}

/**
 * Find Layer 2+ destination wallets
 * These are wallets that received funds from Layer 1 (victim deposit addresses)
 */
export function findLayer2Destinations(
  transactions: Transaction[],
  layer1Addresses: string[]
): LayerStats[] {
  const layer1Set = new Set(layer1Addresses.map((a) => a.toLowerCase()));
  const destinationStats = new Map<string, LayerStats>();

  // Find all outgoing transactions from layer 1 addresses
  const outgoingTxs = transactions.filter((tx) =>
    layer1Set.has(tx.from.toLowerCase())
  );

  for (const tx of outgoingTxs) {
    const to = tx.to.toLowerCase();

    // Skip if destination is also a layer 1 address (internal transfer)
    if (layer1Set.has(to)) continue;

    if (!destinationStats.has(to)) {
      destinationStats.set(to, {
        address: to,
        layer: 2,
        totalReceived: 0,
        totalSent: 0,
        netFlow: 0,
        incomingTxCount: 0,
        outgoingTxCount: 0,
        sourceAddresses: new Set(),
        destinationAddresses: new Set(),
      });
    }

    const stats = destinationStats.get(to)!;
    stats.totalReceived += tx.amount;
    stats.incomingTxCount++;
    stats.sourceAddresses.add(tx.from.toLowerCase());
    stats.netFlow = stats.totalReceived - stats.totalSent;
  }

  // Sort by total received (highest first)
  return Array.from(destinationStats.values()).sort(
    (a, b) => b.totalReceived - a.totalReceived
  );
}

/**
 * Full flow analysis across all layers
 */
export function analyzeFlow(
  transactions: Transaction[],
  addressToLayer: Map<string, number>
): FlowAnalysisResult {
  const statsMap = buildAddressStats(transactions, addressToLayer);

  // Group by layer
  const layerBreakdown = new Map<number, LayerStats[]>();
  for (const stats of statsMap.values()) {
    const layer = stats.layer;
    if (!layerBreakdown.has(layer)) {
      layerBreakdown.set(layer, []);
    }
    layerBreakdown.get(layer)!.push(stats);
  }

  // Sort each layer by total received
  for (const [, addresses] of layerBreakdown) {
    addresses.sort((a, b) => b.totalReceived - a.totalReceived);
  }

  // Top destinations (by total volume received)
  const topDestinations = Array.from(statsMap.values())
    .filter((s) => s.totalReceived > 0)
    .sort((a, b) => b.totalReceived - a.totalReceived)
    .slice(0, 50);

  // Top consolidation points (by number of unique sources)
  const topConsolidationPoints = Array.from(statsMap.values())
    .filter((s) => s.sourceAddresses.size > 1)
    .sort((a, b) => b.sourceAddresses.size - a.sourceAddresses.size)
    .slice(0, 50);

  // Calculate summary
  const uniqueAddresses = new Set<string>();
  let totalVolume = 0;
  for (const tx of transactions) {
    uniqueAddresses.add(tx.from.toLowerCase());
    uniqueAddresses.add(tx.to.toLowerCase());
    totalVolume += tx.amount;
  }

  const maxLayer = Math.max(...Array.from(addressToLayer.values()), 0);

  return {
    layerBreakdown,
    topDestinations,
    topConsolidationPoints,
    summary: {
      totalTransactions: transactions.length,
      totalVolume,
      uniqueAddresses: uniqueAddresses.size,
      maxLayer,
    },
  };
}

/**
 * Get detailed consolidation analysis for a specific address
 */
export function getConsolidationDetails(
  address: string,
  transactions: Transaction[],
  addressToLayer: Map<string, number>
): ConsolidationAnalysis {
  const addr = address.toLowerCase();
  const sourceMap = new Map<string, { amount: number; txCount: number }>();

  const incomingTxs = transactions.filter((tx) => tx.to.toLowerCase() === addr);

  for (const tx of incomingTxs) {
    const from = tx.from.toLowerCase();
    if (!sourceMap.has(from)) {
      sourceMap.set(from, { amount: 0, txCount: 0 });
    }
    const source = sourceMap.get(from)!;
    source.amount += tx.amount;
    source.txCount++;
  }

  const receivedFrom = Array.from(sourceMap.entries())
    .map(([addr, data]) => ({
      address: addr,
      amount: data.amount,
      txCount: data.txCount,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    address: addr,
    layer: addressToLayer.get(addr) ?? -1,
    receivedFrom,
    totalReceived: receivedFrom.reduce((sum, s) => sum + s.amount, 0),
    sourceCount: receivedFrom.length,
  };
}

/**
 * Export analysis results to CSV format
 */
export function exportToCSV(
  stats: LayerStats[],
  filename: string = "flow_analysis.csv"
): string {
  const headers = [
    "Address",
    "Layer",
    "Total Received",
    "Total Sent",
    "Net Flow",
    "Incoming TX Count",
    "Outgoing TX Count",
    "Source Count",
    "Destination Count",
  ];

  const rows = stats.map((s) => [
    s.address,
    s.layer.toString(),
    s.totalReceived.toFixed(6),
    s.totalSent.toFixed(6),
    s.netFlow.toFixed(6),
    s.incomingTxCount.toString(),
    s.outgoingTxCount.toString(),
    s.sourceAddresses.size.toString(),
    s.destinationAddresses.size.toString(),
  ]);

  const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");

  // Trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return csvContent;
}
