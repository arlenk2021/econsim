import type { GameEvent, Id, Mechanism, Ok, Rejection, SeededRng } from "./mechanism.js";
import { makeRng } from "./rng.js";

/**
 * All-pay auction (sealed-bid).
 * docs/mechanisms/all-pay.md.
 *
 * One item; sealed bids; highest bid wins; EVERY bidder pays their own bid
 * (win or lose). Models lobbying, contests, war-of-attrition. The seller
 * collects the sum of all bids. Ties for the top broken by seeded uniform draw.
 *
 * Money conservation: Σ bidder transfers (= -Σ bids) + seller receipt (= Σ bids)
 * == 0.
 */

export const SELLER: Id = "__seller__";

export interface AllPayConfig {
  players: Id[];
  seed: number;
}

export type AllPayPhase = "collecting" | "settled";

export interface AllPayState {
  phase: AllPayPhase;
  players: Id[];
  seed: number;
  bids: Record<Id, number>;
  winner: Id | null;
  payoffsCents: Record<Id, number> | null;
}

export type AllPayAction =
  | { type: "bid"; cents: number }
  | { type: "reveal" };

function pickWinner(state: AllPayState, rng: SeededRng): Id | null {
  const entries = state.players
    .filter((p) => p in state.bids)
    .map((p) => ({ p, bid: state.bids[p]! }));
  if (entries.length === 0) return null;
  const maxBid = Math.max(...entries.map((e) => e.bid));
  if (maxBid <= 0) return null; // nobody put money down → no winner
  const top = entries
    .filter((e) => e.bid === maxBid)
    .map((e) => e.p)
    .sort();
  const r = rng.fork("allpay:tiebreak");
  return top[Math.floor(r.next() * top.length)]!;
}

export const AllPay: Mechanism<AllPayState, AllPayAction, AllPayConfig> = {
  init(config) {
    return {
      phase: "collecting",
      players: config.players.slice(),
      seed: config.seed,
      bids: {},
      winner: null,
      payoffsCents: null,
    };
  },

  validate(state, playerId, action): Ok | Rejection {
    if (action.type === "bid") {
      if (state.phase !== "collecting")
        return { ok: false, reason: "bidding is closed" };
      if (!state.players.includes(playerId))
        return { ok: false, reason: "not a participant" };
      if (!Number.isInteger(action.cents))
        return { ok: false, reason: "bid must be integer cents" };
      if (action.cents < 0) return { ok: false, reason: "bid must be >= 0" };
      return { ok: true };
    }
    if (action.type === "reveal") {
      if (state.phase !== "collecting")
        return { ok: false, reason: "already revealed" };
      return { ok: true };
    }
    return { ok: false, reason: "unknown action" };
  },

  apply(state, playerId, action) {
    const check = this.validate(state, playerId, action);
    if (!check.ok) throw new Error(`invalid action: ${check.reason}`);

    if (action.type === "bid") {
      const next: AllPayState = {
        ...state,
        bids: { ...state.bids, [playerId]: action.cents },
      };
      const events: GameEvent[] = [
        {
          type: "bid_placed",
          payload: { player: playerId, cents: action.cents },
          visibleTo: [playerId],
        },
        {
          type: "bid_count",
          payload: { count: Object.keys(next.bids).length },
          visibleTo: "all",
        },
      ];
      return { state: next, events };
    }

    // reveal
    const rng = makeRng(state.seed);
    const winner = pickWinner(state, rng);
    const payoffsCents: Record<Id, number> = {};
    for (const p of state.players) payoffsCents[p] = 0;
    let sellerReceipt = 0;
    for (const p of state.players) {
      const b = state.bids[p] ?? 0;
      payoffsCents[p] = -b; // everyone pays their own bid
      sellerReceipt += b;
    }
    payoffsCents[SELLER] = sellerReceipt;

    const settled: AllPayState = {
      ...state,
      phase: "settled",
      winner,
      payoffsCents,
    };

    const events: GameEvent[] = [
      {
        type: "revealed",
        payload: { bids: state.bids, winner, sellerReceipt },
        visibleTo: "all",
      },
    ];
    return { state: settled, events };
  },

  onTimer(state, timer) {
    if (timer === "close" && state.phase === "collecting") {
      return this.apply(state, SELLER, { type: "reveal" });
    }
    return { state, events: [] };
  },

  view(state, viewer) {
    if (state.phase === "collecting") {
      const own =
        viewer !== "spectator" && viewer in state.bids
          ? state.bids[viewer]
          : null;
      return {
        phase: state.phase,
        bidsPlaced: Object.keys(state.bids).length,
        players: state.players,
        yourBid: own,
      };
    }
    return {
      phase: state.phase,
      bids: state.bids,
      winner: state.winner,
    };
  },

  payoffs(state): Map<Id, number> {
    if (state.phase !== "settled" || state.payoffsCents === null)
      throw new Error("payoffs() valid only when settled");
    return new Map(Object.entries(state.payoffsCents));
  },

  isTerminal(state) {
    return state.phase === "settled";
  },
};
