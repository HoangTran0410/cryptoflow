import { Transaction, TransactionPath, SuspiciousPattern } from '../types';

/**
 * Calculate statistical mode (most frequent value) in an array
 */
export const mode = (arr: number[]): number => {
  if (arr.length === 0) return 0;

  const frequency = new Map<number, number>();
  arr.forEach(val => {
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
  transactions.forEach(tx => {
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
          if (cycle.length >= 3 && cycles.length < 10) { // Limit to 10 cycles
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
export const calculatePathSuspicion = (
  transactions: Transaction[]
): number => {
  if (transactions.length === 0) return 0;

  let score = 0;
  let factors = 0;

  // Factor 1: Round amounts (0-30 points)
  const roundAmounts = transactions.filter(tx => {
    const amount = tx.amount;
    return amount >= 1000 && amount % 1000 === 0;
  });
  const roundRatio = roundAmounts.length / transactions.length;
  score += roundRatio * 30;
  factors++;

  // Factor 2: Rapid transfers (0-30 points)
  const sortedTxs = [...transactions].sort((a, b) =>
    a.date.getTime() - b.date.getTime()
  );
  let rapidTransfers = 0;
  for (let i = 1; i < sortedTxs.length; i++) {
    const timeDiff = sortedTxs[i].date.getTime() - sortedTxs[i-1].date.getTime();
    if (timeDiff < 5 * 60 * 1000) { // < 5 minutes
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
    const amounts = transactions.map(tx => tx.amount);
    const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / amounts.length;
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
    .filter(tx => tx.from === address)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (relevantTxs.length < 2) return 0;

  const delays: number[] = [];
  for (let i = 1; i < relevantTxs.length; i++) {
    delays.push(relevantTxs[i].date.getTime() - relevantTxs[i-1].date.getTime());
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

  transactions.forEach(tx => {
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
    behaviors.push('frequent round-amount transactions');
  }

  // Check activity timing
  const hour = features.peakActivityHour;
  if (hour >= 0 && hour < 6) {
    behaviors.push('late-night activity');
  } else if (hour >= 9 && hour < 17) {
    behaviors.push('business-hours activity');
  }

  // Check transaction size
  if (features.avgTransactionSize > 10000) {
    behaviors.push('high-value transactions');
  } else if (features.avgTransactionSize < 100) {
    behaviors.push('micro-transactions');
  }

  // Check transaction frequency
  if (features.txCount > 100) {
    behaviors.push('high transaction volume');
  }

  return behaviors.length > 0
    ? behaviors.join(', ')
    : 'standard transaction behavior';
};

/**
 * Hash function for cache keys
 * Creates a simple hash from a string
 */
export const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
};

/**
 * Format address for display (truncate middle)
 */
export const formatAddress = (address: string, start: number = 6, end: number = 4): string => {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
};

/**
 * Format large numbers with K, M, B suffixes
 */
export const formatLargeNumber = (num: number): string => {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + 'B';
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toFixed(0);
};

/**
 * Convert time duration (ms) to human-readable format
 */
export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};
