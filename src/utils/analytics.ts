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
