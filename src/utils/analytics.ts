import {
  Transaction,
  AnalyticsSummary,
  DailyVolume,
  GraphData,
  Node,
  Link,
  TraceData,
} from "../types";

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
} from "../types";

/**
 * Calculate statistical mode (most frequent value) in an array
 */
export const mode = (arr: number[]): number => {
  if (arr.length === 0) return 0;

  const frequency = new Map<number, number>();
  arr.forEach((val) => {
    frequency.set(val, (frequency.get(val) || 0) + 1);
  });

  let maxFreq = 0;
  let modeValue = arr[0];

  frequency.forEach((freq, val) => {
    if (freq > maxFreq) {
      maxFreq = freq;
      modeValue = val;
    }
  });

  return modeValue;
};

/**
 * Calculate cosine similarity between two feature vectors
 * Used for address clustering
 */
export const calculateFeatureSimilarity = (
  features1: any,
  features2: any
): number => {
  // Extract comparable numeric features
  const f1 = {
    avgTxSize: features1.avgTransactionSize || 0,
    peakHour: features1.peakActivityHour || 0,
    roundRatio: features1.roundAmountRatio || 0,
    txCount: features1.txCount || 0,
  };

  const f2 = {
    avgTxSize: features2.avgTransactionSize || 0,
    peakHour: features2.peakActivityHour || 0,
    roundRatio: features2.roundAmountRatio || 0,
    txCount: features2.txCount || 0,
  };

  // Normalize values to 0-1 range for fair comparison
  const maxTxSize = Math.max(f1.avgTxSize, f2.avgTxSize) || 1;
  const maxTxCount = Math.max(f1.txCount, f2.txCount) || 1;

  const v1 = [
    f1.avgTxSize / maxTxSize,
    f1.peakHour / 24,
    f1.roundRatio,
    f1.txCount / maxTxCount,
  ];

  const v2 = [
    f2.avgTxSize / maxTxSize,
    f2.peakHour / 24,
    f2.roundRatio,
    f2.txCount / maxTxCount,
  ];

  // Calculate cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
};

/**
 * Detect circular flows (cycles) in transaction graph using DFS
 * Returns array of detected cycles (each cycle is an array of addresses)
 */
export const detectCircularFlows = (
  transactions: Transaction[]
): string[][] => {
  // Build adjacency list
  const graph = new Map<string, string[]>();
  transactions.forEach((tx) => {
    if (!graph.has(tx.from)) graph.set(tx.from, []);
    graph.get(tx.from)!.push(tx.to);
  });

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const currentPath: string[] = [];

  const dfs = (node: string) => {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycle = currentPath.slice(cycleStartIndex);
          // Only keep cycles of length 3+ to avoid trivial back-and-forth
          if (cycle.length >= 3 && cycles.length < 10) {
            // Limit to 10 cycles
            cycles.push([...cycle, neighbor]); // Close the cycle
          }
        }
      }
    }

    currentPath.pop();
    recursionStack.delete(node);
  };

  // Run DFS from each unvisited node
  graph.forEach((_, node) => {
    if (!visited.has(node) && cycles.length < 10) {
      dfs(node);
    }
  });

  return cycles;
};

/**
 * Calculate suspicion score for a transaction path
 * Considers multiple factors: round amounts, rapid transfers, layering
 */
export const calculatePathSuspicion = (transactions: Transaction[]): number => {
  if (transactions.length === 0) return 0;

  let score = 0;
  let factors = 0;

  // Factor 1: Round amounts (0-30 points)
  const roundAmounts = transactions.filter((tx) => {
    const amount = tx.amount;
    return amount >= 1000 && amount % 1000 === 0;
  });
  const roundRatio = roundAmounts.length / transactions.length;
  score += roundRatio * 30;
  factors++;

  // Factor 2: Rapid transfers (0-30 points)
  const sortedTxs = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  let rapidTransfers = 0;
  for (let i = 1; i < sortedTxs.length; i++) {
    const timeDiff =
      sortedTxs[i].date.getTime() - sortedTxs[i - 1].date.getTime();
    if (timeDiff < 5 * 60 * 1000) {
      // < 5 minutes
      rapidTransfers++;
    }
  }
  if (sortedTxs.length > 1) {
    score += (rapidTransfers / (sortedTxs.length - 1)) * 30;
    factors++;
  }

  // Factor 3: Path length (0-20 points) - longer paths are more suspicious
  const pathLengthScore = Math.min(transactions.length * 3, 20);
  score += pathLengthScore;
  factors++;

  // Factor 4: Amount consistency (0-20 points) - very similar amounts are suspicious
  if (transactions.length > 1) {
    const amounts = transactions.map((tx) => tx.amount);
    const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avg > 0 ? stdDev / avg : 1;

    // Low variation (< 0.1) is suspicious
    if (coefficientOfVariation < 0.1) {
      score += 20;
    } else if (coefficientOfVariation < 0.3) {
      score += 10;
    }
    factors++;
  }

  return Math.min(score, 100);
};

/**
 * Calculate average delay between transactions for an address
 * Returns average time in milliseconds
 */
export const calculateAvgDelay = (
  transactions: Transaction[],
  address: string
): number => {
  const relevantTxs = transactions
    .filter((tx) => tx.from === address)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (relevantTxs.length < 2) return 0;

  const delays: number[] = [];
  for (let i = 1; i < relevantTxs.length; i++) {
    delays.push(
      relevantTxs[i].date.getTime() - relevantTxs[i - 1].date.getTime()
    );
  }

  return delays.reduce((sum, d) => sum + d, 0) / delays.length;
};

/**
 * Find most common transaction amounts
 * Returns map of amount → frequency
 */
export const findCommonAmounts = (
  transactions: Transaction[]
): Map<number, number> => {
  const frequency = new Map<number, number>();

  transactions.forEach((tx) => {
    const roundedAmount = Math.round(tx.amount);
    frequency.set(roundedAmount, (frequency.get(roundedAmount) || 0) + 1);
  });

  // Sort by frequency and return top 10
  const sorted = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return new Map(sorted);
};

/**
 * Determine common behavior description for a cluster
 * Based on cluster features
 */
export const determineCommonBehavior = (features: any): string => {
  const behaviors: string[] = [];

  // Check round amount behavior
  if (features.roundAmountRatio > 0.5) {
    behaviors.push("frequent round-amount transactions");
  }

  // Check activity timing
  const hour = features.peakActivityHour;
  if (hour >= 0 && hour < 6) {
    behaviors.push("late-night activity");
  } else if (hour >= 9 && hour < 17) {
    behaviors.push("business-hours activity");
  }

  // Check transaction size
  if (features.avgTransactionSize > 10000) {
    behaviors.push("high-value transactions");
  } else if (features.avgTransactionSize < 100) {
    behaviors.push("micro-transactions");
  }

  // Check transaction frequency
  if (features.txCount > 100) {
    behaviors.push("high transaction volume");
  }

  return behaviors.length > 0
    ? behaviors.join(", ")
    : "standard transaction behavior";
};

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

  transactions.forEach((tx) => {
    if (!adjacencyMap.has(tx.from)) adjacencyMap.set(tx.from, []);
    if (!reverseMap.has(tx.to)) reverseMap.set(tx.to, []);
    adjacencyMap.get(tx.from)!.push(tx);
    reverseMap.get(tx.to)!.push(tx);
  });

  const nodes = new Map<string, DeepTraceNode>();
  const edges: DeepTraceEdge[] = [];
  const visited = new Set<string>();
  const queue: Array<{ address: string; depth: number }> = [];

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
    if (config.direction === "inflow") {
      txList = reverseMap.get(address) || [];
    } else if (config.direction === "outflow") {
      txList = adjacencyMap.get(address) || [];
    } else {
      txList = [
        ...(adjacencyMap.get(address) || []),
        ...(reverseMap.get(address) || []),
      ];
    }

    txList.forEach((tx) => {
      if (config.minAmount && tx.amount < config.minAmount) return;
      if (config.timeWindow) {
        if (
          tx.date < config.timeWindow.start ||
          tx.date > config.timeWindow.end
        )
          return;
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
      node.firstSeen = new Date(
        Math.min(node.firstSeen.getTime(), tx.date.getTime())
      );
      node.lastSeen = new Date(
        Math.max(node.lastSeen.getTime(), tx.date.getTime())
      );

      const existingEdge = edges.find(
        (e) => e.from === tx.from && e.to === tx.to
      );
      if (existingEdge) {
        existingEdge.amount += tx.amount;
        existingEdge.count++;
        existingEdge.lastTx = new Date(
          Math.max(existingEdge.lastTx.getTime(), tx.date.getTime())
        );
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
      maxDepth: Math.max(...Array.from(nodes.values()).map((n) => n.depth), 0),
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
  const adjacencyMap = new Map<
    string,
    Array<{ tx: Transaction; to: string }>
  >();

  transactions.forEach((tx) => {
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
      const dates = pathTxs
        .map((tx) => tx.date.getTime())
        .sort((a, b) => a - b);
      const delays = dates.slice(1).map((d, i) => d - dates[i]);

      paths.push({
        addresses: [...pathAddresses, current],
        transactions: [...pathTxs],
        totalAmount,
        hops: pathTxs.length,
        startDate: new Date(dates[0]),
        endDate: new Date(dates[dates.length - 1]),
        avgDelay:
          delays.length > 0
            ? delays.reduce((a, b) => a + b, 0) / delays.length
            : 0,
        suspicionScore: calculatePathSuspicion(pathTxs),
      });
      return;
    }

    const neighbors = adjacencyMap.get(current) || [];
    for (const { tx, to } of neighbors) {
      if (!visited.has(to)) {
        visited.add(to);
        dfs(
          to,
          visited,
          [...pathAddresses, current],
          [...pathTxs, tx],
          depth + 1
        );
        visited.delete(to);
      }
    }
  };

  const visited = new Set<string>([source]);
  dfs(source, visited, [], [], 0);

  const shortestPath =
    paths.length > 0
      ? paths.reduce((min, p) => (p.hops < min.hops ? p : min), paths[0])
      : null;

  return {
    source,
    target,
    paths,
    shortestPath,
    statistics: {
      totalPathsFound: paths.length,
      avgPathLength:
        paths.length > 0
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
  const pathResult = findPathsBetween(
    transactions,
    sourceAddress,
    targetAddress,
    maxHops,
    1000
  );
  const taintPaths: TaintPath[] = [];
  let totalTainted = 0;

  pathResult.paths.forEach((path) => {
    if (path.transactions.length === 0) return;

    let taintAmount = path.transactions[0].amount;

    for (let i = 0; i < path.transactions.length; i++) {
      const tx = path.transactions[i];
      const sender = tx.from;

      const senderOutflows = transactions.filter(
        (t) =>
          t.from === sender &&
          t.date >= tx.date &&
          t.date <= new Date(tx.date.getTime() + 24 * 60 * 60 * 1000)
      );

      const totalOutflow = senderOutflows.reduce((sum, t) => sum + t.amount, 0);
      if (totalOutflow > 0) {
        taintAmount *= tx.amount / totalOutflow;
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

  const targetInflows = transactions.filter((tx) => tx.to === targetAddress);
  const targetTotalInflow = targetInflows.reduce(
    (sum, tx) => sum + tx.amount,
    0
  );
  const taintPercentage =
    targetTotalInflow > 0 ? (totalTainted / targetTotalInflow) * 100 : 0;

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

  const roundAmountTxs = transactions.filter((tx) => {
    const amount = tx.amount;
    return amount >= 1000 && amount % 1000 === 0;
  });

  if (roundAmountTxs.length > transactions.length * 0.3) {
    const affectedAddresses = new Set<string>();
    roundAmountTxs.forEach((tx) => {
      affectedAddresses.add(tx.from);
      affectedAddresses.add(tx.to);
    });

    patterns.push({
      type: "round_amounts",
      severity:
        roundAmountTxs.length > transactions.length * 0.5 ? "high" : "medium",
      score: Math.min((roundAmountTxs.length / transactions.length) * 100, 100),
      affectedAddresses: Array.from(affectedAddresses),
      transactions: roundAmountTxs.slice(0, 100),
      description: `${roundAmountTxs.length} transactions with round amounts detected`,
      metadata: {
        roundRatio: roundAmountTxs.length / transactions.length,
        commonAmounts: Array.from(
          findCommonAmounts(roundAmountTxs).entries()
        ).slice(0, 5),
      },
    });
  }

  const addressActivity = new Map<string, Transaction[]>();
  transactions.forEach((tx) => {
    if (!addressActivity.has(tx.from)) addressActivity.set(tx.from, []);
    addressActivity.get(tx.from)!.push(tx);
  });

  const rapidAddresses: string[] = [];
  addressActivity.forEach((txs, address) => {
    const sortedTxs = txs.sort((a, b) => a.date.getTime() - b.date.getTime());
    let rapidCount = 0;
    for (let i = 1; i < sortedTxs.length; i++) {
      const timeDiff =
        sortedTxs[i].date.getTime() - sortedTxs[i - 1].date.getTime();
      if (timeDiff < 60 * 1000) rapidCount++;
    }
    if (rapidCount > 5) rapidAddresses.push(address);
  });

  if (rapidAddresses.length > 0) {
    const rapidTxs = transactions.filter((tx) =>
      rapidAddresses.includes(tx.from)
    );
    patterns.push({
      type: "rapid_transfers",
      severity: "high",
      score: Math.min(rapidAddresses.length * 10, 100),
      affectedAddresses: rapidAddresses,
      transactions: rapidTxs.slice(0, 100),
      description: `${rapidAddresses.length} addresses with rapid consecutive transfers`,
      metadata: {
        addressCount: rapidAddresses.length,
        avgTimeBetween: "Less than 1 minute",
      },
    });
  }

  const circularFlows = detectCircularFlows(transactions);
  if (circularFlows.length > 0) {
    const cycleAddresses = new Set<string>(circularFlows.flat());
    patterns.push({
      type: "circular_flow",
      severity: "critical",
      score: 90,
      affectedAddresses: Array.from(cycleAddresses),
      transactions: transactions
        .filter((tx) =>
          circularFlows.some(
            (cycle) => cycle.includes(tx.from) && cycle.includes(tx.to)
          )
        )
        .slice(0, 100),
      description: `${circularFlows.length} circular flow pattern(s) detected`,
      metadata: {
        cycles: circularFlows.map((c) => c.join(" → ")),
        cycleCount: circularFlows.length,
      },
    });
  }

  const layeringAddresses: string[] = [];
  addressActivity.forEach((txs, address) => {
    const inflow = transactions
      .filter((tx) => tx.to === address)
      .reduce((sum, tx) => sum + tx.amount, 0);
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
      type: "layering",
      severity: "high",
      score: 85,
      affectedAddresses: layeringAddresses,
      transactions: transactions
        .filter(
          (tx) =>
            layeringAddresses.includes(tx.from) ||
            layeringAddresses.includes(tx.to)
        )
        .slice(0, 100),
      description: `${layeringAddresses.length} potential layering intermediary address(es)`,
      metadata: {
        intermediaryCount: layeringAddresses.length,
        avgTurnaround: "< 2 hours",
      },
    });
  }

  const mixerKeywords = [
    "tornado",
    "mixer",
    "tumbler",
    "cash",
    "blur",
    "cyclone",
  ];
  const mixerTxs = transactions.filter((tx) =>
    mixerKeywords.some(
      (kw) =>
        tx.from.toLowerCase().includes(kw) || tx.to.toLowerCase().includes(kw)
    )
  );

  if (mixerTxs.length > 0) {
    const affectedAddresses = new Set<string>();
    mixerTxs.forEach((tx) => {
      affectedAddresses.add(tx.from);
      affectedAddresses.add(tx.to);
    });

    patterns.push({
      type: "mixer_usage",
      severity: "critical",
      score: 95,
      affectedAddresses: Array.from(affectedAddresses),
      transactions: mixerTxs,
      description: `${mixerTxs.length} transaction(s) involving mixing/tumbler services`,
      metadata: {
        totalVolume: mixerTxs.reduce((sum, tx) => sum + tx.amount, 0),
        mixerAddresses: Array.from(affectedAddresses).filter((addr) =>
          mixerKeywords.some((kw) => addr.toLowerCase().includes(kw))
        ),
      },
    });
  }

  const highVelocityAddresses: string[] = [];
  addressActivity.forEach((txs, address) => {
    if (txs.length < 20) return;
    const sortedTxs = txs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const timeSpan =
      sortedTxs[sortedTxs.length - 1].date.getTime() -
      sortedTxs[0].date.getTime();
    const daysSpan = timeSpan / (1000 * 60 * 60 * 24);
    if (daysSpan > 0 && txs.length / daysSpan > 10) {
      highVelocityAddresses.push(address);
    }
  });

  if (highVelocityAddresses.length > 0) {
    const velocityTxs = transactions.filter((tx) =>
      highVelocityAddresses.includes(tx.from)
    );
    patterns.push({
      type: "high_velocity",
      severity: "medium",
      score: 70,
      affectedAddresses: highVelocityAddresses,
      transactions: velocityTxs.slice(0, 100),
      description: `${highVelocityAddresses.length} address(es) with high transaction velocity`,
      metadata: {
        addressCount: highVelocityAddresses.length,
        avgTxPerDay: "> 10",
      },
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

  transactions.forEach((tx) => {
    allAddresses.add(tx.from);
    allAddresses.add(tx.to);
  });

  allAddresses.forEach((address) => {
    const sent = transactions.filter((tx) => tx.from === address);
    const received = transactions.filter((tx) => tx.to === address);
    const sentAmounts = sent.map((tx) => tx.amount);
    const sentTimes = sent.map((tx) => tx.date.getHours());

    const counterparties = new Set<string>();
    sent.forEach((tx) => counterparties.add(tx.to));
    received.forEach((tx) => counterparties.add(tx.from));

    const roundAmounts = sentAmounts.filter(
      (amt) => amt >= 1000 && amt % 1000 === 0
    );

    addressFeatures.set(address, {
      avgTransactionSize:
        sentAmounts.length > 0
          ? sentAmounts.reduce((a, b) => a + b, 0) / sentAmounts.length
          : 0,
      peakActivityHour: sentTimes.length > 0 ? mode(sentTimes) : 0,
      primaryCounterparties: Array.from(counterparties).slice(0, 5),
      roundAmountRatio:
        sentAmounts.length > 0 ? roundAmounts.length / sentAmounts.length : 0,
      txCount: sent.length + received.length,
    });
  });

  const clusters = new Map<string, string[]>();
  let clusterId = 0;
  const processed = new Set<string>();

  allAddresses.forEach((address1) => {
    if (processed.has(address1)) return;
    const cluster: string[] = [address1];
    processed.add(address1);

    allAddresses.forEach((address2) => {
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
    const clusterTxs = transactions.filter(
      (tx) => addresses.includes(tx.from) || addresses.includes(tx.to)
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
    .filter((tx) => tx.from === address || tx.to === address)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (relevantTxs.length === 0) return events;

  const dailyGroups = new Map<string, Transaction[]>();
  relevantTxs.forEach((tx) => {
    const dateKey = tx.date.toISOString().split("T")[0];
    if (!dailyGroups.has(dateKey)) dailyGroups.set(dateKey, []);
    dailyGroups.get(dateKey)!.push(tx);
  });

  dailyGroups.forEach((txs, dateKey) => {
    const totalAmount = txs.reduce((sum, tx) => sum + tx.amount, 0);
    let eventType: TimelineEvent["type"] = "transfer";
    let significance = 0.5;

    if (txs.length > 10) {
      eventType = "spike";
      significance = Math.min(txs.length / 50, 1);
    }

    const inflows = txs.filter((tx) => tx.to === address);
    const outflows = txs.filter((tx) => tx.from === address);

    if (inflows.length > 5 && outflows.length <= 1) {
      eventType = "aggregation";
      significance = 0.8;
    } else if (inflows.length <= 1 && outflows.length > 5) {
      eventType = "split";
      significance = 0.8;
    }

    events.push({
      timestamp: new Date(dateKey),
      type: eventType,
      address,
      amount: totalAmount,
      relatedAddresses: Array.from(
        new Set(txs.map((tx) => (tx.from === address ? tx.to : tx.from)))
      ),
      significance,
    });
  });

  const sortedEvents = events.sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const dormantEvents: TimelineEvent[] = [];

  for (let i = 1; i < sortedEvents.length; i++) {
    const gap =
      sortedEvents[i].timestamp.getTime() -
      sortedEvents[i - 1].timestamp.getTime();
    const dayGap = gap / (1000 * 60 * 60 * 24);
    if (dayGap > 7) {
      dormantEvents.push({
        timestamp: new Date(sortedEvents[i - 1].timestamp.getTime() + gap / 2),
        type: "dormant",
        address,
        amount: 0,
        relatedAddresses: [],
        significance: Math.min(dayGap / 30, 1),
      });
    }
  }

  return [...events, ...dormantEvents].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
};

// ===== WALLET ANALYSIS FUNCTIONS =====

import { WalletTimeSeries, DailyTransactionCount, WalletStats } from "../types";

/**
 * Get all unique wallet addresses from transactions
 */
export const getAllWalletAddresses = (
  transactions: Transaction[]
): string[] => {
  const addresses = new Set<string>();
  transactions.forEach((tx) => {
    addresses.add(tx.from);
    addresses.add(tx.to);
  });
  return Array.from(addresses).sort();
};

/**
 * Get comprehensive statistics for a specific wallet
 */
export const getWalletStatistics = (
  transactions: Transaction[],
  walletAddress: string
): WalletStats => {
  const inflows = transactions.filter((tx) => tx.to === walletAddress);
  const outflows = transactions.filter((tx) => tx.from === walletAddress);
  const allTxs = [...inflows, ...outflows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const totalInflow = inflows.reduce((sum, tx) => sum + tx.amount, 0);
  const totalOutflow = outflows.reduce((sum, tx) => sum + tx.amount, 0);

  // Calculate counterparties
  const counterpartyMap = new Map<string, { volume: number; count: number }>();

  inflows.forEach((tx) => {
    const existing = counterpartyMap.get(tx.from) || { volume: 0, count: 0 };
    counterpartyMap.set(tx.from, {
      volume: existing.volume + tx.amount,
      count: existing.count + 1,
    });
  });

  outflows.forEach((tx) => {
    const existing = counterpartyMap.get(tx.to) || { volume: 0, count: 0 };
    counterpartyMap.set(tx.to, {
      volume: existing.volume + tx.amount,
      count: existing.count + 1,
    });
  });

  const topCounterparties = Array.from(counterpartyMap.entries())
    .map(([address, data]) => ({
      address,
      volume: data.volume,
      count: data.count,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  // Calculate peak activity hour
  const hourCounts = new Map<number, number>();
  allTxs.forEach((tx) => {
    const hour = tx.date.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  let peakHour = 0;
  let maxCount = 0;
  hourCounts.forEach((count, hour) => {
    if (count > maxCount) {
      maxCount = count;
      peakHour = hour;
    }
  });

  // Calculate activity score (0-100)
  const totalTxCount = allTxs.length;
  const totalVolume = totalInflow + totalOutflow;
  const activityScore = Math.min(
    100,
    totalTxCount * 2 + Math.log10(totalVolume + 1) * 10
  );

  return {
    address: walletAddress,
    totalInflow,
    totalOutflow,
    netBalance: totalInflow - totalOutflow,
    inflowCount: inflows.length,
    outflowCount: outflows.length,
    totalTxCount,
    avgInflowSize: inflows.length > 0 ? totalInflow / inflows.length : 0,
    avgOutflowSize: outflows.length > 0 ? totalOutflow / outflows.length : 0,
    firstTxDate: allTxs.length > 0 ? allTxs[0].date : new Date(),
    lastTxDate: allTxs.length > 0 ? allTxs[allTxs.length - 1].date : new Date(),
    topCounterparties,
    peakActivityHour: peakHour,
    activityScore,
  };
};

/**
 * Get time series data for wallet transaction volume
 */
export const getWalletVolumeOverTime = (
  transactions: Transaction[],
  walletAddress: string,
  interval: "daily" | "weekly" | "monthly" = "daily"
): WalletTimeSeries[] => {
  const dataMap = new Map<
    string,
    {
      inflow: number;
      outflow: number;
      inflowCount: number;
      outflowCount: number;
    }
  >();

  const getDateKey = (date: Date): string => {
    if (interval === "daily") {
      return date.toISOString().split("T")[0];
    } else if (interval === "weekly") {
      const d = new Date(date);
      const dayOfWeek = d.getDay();
      const diff = d.getDate() - dayOfWeek;
      const weekStart = new Date(d.setDate(diff));
      return weekStart.toISOString().split("T")[0];
    } else {
      // monthly
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
    }
  };

  transactions.forEach((tx) => {
    const dateKey = getDateKey(tx.date);
    const existing = dataMap.get(dateKey) || {
      inflow: 0,
      outflow: 0,
      inflowCount: 0,
      outflowCount: 0,
    };

    if (tx.to === walletAddress) {
      existing.inflow += tx.amount;
      existing.inflowCount += 1;
    } else if (tx.from === walletAddress) {
      existing.outflow += tx.amount;
      existing.outflowCount += 1;
    }

    dataMap.set(dateKey, existing);
  });

  return Array.from(dataMap.entries())
    .map(([date, data]) => ({
      date,
      inflow: data.inflow,
      outflow: data.outflow,
      netFlow: data.inflow - data.outflow,
      inflowCount: data.inflowCount,
      outflowCount: data.outflowCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Get daily transaction counts for a wallet
 */
export const getWalletTransactionCount = (
  transactions: Transaction[],
  walletAddress: string
): DailyTransactionCount[] => {
  const dataMap = new Map<
    string,
    { inflowCount: number; outflowCount: number }
  >();

  transactions.forEach((tx) => {
    const dateKey = tx.date.toISOString().split("T")[0];
    const existing = dataMap.get(dateKey) || {
      inflowCount: 0,
      outflowCount: 0,
    };

    if (tx.to === walletAddress) {
      existing.inflowCount += 1;
    } else if (tx.from === walletAddress) {
      existing.outflowCount += 1;
    }

    dataMap.set(dateKey, existing);
  });

  return Array.from(dataMap.entries())
    .map(([date, data]) => ({
      date,
      inflowCount: data.inflowCount,
      outflowCount: data.outflowCount,
      totalCount: data.inflowCount + data.outflowCount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};
