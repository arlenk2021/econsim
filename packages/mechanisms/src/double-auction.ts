import type { GameEvent, Id, Mechanism, Ok, Rejection, SeededRng } from "./mechanism.js";
import { makeRng } from "./rng.js";

/**
 * Call-market (sealed) double auction.
 * docs/mechanisms/double-auction.md.
 *
 * Each player is either a buyer (max willingness-to-pay) or a seller (min
 * acceptable price) of one unit. All orders are sealed, then a single uniform
 * clearing price is computed: sort buyers desc, sellers asc, find the quantity
 * q where the q-th buyer bid >= q-th seller ask. Clearing price is the midpoint
 * of the marginal buyer/seller, rounded to integer cents.
 *
 * Money conservation: every matched trade moves `price` cents from buyer to
 * seller, so Σ payoffs (transfer side) == 0 exactly.
 */

export type Side = "buy" | "sell";

export interface DAConfig {
  buyers: Id[];
  sellers: Id[];
  seed: number;
}

export type DAPhase = "collecting" | "cleared";

export interface DAOrder {
  side: Side;
  priceCents: number; // buyer: max WTP; seller: min ask
}

export interface DAState {
  phase: DAPhase;
  buyers: Id[];
  sellers: Id[];
  seed: number;
  orders: Record<Id, DAOrder>;
  clearingPriceCents: number | null;
  /** Matched player ids (both buyers and sellers who transacted). */
  matched: Id[];
  payoffsCents: Record<Id, number> | null;
}

export type DAAction =
  | { type: "order"; priceCents: number }
  | { type: "clear" };

function sideOf(state: DAState, id: Id): Side | null {
  if (state.buyers.includes(id)) return "buy";
  if (state.sellers.includes(id)) return "sell";
  return null;
}

interface Clearing {
  priceCents: number | null;
  buyersMatched: Id[];
  sellersMatched: Id[];
}

/**
 * Uniform-price call market clearing. Deterministic tie-break: orders at the
 * same price are ordered by a seeded shuffle of player ids so that which
 * marginal trader clears is reproducible.
 */
function clear(state: DAState, rng: SeededRng): Clearing {
  const shuffle = (ids: Id[], label: string): Id[] => {
    const out = ids.slice();
    const r = rng.fork(label);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      const t = out[i]!;
      out[i] = out[j]!;
      out[j] = t;
    }
    return out;
  };

  const buyOrders = state.buyers
    .filter((b) => b in state.orders)
    .map((b) => ({ id: b, price: state.orders[b]!.priceCents }));
  const sellOrders = state.sellers
    .filter((s) => s in state.orders)
    .map((s) => ({ id: s, price: state.orders[s]!.priceCents }));

  // Demand: highest bids first. Supply: lowest asks first. Seeded tie-break.
  const buysSorted = shuffle(
    buyOrders.map((o) => o.id),
    "da:buytie",
  )
    .map((id) => buyOrders.find((o) => o.id === id)!)
    .sort((a, b) => b.price - a.price);
  const sellsSorted = shuffle(
    sellOrders.map((o) => o.id),
    "da:selltie",
  )
    .map((id) => sellOrders.find((o) => o.id === id)!)
    .sort((a, b) => a.price - b.price);

  // Largest q with buy[q-1].price >= sell[q-1].price.
  let q = 0;
  const maxQ = Math.min(buysSorted.length, sellsSorted.length);
  while (q < maxQ && buysSorted[q]!.price >= sellsSorted[q]!.price) q++;

  if (q === 0) {
    return { priceCents: null, buyersMatched: [], sellersMatched: [] };
  }

  // Uniform price: midpoint of marginal buyer's bid and marginal seller's ask,
  // bounded to keep both sides weakly better off, rounded to integer cents.
  const marginalBuy = buysSorted[q - 1]!.price;
  const marginalSell = sellsSorted[q - 1]!.price;
  const priceCents = Math.round((marginalBuy + marginalSell) / 2);

  return {
    priceCents,
    buyersMatched: buysSorted.slice(0, q).map((o) => o.id),
    sellersMatched: sellsSorted.slice(0, q).map((o) => o.id),
  };
}

export const DoubleAuction: Mechanism<DAState, DAAction, DAConfig> = {
  init(config) {
    return {
      phase: "collecting",
      buyers: config.buyers.slice(),
      sellers: config.sellers.slice(),
      seed: config.seed,
      orders: {},
      clearingPriceCents: null,
      matched: [],
      payoffsCents: null,
    };
  },

  validate(state, playerId, action): Ok | Rejection {
    if (action.type === "order") {
      if (state.phase !== "collecting")
        return { ok: false, reason: "market is closed" };
      if (sideOf(state, playerId) === null)
        return { ok: false, reason: "not a participant" };
      if (!Number.isInteger(action.priceCents))
        return { ok: false, reason: "price must be integer cents" };
      if (action.priceCents < 0)
        return { ok: false, reason: "price must be >= 0" };
      return { ok: true };
    }
    if (action.type === "clear") {
      if (state.phase !== "collecting")
        return { ok: false, reason: "already cleared" };
      return { ok: true };
    }
    return { ok: false, reason: "unknown action" };
  },

  apply(state, playerId, action) {
    const check = this.validate(state, playerId, action);
    if (!check.ok) throw new Error(`invalid action: ${check.reason}`);

    if (action.type === "order") {
      const side = sideOf(state, playerId)!;
      const next: DAState = {
        ...state,
        orders: {
          ...state.orders,
          [playerId]: { side, priceCents: action.priceCents },
        },
      };
      const events: GameEvent[] = [
        {
          type: "order_placed",
          payload: { player: playerId, side, priceCents: action.priceCents },
          visibleTo: [playerId],
        },
        {
          type: "order_count",
          payload: { count: Object.keys(next.orders).length },
          visibleTo: "all",
        },
      ];
      return { state: next, events };
    }

    // clear
    const rng = makeRng(state.seed);
    const c = clear(state, rng);
    const payoffsCents: Record<Id, number> = {};
    for (const id of [...state.buyers, ...state.sellers]) payoffsCents[id] = 0;

    if (c.priceCents !== null) {
      for (const b of c.buyersMatched) payoffsCents[b] = -c.priceCents;
      for (const s of c.sellersMatched) payoffsCents[s] = c.priceCents;
    }

    const settled: DAState = {
      ...state,
      phase: "cleared",
      clearingPriceCents: c.priceCents,
      matched: [...c.buyersMatched, ...c.sellersMatched],
      payoffsCents,
    };

    const events: GameEvent[] = [
      {
        type: "cleared",
        payload: {
          clearingPriceCents: c.priceCents,
          buyersMatched: c.buyersMatched,
          sellersMatched: c.sellersMatched,
          orders: state.orders,
        },
        visibleTo: "all",
      },
    ];
    return { state: settled, events };
  },

  onTimer(state, timer) {
    if (timer === "close" && state.phase === "collecting") {
      return this.apply(state, "__market__", { type: "clear" });
    }
    return { state, events: [] };
  },

  view(state, viewer) {
    if (state.phase === "collecting") {
      const own =
        viewer !== "spectator" && viewer in state.orders
          ? state.orders[viewer]
          : null;
      return {
        phase: state.phase,
        ordersPlaced: Object.keys(state.orders).length,
        buyers: state.buyers,
        sellers: state.sellers,
        yourOrder: own,
      };
    }
    return {
      phase: state.phase,
      clearingPriceCents: state.clearingPriceCents,
      matched: state.matched,
      orders: state.orders,
    };
  },

  payoffs(state): Map<Id, number> {
    if (state.phase !== "cleared" || state.payoffsCents === null)
      throw new Error("payoffs() valid only when cleared");
    return new Map(Object.entries(state.payoffsCents));
  },

  isTerminal(state) {
    return state.phase === "cleared";
  },
};
