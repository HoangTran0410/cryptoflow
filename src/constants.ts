import { Transaction } from "./types";

// Generate a structured dataset for meaningful analysis (5000 transactions)
export const SAMPLE_DATA: Transaction[] = (() => {
  const transactions: Transaction[] = [];
  const now = new Date();

  // --- ENTITIES ---
  const exchanges = [
    "Binance_Hot_Wallet",
    "Coinbase_Prime",
    "OKX_Reserves",
    "Kraken_Deposit",
    "Huobi_Global",
  ];
  const defiPools = [
    "Uniswap_V3_USDT_ETH",
    "Curve_3pool",
    "Aave_Lending_Pool",
    "Stargate_Bridge_USDT",
  ];
  const marketMakers = ["Wintermute_Trading", "Jump_Crypto", "GSR_Markets"];
  const mixer = "Tornado_Cash_Router";

  // Whales (High volume actors)
  const whales = Array.from(
    { length: 20 },
    (_, i) => `0xWhale_${i.toString().padStart(2, "0")}`
  );

  // Retail Clusters (Groups of users)
  const retailUsers = Array.from(
    { length: 1000 },
    (_, i) =>
      `0x${Math.floor(Math.random() * 100000)
        .toString(16)
        .padStart(4, "0")}`
  );

  const addTx = (
    from: string,
    to: string,
    amount: number,
    timeOffsetHours: number
  ) => {
    const date = new Date(now);
    date.setHours(date.getHours() - timeOffsetHours);
    // Add some random minutes variation
    date.setMinutes(date.getMinutes() + Math.floor(Math.random() * 60));

    transactions.push({
      id: `tx_${Math.random().toString(36).substr(2, 9)}`,
      date,
      from,
      to,
      amount: parseFloat(amount.toFixed(2)),
      currency: "USDT",
      type: "transfer",
    });
  };

  // --- SCENARIO 1: Exchange Activity (Hubs) ---
  // Create dense connections around exchanges
  for (let i = 0; i < 2000; i++) {
    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    const user = retailUsers[Math.floor(Math.random() * retailUsers.length)];
    const isDeposit = Math.random() > 0.4; // Slightly more deposits
    const amount = Math.random() * 5000 + 100;
    const time = Math.floor(Math.random() * 24 * 90); // Last 90 days

    if (isDeposit) addTx(user, exchange, amount, time);
    else addTx(exchange, user, amount * 0.9, time); // Withdrawals usually slightly less
  }

  // --- SCENARIO 2: Whale Movements (High Value) ---
  // Whales moving funds between exchanges and cold storage
  for (let i = 0; i < 200; i++) {
    const whale = whales[Math.floor(Math.random() * whales.length)];
    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    const amount = Math.random() * 500000 + 50000;
    const time = Math.floor(Math.random() * 24 * 90);

    if (Math.random() > 0.5) addTx(whale, exchange, amount, time);
    else addTx(exchange, whale, amount, time);
  }

  // --- SCENARIO 3: DeFi Arbitrage Loops (Circular Flow) ---
  // MM -> Exchange -> User -> Pool -> MM
  for (let i = 0; i < 100; i++) {
    const mm = marketMakers[Math.floor(Math.random() * marketMakers.length)];
    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    const pool = defiPools[Math.floor(Math.random() * defiPools.length)];
    const amount = Math.random() * 100000 + 10000;
    const baseTime = Math.floor(Math.random() * 24 * 30);

    addTx(mm, exchange, amount, baseTime + 4);
    addTx(exchange, pool, amount * 0.99, baseTime + 3);
    addTx(pool, mm, amount * 1.01, baseTime + 2); // Profit
  }

  // --- SCENARIO 4: Layering / Washing (Chain Flow) ---
  // User A -> User B -> User C -> Mixer -> Exchange
  for (let i = 0; i < 50; i++) {
    const startUser = retailUsers[Math.floor(Math.random() * 100)];
    const midUser1 = `0xMule_${Math.random().toString(16).substr(2, 4)}`;
    const midUser2 = `0xMule_${Math.random().toString(16).substr(2, 4)}`;
    const targetEx = exchanges[0]; // All going to Binance for example
    const amount = 20000;
    const baseTime = Math.floor(Math.random() * 24 * 10);

    addTx(startUser, midUser1, amount, baseTime + 5);
    addTx(midUser1, midUser2, amount * 0.98, baseTime + 4);
    addTx(midUser2, mixer, amount * 0.96, baseTime + 3);
    addTx(mixer, targetEx, amount * 0.9, baseTime + 1);
  }

  // --- SCENARIO 5: Bridge Activity ---
  for (let i = 0; i < 300; i++) {
    const user = retailUsers[Math.floor(Math.random() * retailUsers.length)];
    const bridge = "Stargate_Bridge_USDT";
    const amount = Math.random() * 2000;
    const time = Math.floor(Math.random() * 24 * 60);
    addTx(user, bridge, amount, time);
  }

  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
})();
