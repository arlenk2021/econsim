import {
  Vickrey,
  VICKREY_SELLER,
  AllPay,
  ALLPAY_SELLER,
  DoubleAuction,
  PublicGoods,
  PG_BANK,
  makeRng,
  type GameEvent,
  type SeededRng,
} from "@econsim/mechanisms";
import { STRATEGIES, type BidderStrategy } from "./bots.ts";

export interface SimOptions {
  mechanism: "vickrey" | "all-pay" | "double-auction" | "public-goods";
  players: number;
  rounds: number;
  seed: number;
  /** Strategy name from bots.STRATEGIES; mixed assigns round-robin. */
  strategy: string;
  /** Max valuation in cents for sampling private values. */
  maxValueCents: number;
}

export interface RoundResult {
  round: number;
  revenueCents: number;
  /** Realized surplus (value captured by allocation) vs first-best surplus. */
  efficiency: number;
  /** Σ over players of (truthful-payoff − actual-payoff), >= 0. */
  truthfulnessRegretCents: number;
}

export interface SimSummary {
  mechanism: string;
  players: number;
  rounds: number;
  seed: number;
  strategy: string;
  meanRevenueCents: number;
  meanEfficiency: number;
  meanTruthfulnessRegretCents: number;
  /** Concatenated event log digest for the whole run (replay anchor). */
  eventCount: number;
}

function assignStrategies(n: number, strategy: string): BidderStrategy[] {
  if (strategy === "mixed") {
    const names = Object.keys(STRATEGIES);
    return Array.from(
      { length: n },
      (_, i) => STRATEGIES[names[i % names.length]!]!,
    );
  }
  const s = STRATEGIES[strategy];
  if (!s) throw new Error(`unknown strategy: ${strategy}`);
  return Array.from({ length: n }, () => s);
}

function sampleValues(n: number, max: number, rng: SeededRng): number[] {
  return Array.from({ length: n }, (_, i) =>
    1 + Math.floor(rng.fork(`val:${i}`).next() * max),
  );
}

/** Run one Vickrey round; return revenue, efficiency, regret. */
function runVickreyRound(
  players: string[],
  values: number[],
  strategies: BidderStrategy[],
  seed: number,
): RoundResult & { events: GameEvent[] } {
  const rng = makeRng(seed);
  let state = Vickrey.init({ players, seed }, rng);
  const events: GameEvent[] = [];
  const bids = players.map((_, i) =>
    Math.max(0, strategies[i]!(values[i]!, rng.fork(`bid:${i}`))),
  );
  players.forEach((p, i) => {
    const r = Vickrey.apply(state, p, { type: "bid", cents: bids[i]! });
    state = r.state;
    events.push(...r.events);
  });
  const rev = Vickrey.apply(state, VICKREY_SELLER, { type: "reveal" });
  state = rev.state;
  events.push(...rev.events);

  const revenueCents = state.paymentCents;
  // Efficiency: did the item go to the highest-valuation player?
  const bestValue = Math.max(...values);
  const winnerValue =
    state.winner !== null ? values[players.indexOf(state.winner)]! : 0;
  const efficiency = bestValue > 0 ? winnerValue / bestValue : 1;

  // Truthfulness regret: for each player, the surplus gained by unilaterally
  // switching to truthful (bid = value) while opponents' bids stay fixed.
  // Vickrey is second-price, so against a fixed opponent-max m a bidder of
  // value v wins iff their bid > m (ties resolved by index here for the
  // counterfactual) and pays m, yielding surplus v - m when winning.
  let regret = 0;
  for (let i = 0; i < players.length; i++) {
    let oppMax = 0;
    for (let j = 0; j < players.length; j++) if (j !== i) oppMax = Math.max(oppMax, bids[j]!);
    const surplusGiven = (myBid: number): number =>
      myBid > oppMax ? values[i]! - oppMax : 0;
    const actual = surplusGiven(bids[i]!);
    const truthful = surplusGiven(values[i]!);
    if (truthful > actual) regret += truthful - actual;
  }

  return {
    round: 0,
    revenueCents,
    efficiency,
    truthfulnessRegretCents: regret,
    events,
  };
}

function runAllPayRound(
  players: string[],
  values: number[],
  strategies: BidderStrategy[],
  seed: number,
): RoundResult & { events: GameEvent[] } {
  const rng = makeRng(seed);
  let state = AllPay.init({ players, seed }, rng);
  const events: GameEvent[] = [];
  players.forEach((p, i) => {
    // all-pay: don't bid above value; shade by strategy
    const raw = strategies[i]!(values[i]!, rng.fork(`bid:${i}`));
    const bid = Math.max(0, Math.min(raw, values[i]!));
    const r = AllPay.apply(state, p, { type: "bid", cents: bid });
    state = r.state;
    events.push(...r.events);
  });
  const rev = AllPay.apply(state, ALLPAY_SELLER, { type: "reveal" });
  state = rev.state;
  events.push(...rev.events);

  const payoffs = AllPay.payoffs(state);
  const revenueCents = payoffs.get(ALLPAY_SELLER) ?? 0;
  const bestValue = Math.max(...values);
  const winnerValue =
    state.winner !== null ? values[players.indexOf(state.winner)]! : 0;
  const efficiency = bestValue > 0 ? winnerValue / bestValue : 1;
  return {
    round: 0,
    revenueCents,
    efficiency,
    truthfulnessRegretCents: 0, // no dominant strategy in all-pay
    events,
  };
}

function runDoubleAuctionRound(
  buyers: string[],
  sellers: string[],
  buyerValues: number[],
  sellerCosts: number[],
  strategies: BidderStrategy[],
  seed: number,
): RoundResult & { events: GameEvent[] } {
  const rng = makeRng(seed);
  let state = DoubleAuction.init({ buyers, sellers, seed }, rng);
  const events: GameEvent[] = [];
  buyers.forEach((b, i) => {
    const bid = Math.max(0, Math.min(strategies[i]!(buyerValues[i]!, rng.fork(`bbid:${i}`)), buyerValues[i]!));
    const r = DoubleAuction.apply(state, b, { type: "order", priceCents: bid });
    state = r.state;
    events.push(...r.events);
  });
  sellers.forEach((s, i) => {
    // sellers ask at/above cost; markup random
    const ask = sellerCosts[i]! + Math.floor(rng.fork(`ask:${i}`).next() * Math.max(1, sellerCosts[i]!) * 0.3);
    const r = DoubleAuction.apply(state, s, { type: "order", priceCents: ask });
    state = r.state;
    events.push(...r.events);
  });
  const cleared = DoubleAuction.apply(state, "__market__", { type: "clear" });
  state = cleared.state;
  events.push(...cleared.events);

  // Revenue: total value transacted at the clearing price.
  const price = state.clearingPriceCents ?? 0;
  const trades = state.matched.filter((id) => id.startsWith("b")).length;
  const revenueCents = price * trades;

  // Efficiency: realized gains-from-trade vs. competitive-equilibrium maximum.
  const sortedBuyVals = [...buyerValues].sort((a, b) => b - a);
  const sortedCosts = [...sellerCosts].sort((a, b) => a - b);
  let maxGains = 0;
  for (let q = 0; q < Math.min(sortedBuyVals.length, sortedCosts.length); q++) {
    if (sortedBuyVals[q]! >= sortedCosts[q]!) maxGains += sortedBuyVals[q]! - sortedCosts[q]!;
  }
  let realized = 0;
  for (const id of state.matched) {
    if (id.startsWith("b")) realized += buyerValues[buyers.indexOf(id)]! - price;
    else realized += price - sellerCosts[sellers.indexOf(id)]!;
  }
  const efficiency = maxGains > 0 ? realized / maxGains : 1;
  return { round: 0, revenueCents, efficiency, truthfulnessRegretCents: 0, events };
}

function runPublicGoodsRound(
  players: string[],
  endowment: number,
  strategies: BidderStrategy[],
  seed: number,
): RoundResult & { events: GameEvent[] } {
  const rng = makeRng(seed);
  const mNum = Math.max(2, Math.min(players.length - 1, players.length - 1));
  let state = PublicGoods.init(
    { players, endowmentCents: endowment, multiplierNum: mNum, multiplierDen: 1, seed },
    rng,
  );
  const events: GameEvent[] = [];
  players.forEach((p, i) => {
    // map strategy on endowment: truthful=full cooperate, random in [0,end]
    const raw = strategies[i]! === STRATEGIES.truthful ? endowment : Math.floor(rng.fork(`c:${i}`).next() * (endowment + 1));
    const c = Math.max(0, Math.min(raw, endowment));
    const r = PublicGoods.apply(state, p, { type: "contribute", cents: c });
    state = r.state;
    events.push(...r.events);
  });
  const settled = PublicGoods.apply(state, PG_BANK, { type: "settle" });
  state = settled.state;
  events.push(...settled.events);

  const payoffs = PublicGoods.payoffs(state);
  let welfare = 0;
  for (const p of players) welfare += payoffs.get(p)!;
  // "revenue" reinterpreted as total public good provision (per-player return * n)
  const revenueCents = (state.publicReturnCents ?? 0) * players.length;
  // efficiency vs first-best (everyone contributes everything)
  const firstBest = (mNum * endowment * players.length) - endowment * players.length;
  const efficiency = firstBest > 0 ? welfare / firstBest : 1;
  return { round: 0, revenueCents, efficiency, truthfulnessRegretCents: 0, events };
}

export function runSim(opts: SimOptions): { summary: SimSummary; rounds: RoundResult[] } {
  const top = makeRng(opts.seed);
  const strategies = assignStrategies(opts.players, opts.strategy);
  const results: RoundResult[] = [];
  let eventCount = 0;

  for (let r = 0; r < opts.rounds; r++) {
    const roundSeed = Math.floor(top.fork(`round:${r}`).next() * 2 ** 31);
    const rng = makeRng(roundSeed);
    let res: RoundResult & { events: GameEvent[] };

    if (opts.mechanism === "vickrey") {
      const players = Array.from({ length: opts.players }, (_, i) => `p${i}`);
      const values = sampleValues(opts.players, opts.maxValueCents, rng);
      res = runVickreyRound(players, values, strategies, roundSeed);
    } else if (opts.mechanism === "all-pay") {
      const players = Array.from({ length: opts.players }, (_, i) => `p${i}`);
      const values = sampleValues(opts.players, opts.maxValueCents, rng);
      res = runAllPayRound(players, values, strategies, roundSeed);
    } else if (opts.mechanism === "double-auction") {
      const half = Math.max(1, Math.floor(opts.players / 2));
      const buyers = Array.from({ length: half }, (_, i) => `b${i}`);
      const sellers = Array.from({ length: half }, (_, i) => `s${i}`);
      const buyerValues = sampleValues(half, opts.maxValueCents, rng.fork("bv"));
      const sellerCosts = sampleValues(half, opts.maxValueCents, rng.fork("sc"));
      res = runDoubleAuctionRound(buyers, sellers, buyerValues, sellerCosts, strategies, roundSeed);
    } else {
      const players = Array.from({ length: opts.players }, (_, i) => `p${i}`);
      res = runPublicGoodsRound(players, opts.maxValueCents, strategies, roundSeed);
    }

    eventCount += res.events.length;
    results.push({ ...res, round: r });
  }

  const mean = (f: (x: RoundResult) => number) =>
    results.reduce((a, x) => a + f(x), 0) / Math.max(1, results.length);

  const summary: SimSummary = {
    mechanism: opts.mechanism,
    players: opts.players,
    rounds: opts.rounds,
    seed: opts.seed,
    strategy: opts.strategy,
    meanRevenueCents: mean((x) => x.revenueCents),
    meanEfficiency: mean((x) => x.efficiency),
    meanTruthfulnessRegretCents: mean((x) => x.truthfulnessRegretCents),
    eventCount,
  };

  return { summary, rounds: results };
}
