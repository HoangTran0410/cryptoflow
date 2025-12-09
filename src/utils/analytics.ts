import {
  Transaction,
  AnalyticsSummary,
  DailyVolume,
  GraphData,
  Node,
  Link,
  TraceData,
  AddressFlowStats,
} from "../types";

export const parseCSV = (csvText: string): Transaction[] => {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim());

  const getIndex = (keys: string[]) =>
    headers.findIndex((h) => keys.some((k) => h.includes(k)));

  const idxDate = getIndex(["date", "time", "timestamp"]);
  const idxFrom = getIndex(["from", "sender", "source"]);
  const idxTo = getIndex(["to", "receiver", "destination"]);
  const idxAmount = getIndex(["amount", "value", "qty"]);
  const idxCurrency = getIndex(["currency", "coin", "symbol", "asset"]);
  const idxHash = getIndex(["hash", "id", "tx"]);

  if (idxDate === -1 || idxAmount === -1) {
    throw new Error("CSV must contain at least Date and Amount columns.");
  }

  return lines
    .slice(1)
    .map((line, index): Transaction | null => {
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < headers.length) return null;

      const dateStr = cols[idxDate];
      const amountStr = cols[idxAmount];

      // Attempt parsing
      const date = new Date(dateStr);
      const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ""));

      if (isNaN(date.getTime()) || isNaN(amount)) return null;

      return {
        id: idxHash !== -1 ? cols[idxHash] : `tx_${index}`,
        date,
        from: idxFrom !== -1 ? cols[idxFrom] : "Unknown",
        to: idxTo !== -1 ? cols[idxTo] : "Unknown",
        amount: Math.abs(amount),
        currency: idxCurrency !== -1 ? cols[idxCurrency] : "UNK",
        type: "transfer" as const,
      };
    })
    .filter((t): t is Transaction => t !== null);
};

export const calculateSummary = (
  transactions: Transaction[]
): AnalyticsSummary => {
  if (transactions.length === 0) {
    return {
      totalVolume: 0,
      transactionCount: 0,
      uniqueAddresses: 0,
      avgTransactionValue: 0,
      maxTransactionValue: 0,
      startDate: new Date(),
      endDate: new Date(),
      topAddress: "",
    };
  }

  const volume = transactions.reduce((sum, t) => sum + t.amount, 0);
  const addressVolume = new Map<string, number>();

  transactions.forEach((t) => {
    addressVolume.set(t.from, (addressVolume.get(t.from) || 0) + t.amount);
    addressVolume.set(t.to, (addressVolume.get(t.to) || 0) + t.amount);
  });

  let topAddress = "";
  let maxVol = 0;
  addressVolume.forEach((vol, addr) => {
    if (vol > maxVol) {
      maxVol = vol;
      topAddress = addr;
    }
  });

  const maxVal = Math.max(...transactions.map((t) => t.amount));
  const dates = transactions.map((t) => t.date.getTime());

  return {
    totalVolume: volume,
    transactionCount: transactions.length,
    uniqueAddresses: addressVolume.size,
    avgTransactionValue: volume / transactions.length,
    maxTransactionValue: maxVal,
    startDate: new Date(Math.min(...dates)),
    endDate: new Date(Math.max(...dates)),
    topAddress,
  };
};

export const getDailyVolume = (transactions: Transaction[]): DailyVolume[] => {
  const map = new Map<string, { volume: number; count: number }>();

  transactions.forEach((t) => {
    const dateKey = t.date.toISOString().split("T")[0];
    const prev = map.get(dateKey) || { volume: 0, count: 0 };
    map.set(dateKey, {
      volume: prev.volume + t.amount,
      count: prev.count + 1,
    });
  });

  return Array.from(map.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

// Generate Force Directed Graph Data (All Nodes)
export const generateGraphData = (
  transactions: Transaction[],
  limit = 300
): GraphData => {
  const nodesMap = new Map<string, Node>();
  const linkMap = new Map<string, Link>();

  // Activity calculation to limit nodes
  const activity = new Map<string, number>();
  transactions.forEach((t) => {
    activity.set(t.from, (activity.get(t.from) || 0) + t.amount); // Weigh by volume, not just count
    activity.set(t.to, (activity.get(t.to) || 0) + t.amount);
  });

  // Get Top N addresses by Volume (or all if limit is 0)
  const topAddresses = new Set(
    Array.from(activity.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit === 0 ? undefined : limit)
      .map((e) => e[0])
  );

  transactions.forEach((t) => {
    if (!topAddresses.has(t.from) || !topAddresses.has(t.to)) return;

    if (!nodesMap.has(t.from))
      nodesMap.set(t.from, {
        id: t.from,
        val: 0,
        type: "source",
        transactionCount: 0,
      });
    if (!nodesMap.has(t.to))
      nodesMap.set(t.to, {
        id: t.to,
        val: 0,
        type: "target",
        transactionCount: 0,
      });

    const source = nodesMap.get(t.from)!;
    const target = nodesMap.get(t.to)!;

    source.val += t.amount;
    target.val += t.amount;
    source.transactionCount = (source.transactionCount || 0) + 1;
    target.transactionCount = (target.transactionCount || 0) + 1;

    const linkId = `${t.from}-${t.to}`;
    if (linkMap.has(linkId)) {
      const l = linkMap.get(linkId)!;
      l.value += t.amount;
      l.count = (l.count || 0) + 1;
    } else {
      linkMap.set(linkId, {
        source: t.from,
        target: t.to,
        value: t.amount,
        count: 1,
      });
    }
  });

  return {
    nodes: Array.from(nodesMap.values()),
    links: Array.from(linkMap.values()),
  };
};

// Arkham-style Trace Data
export const getTraceData = (
  transactions: Transaction[],
  centerAddress: string
): TraceData => {
  const inflows = new Map<string, { val: number; count: number }>();
  const outflows = new Map<string, { val: number; count: number }>();

  let totalIn = 0;
  let totalOut = 0;
  let centerCount = 0;

  transactions.forEach((t) => {
    if (t.to === centerAddress) {
      const prev = inflows.get(t.from) || { val: 0, count: 0 };
      inflows.set(t.from, { val: prev.val + t.amount, count: prev.count + 1 });
      totalIn += t.amount;
      centerCount++;
    } else if (t.from === centerAddress) {
      const prev = outflows.get(t.to) || { val: 0, count: 0 };
      outflows.set(t.to, { val: prev.val + t.amount, count: prev.count + 1 });
      totalOut += t.amount;
      centerCount++;
    }
  });

  const mainNode: Node = {
    id: centerAddress,
    val: totalIn + totalOut,
    type: "main",
    transactionCount: centerCount,
  };

  const topInflows = Array.from(inflows.entries())
    .sort((a, b) => b[1].val - a[1].val)
    .slice(0, 8)
    .map(([id, data]) => ({
      id,
      val: data.val,
      type: "source" as const,
      transactionCount: data.count,
    }));

  const topOutflows = Array.from(outflows.entries())
    .sort((a, b) => b[1].val - a[1].val)
    .slice(0, 8)
    .map(([id, data]) => ({
      id,
      val: data.val,
      type: "target" as const,
      transactionCount: data.count,
    }));

  const links: Link[] = [
    ...topInflows.map((n) => ({
      source: n.id,
      target: centerAddress,
      value: n.val,
    })),
    ...topOutflows.map((n) => ({
      source: centerAddress,
      target: n.id,
      value: n.val,
    })),
  ];

  return {
    mainNode,
    inflowNodes: topInflows,
    outflowNodes: topOutflows,
    links,
  };
};

// Get Top Wallet Flows
export const getWalletFlowStats = (
  transactions: Transaction[]
): AddressFlowStats[] => {
  const stats = new Map<string, AddressFlowStats>();

  transactions.forEach((t) => {
    if (!stats.has(t.from))
      stats.set(t.from, {
        address: t.from,
        inflow: 0,
        outflow: 0,
        netFlow: 0,
        txCount: 0,
      });
    if (!stats.has(t.to))
      stats.set(t.to, {
        address: t.to,
        inflow: 0,
        outflow: 0,
        netFlow: 0,
        txCount: 0,
      });

    const sender = stats.get(t.from)!;
    const receiver = stats.get(t.to)!;

    sender.outflow += t.amount;
    sender.netFlow -= t.amount;
    sender.txCount += 1;

    receiver.inflow += t.amount;
    receiver.netFlow += t.amount;
    receiver.txCount += 1;
  });

  return Array.from(stats.values()).sort(
    (a, b) => b.inflow + b.outflow - (a.inflow + a.outflow)
  );
};

// Interactive Explorer Helper: Get Neighbors
export const getNeighbors = (
  transactions: Transaction[],
  nodeId: string
): { nodes: Node[]; links: Link[] } => {
  const neighbors = new Map<string, Node>();
  const links: Link[] = [];

  transactions.forEach((t) => {
    if (t.from === nodeId || t.to === nodeId) {
      const otherId = t.from === nodeId ? t.to : t.from;
      const type = t.from === nodeId ? "target" : "source";

      if (!neighbors.has(otherId)) {
        neighbors.set(otherId, {
          id: otherId,
          val: 0,
          type,
          transactionCount: 0,
        });
      }

      const n = neighbors.get(otherId)!;
      n.val += t.amount;
      n.transactionCount = (n.transactionCount || 0) + 1;

      links.push({ source: t.from, target: t.to, value: t.amount });
    }
  });

  // Add self
  const selfVal = links.reduce((acc, l) => acc + l.value, 0);
  const selfNode: Node = {
    id: nodeId,
    val: selfVal,
    type: "main",
    transactionCount: links.length,
  };

  return {
    nodes: [selfNode, ...Array.from(neighbors.values())],
    links,
  };
};

// ===== FORENSICS FUNCTIONS =====

import {
  DeepTraceConfig,
  DeepTraceResult,
  DeepTraceNode,
  DeepTraceEdge,
  PathFinderResult,
  TransactionPath,
  TaintFlow,
  TaintPath,
  SuspiciousPattern,
  AddressCluster,
  TimelineEvent,
} from '../types';

import {
  calculatePathSuspicion,
  detectCircularFlows,
  calculateAvgDelay,
  findCommonAmounts,
  calculateFeatureSimilarity,
  determineCommonBehavior,
  mode,
} from './helpers';

/**
 * Recursively trace transactions up to N hops from a starting address.
 * Uses BFS with cycle detection and amount filtering.
 */
export const getDeepTrace = (
  transactions: Transaction[],
  config: DeepTraceConfig
): DeepTraceResult => {
  const startTime = performance.now();
  const adjacencyMap = new Map<string, Transaction[]>();
  const reverseMap = new Map<string, Transaction[]>();

  transactions.forEach(tx => {
    if (!adjacencyMap.has(tx.from)) adjacencyMap.set(tx.from, []);
    if (!reverseMap.has(tx.to)) reverseMap.set(tx.to, []);
    adjacencyMap.get(tx.from)!.push(tx);
    reverseMap.get(tx.to)!.push(tx);
  });

  const nodes = new Map<string, DeepTraceNode>();
  const edges: DeepTraceEdge[] = [];
  const visited = new Set<string>();
  const queue: Array<{address: string, depth: number}> = [];

  queue.push({ address: config.startAddress, depth: 0 });
  visited.add(config.startAddress);

  nodes.set(config.startAddress, {
    address: config.startAddress,
    depth: 0,
    totalVolume: 0,
    transactionCount: 0,
    firstSeen: new Date(),
    lastSeen: new Date(),
  });

  while (queue.length > 0) {
    const { address, depth } = queue.shift()!;
    if (depth >= config.maxDepth) continue;

    let txList: Transaction[] = [];
    if (config.direction === 'inflow') {
      txList = reverseMap.get(address) || [];
    } else if (config.direction === 'outflow') {
      txList = adjacencyMap.get(address) || [];
    } else {
      txList = [...(adjacencyMap.get(address) || []), ...(reverseMap.get(address) || [])];
    }

    txList.forEach(tx => {
      if (config.minAmount && tx.amount < config.minAmount) return;
      if (config.timeWindow) {
        if (tx.date < config.timeWindow.start || tx.date > config.timeWindow.end) return;
      }

      const nextAddress = tx.from === address ? tx.to : tx.from;
      if (!config.includeCycles && visited.has(nextAddress)) return;

      if (!nodes.has(nextAddress)) {
        nodes.set(nextAddress, {
          address: nextAddress,
          depth: depth + 1,
          totalVolume: 0,
          transactionCount: 0,
          firstSeen: tx.date,
          lastSeen: tx.date,
        });
      }

      const node = nodes.get(nextAddress)!;
      node.totalVolume += tx.amount;
      node.transactionCount++;
      node.firstSeen = new Date(Math.min(node.firstSeen.getTime(), tx.date.getTime()));
      node.lastSeen = new Date(Math.max(node.lastSeen.getTime(), tx.date.getTime()));

      const existingEdge = edges.find(e => e.from === tx.from && e.to === tx.to);
      if (existingEdge) {
        existingEdge.amount += tx.amount;
        existingEdge.count++;
        existingEdge.lastTx = new Date(Math.max(existingEdge.lastTx.getTime(), tx.date.getTime()));
      } else {
        edges.push({
          from: tx.from,
          to: tx.to,
          amount: tx.amount,
          count: 1,
          firstTx: tx.date,
          lastTx: tx.date,
        });
      }

      if (!visited.has(nextAddress) && depth + 1 < config.maxDepth) {
        visited.add(nextAddress);
        queue.push({ address: nextAddress, depth: depth + 1 });
      }
    });
  }

  return {
    config,
    nodes,
    edges,
    paths: [],
    statistics: {
      totalNodes: nodes.size,
      totalEdges: edges.length,
      maxDepth: Math.max(...Array.from(nodes.values()).map(n => n.depth), 0),
      executionTime: performance.now() - startTime,
    },
  };
};

/**
 * Find all paths connecting source to target using DFS with backtracking.
 */
export const findPathsBetween = (
  transactions: Transaction[],
  source: string,
  target: string,
  maxDepth: number = 10,
  maxPaths: number = 100
): PathFinderResult => {
  const startTime = performance.now();
  const adjacencyMap = new Map<string, Array<{tx: Transaction, to: string}>>();
  
  transactions.forEach(tx => {
    if (!adjacencyMap.has(tx.from)) adjacencyMap.set(tx.from, []);
    adjacencyMap.get(tx.from)!.push({ tx, to: tx.to });
  });

  const paths: TransactionPath[] = [];

  const dfs = (
    current: string,
    visited: Set<string>,
    pathAddresses: string[],
    pathTxs: Transaction[],
    depth: number
  ) => {
    if (paths.length >= maxPaths) return;
    if (depth > maxDepth) return;

    if (current === target) {
      const totalAmount = pathTxs.reduce((sum, tx) => sum + tx.amount, 0);
      const dates = pathTxs.map(tx => tx.date.getTime()).sort((a, b) => a - b);
      const delays = dates.slice(1).map((d, i) => d - dates[i]);

      paths.push({
        addresses: [...pathAddresses, current],
        transactions: [...pathTxs],
        totalAmount,
        hops: pathTxs.length,
        startDate: new Date(dates[0]),
        endDate: new Date(dates[dates.length - 1]),
        avgDelay: delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0,
        suspicionScore: calculatePathSuspicion(pathTxs),
      });
      return;
    }

    const neighbors = adjacencyMap.get(current) || [];
    for (const { tx, to } of neighbors) {
      if (!visited.has(to)) {
        visited.add(to);
        dfs(to, visited, [...pathAddresses, current], [...pathTxs, tx], depth + 1);
        visited.delete(to);
      }
    }
  };

  const visited = new Set<string>([source]);
  dfs(source, visited, [], [], 0);

  const shortestPath = paths.length > 0
    ? paths.reduce((min, p) => p.hops < min.hops ? p : min, paths[0])
    : null;

  return {
    source,
    target,
    paths,
    shortestPath,
    statistics: {
      totalPathsFound: paths.length,
      avgPathLength: paths.length > 0
        ? paths.reduce((sum, p) => sum + p.hops, 0) / paths.length
        : 0,
      executionTime: performance.now() - startTime,
    },
  };
};

/**
 * Track what percentage of funds from sourceAddress reached targetAddress.
 */
export const getTaintAnalysis = (
  transactions: Transaction[],
  sourceAddress: string,
  targetAddress: string,
  maxHops: number = 10
): TaintFlow => {
  const pathResult = findPathsBetween(transactions, sourceAddress, targetAddress, maxHops, 1000);
  const taintPaths: TaintPath[] = [];
  let totalTainted = 0;

  pathResult.paths.forEach(path => {
    let taintAmount = path.transactions[0].amount;

    for (let i = 0; i < path.transactions.length; i++) {
      const tx = path.transactions[i];
      const sender = tx.from;

      const senderOutflows = transactions.filter(t =>
        t.from === sender &&
        t.date >= tx.date &&
        t.date <= new Date(tx.date.getTime() + 24 * 60 * 60 * 1000)
      );

      const totalOutflow = senderOutflows.reduce((sum, t) => sum + t.amount, 0);
      if (totalOutflow > 0) {
        taintAmount *= (tx.amount / totalOutflow);
      }
    }

    if (taintAmount > 0.01) {
      taintPaths.push({
        path: path.addresses,
        amount: taintAmount,
        percentage: (taintAmount / path.transactions[0].amount) * 100,
      });
      totalTainted += taintAmount;
    }
  });

  const targetInflows = transactions.filter(tx => tx.to === targetAddress);
  const targetTotalInflow = targetInflows.reduce((sum, tx) => sum + tx.amount, 0);
  const taintPercentage = targetTotalInflow > 0
    ? (totalTainted / targetTotalInflow) * 100
    : 0;

  return {
    sourceAddress,
    targetAddress,
    totalTainted,
    taintPercentage,
    paths: taintPaths.sort((a, b) => b.amount - a.amount).slice(0, 20),
    hops: maxHops,
  };
};

/**
 * Detect various laundering and suspicious patterns.
 */
export const detectPatterns = (
  transactions: Transaction[]
): SuspiciousPattern[] => {
  const patterns: SuspiciousPattern[] = [];

  const roundAmountTxs = transactions.filter(tx => {
    const amount = tx.amount;
    return amount >= 1000 && amount % 1000 === 0;
  });

  if (roundAmountTxs.length > transactions.length * 0.3) {
    const affectedAddresses = new Set<string>();
    roundAmountTxs.forEach(tx => {
      affectedAddresses.add(tx.from);
      affectedAddresses.add(tx.to);
    });

    patterns.push({
      type: 'round_amounts',
      severity: roundAmountTxs.length > transactions.length * 0.5 ? 'high' : 'medium',
      score: Math.min((roundAmountTxs.length / transactions.length) * 100, 100),
      affectedAddresses: Array.from(affectedAddresses),
      transactions: roundAmountTxs.slice(0, 100),
      description: `${roundAmountTxs.length} transactions with round amounts detected`,
      metadata: {
        roundRatio: roundAmountTxs.length / transactions.length,
        commonAmounts: Array.from(findCommonAmounts(roundAmountTxs).entries()).slice(0, 5),
      },
    });
  }

  const addressActivity = new Map<string, Transaction[]>();
  transactions.forEach(tx => {
    if (!addressActivity.has(tx.from)) addressActivity.set(tx.from, []);
    addressActivity.get(tx.from)!.push(tx);
  });

  const rapidAddresses: string[] = [];
  addressActivity.forEach((txs, address) => {
    const sortedTxs = txs.sort((a, b) => a.date.getTime() - b.date.getTime());
    let rapidCount = 0;
    for (let i = 1; i < sortedTxs.length; i++) {
      const timeDiff = sortedTxs[i].date.getTime() - sortedTxs[i-1].date.getTime();
      if (timeDiff < 60 * 1000) rapidCount++;
    }
    if (rapidCount > 5) rapidAddresses.push(address);
  });

  if (rapidAddresses.length > 0) {
    const rapidTxs = transactions.filter(tx => rapidAddresses.includes(tx.from));
    patterns.push({
      type: 'rapid_transfers',
      severity: 'high',
      score: Math.min(rapidAddresses.length * 10, 100),
      affectedAddresses: rapidAddresses,
      transactions: rapidTxs.slice(0, 100),
      description: `${rapidAddresses.length} addresses with rapid consecutive transfers`,
      metadata: { addressCount: rapidAddresses.length, avgTimeBetween: 'Less than 1 minute' },
    });
  }

  const circularFlows = detectCircularFlows(transactions);
  if (circularFlows.length > 0) {
    const cycleAddresses = new Set<string>(circularFlows.flat());
    patterns.push({
      type: 'circular_flow',
      severity: 'critical',
      score: 90,
      affectedAddresses: Array.from(cycleAddresses),
      transactions: transactions.filter(tx =>
        circularFlows.some(cycle => cycle.includes(tx.from) && cycle.includes(tx.to))
      ).slice(0, 100),
      description: `${circularFlows.length} circular flow pattern(s) detected`,
      metadata: { cycles: circularFlows.map(c => c.join(' → ')), cycleCount: circularFlows.length },
    });
  }

  const layeringAddresses: string[] = [];
  addressActivity.forEach((txs, address) => {
    const inflow = transactions.filter(tx => tx.to === address).reduce((sum, tx) => sum + tx.amount, 0);
    const outflow = txs.reduce((sum, tx) => sum + tx.amount, 0);
    if (inflow === 0 || outflow === 0) return;

    const flowRatio = Math.min(inflow, outflow) / Math.max(inflow, outflow);
    const avgDelay = calculateAvgDelay(transactions, address);
    if (flowRatio > 0.9 && avgDelay < 2 * 60 * 60 * 1000 && txs.length > 5) {
      layeringAddresses.push(address);
    }
  });

  if (layeringAddresses.length > 0) {
    patterns.push({
      type: 'layering',
      severity: 'high',
      score: 85,
      affectedAddresses: layeringAddresses,
      transactions: transactions.filter(tx =>
        layeringAddresses.includes(tx.from) || layeringAddresses.includes(tx.to)
      ).slice(0, 100),
      description: `${layeringAddresses.length} potential layering intermediary address(es)`,
      metadata: { intermediaryCount: layeringAddresses.length, avgTurnaround: '< 2 hours' },
    });
  }

  const mixerKeywords = ['tornado', 'mixer', 'tumbler', 'cash', 'blur', 'cyclone'];
  const mixerTxs = transactions.filter(tx =>
    mixerKeywords.some(kw => tx.from.toLowerCase().includes(kw) || tx.to.toLowerCase().includes(kw))
  );

  if (mixerTxs.length > 0) {
    const affectedAddresses = new Set<string>();
    mixerTxs.forEach(tx => {
      affectedAddresses.add(tx.from);
      affectedAddresses.add(tx.to);
    });

    patterns.push({
      type: 'mixer_usage',
      severity: 'critical',
      score: 95,
      affectedAddresses: Array.from(affectedAddresses),
      transactions: mixerTxs,
      description: `${mixerTxs.length} transaction(s) involving mixing/tumbler services`,
      metadata: {
        totalVolume: mixerTxs.reduce((sum, tx) => sum + tx.amount, 0),
        mixerAddresses: Array.from(affectedAddresses).filter(addr =>
          mixerKeywords.some(kw => addr.toLowerCase().includes(kw))
        ),
      },
    });
  }

  const highVelocityAddresses: string[] = [];
  addressActivity.forEach((txs, address) => {
    if (txs.length < 20) return;
    const sortedTxs = txs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const timeSpan = sortedTxs[sortedTxs.length - 1].date.getTime() - sortedTxs[0].date.getTime();
    const daysSpan = timeSpan / (1000 * 60 * 60 * 24);
    if (daysSpan > 0 && (txs.length / daysSpan) > 10) {
      highVelocityAddresses.push(address);
    }
  });

  if (highVelocityAddresses.length > 0) {
    const velocityTxs = transactions.filter(tx => highVelocityAddresses.includes(tx.from));
    patterns.push({
      type: 'high_velocity',
      severity: 'medium',
      score: 70,
      affectedAddresses: highVelocityAddresses,
      transactions: velocityTxs.slice(0, 100),
      description: `${highVelocityAddresses.length} address(es) with high transaction velocity`,
      metadata: { addressCount: highVelocityAddresses.length, avgTxPerDay: '> 10' },
    });
  }

  return patterns.sort((a, b) => b.score - a.score);
};

/**
 * Identify related wallets using behavioral clustering.
 */
export const getAddressClusters = (
  transactions: Transaction[]
): AddressCluster[] => {
  const addressFeatures = new Map<string, any>();
  const allAddresses = new Set<string>();

  transactions.forEach(tx => {
    allAddresses.add(tx.from);
    allAddresses.add(tx.to);
  });

  allAddresses.forEach(address => {
    const sent = transactions.filter(tx => tx.from === address);
    const received = transactions.filter(tx => tx.to === address);
    const sentAmounts = sent.map(tx => tx.amount);
    const sentTimes = sent.map(tx => tx.date.getHours());

    const counterparties = new Set<string>();
    sent.forEach(tx => counterparties.add(tx.to));
    received.forEach(tx => counterparties.add(tx.from));

    const roundAmounts = sentAmounts.filter(amt => amt >= 1000 && amt % 1000 === 0);

    addressFeatures.set(address, {
      avgTransactionSize: sentAmounts.length > 0
        ? sentAmounts.reduce((a, b) => a + b, 0) / sentAmounts.length : 0,
      peakActivityHour: sentTimes.length > 0 ? mode(sentTimes) : 0,
      primaryCounterparties: Array.from(counterparties).slice(0, 5),
      roundAmountRatio: sentAmounts.length > 0 ? roundAmounts.length / sentAmounts.length : 0,
      txCount: sent.length + received.length,
    });
  });

  const clusters = new Map<string, string[]>();
  let clusterId = 0;
  const processed = new Set<string>();

  allAddresses.forEach(address1 => {
    if (processed.has(address1)) return;
    const cluster: string[] = [address1];
    processed.add(address1);

    allAddresses.forEach(address2 => {
      if (processed.has(address2)) return;
      const similarity = calculateFeatureSimilarity(
        addressFeatures.get(address1)!,
        addressFeatures.get(address2)!
      );
      if (similarity > 0.7) {
        cluster.push(address2);
        processed.add(address2);
      }
    });

    if (cluster.length > 1) {
      clusters.set(`cluster_${clusterId++}`, cluster);
    }
  });

  const result: AddressCluster[] = [];
  clusters.forEach((addresses, id) => {
    const clusterTxs = transactions.filter(tx =>
      addresses.includes(tx.from) || addresses.includes(tx.to)
    );
    const totalVolume = clusterTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const features = addressFeatures.get(addresses[0])!;

    result.push({
      clusterId: id,
      addresses,
      commonBehavior: determineCommonBehavior(features),
      totalVolume,
      transactionCount: clusterTxs.length,
      confidenceScore: 0.8,
      features,
    });
  });

  return result.sort((a, b) => b.addresses.length - a.addresses.length);
};

/**
 * Generate chronological timeline of significant events for an address.
 */
export const getTransactionTimeline = (
  transactions: Transaction[],
  address: string
): TimelineEvent[] => {
  const events: TimelineEvent[] = [];

  const relevantTxs = transactions
    .filter(tx => tx.from === address || tx.to === address)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (relevantTxs.length === 0) return events;

  const dailyGroups = new Map<string, Transaction[]>();
  relevantTxs.forEach(tx => {
    const dateKey = tx.date.toISOString().split('T')[0];
    if (!dailyGroups.has(dateKey)) dailyGroups.set(dateKey, []);
    dailyGroups.get(dateKey)!.push(tx);
  });

  dailyGroups.forEach((txs, dateKey) => {
    const totalAmount = txs.reduce((sum, tx) => sum + tx.amount, 0);
    let eventType: TimelineEvent['type'] = 'transfer';
    let significance = 0.5;

    if (txs.length > 10) {
      eventType = 'spike';
      significance = Math.min(txs.length / 50, 1);
    }

    const inflows = txs.filter(tx => tx.to === address);
    const outflows = txs.filter(tx => tx.from === address);

    if (inflows.length > 5 && outflows.length <= 1) {
      eventType = 'aggregation';
      significance = 0.8;
    } else if (inflows.length <= 1 && outflows.length > 5) {
      eventType = 'split';
      significance = 0.8;
    }

    events.push({
      timestamp: new Date(dateKey),
      type: eventType,
      address,
      amount: totalAmount,
      relatedAddresses: Array.from(new Set(txs.map(tx =>
        tx.from === address ? tx.to : tx.from
      ))),
      significance,
    });
  });

  const sortedEvents = events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const dormantEvents: TimelineEvent[] = [];

  for (let i = 1; i < sortedEvents.length; i++) {
    const gap = sortedEvents[i].timestamp.getTime() - sortedEvents[i-1].timestamp.getTime();
    const dayGap = gap / (1000 * 60 * 60 * 24);
    if (dayGap > 7) {
      dormantEvents.push({
        timestamp: new Date(sortedEvents[i-1].timestamp.getTime() + gap / 2),
        type: 'dormant',
        address,
        amount: 0,
        relatedAddresses: [],
        significance: Math.min(dayGap / 30, 1),
      });
    }
  }

  return [...events, ...dormantEvents].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
};
