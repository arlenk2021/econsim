import type { GameEvent, Id, Mechanism, Ok, Rejection, SeededRng } from "./mechanism.js";

/**
 * Vickrey (second-price sealed-bid) auction.
 * Theory + invariants: docs/mechanisms/vickrey.md.
 *
 * Pure: all randomness (tie-break, reveal shuffle) comes from the seeded RNG
 * captured at init. Money is integer cents.
 */

export const SELLER: Id = "__seller__";

export interface VickreyConfig {
  /** Participating bidder seats (order is canonical for determinism). */
  players: Id[];
  /** Reserve price in integer cents; winner pays at least this. Default 0. */
  reserveCents?: number;
  /** RNG seed (folded into init for tie-break + reveal order). */
  seed: number;
}

export type VickreyPhase = "collecting" | "revealed" | "settled";

export interface VickreyState {
  phase: VickreyPhase;
  players: Id[];
  reserveCents: number;
  /** Sealed bids in cents, keyed by player. HIDDEN until reveal. */
  bids: Record<Id, number>;
  /** Seed snapshot so init/apply stay pure & replayable. */
  seed: number;
  /** Populated at reveal/settle. */
  winner: Id | null;
  paymentCents: number;
  /** Seeded reveal order (player ids), set at reveal. */
  revealOrder: Id[];
  payoffsCents: Record<Id, number> | null;
}

export type VickreyAction =
  | { type: "bid"; cents: number }
  | { type: "reveal" }; // host/timer-driven close of the collecting phase

function isInteger(n: number): boolean {
  return Number.isInteger(n);
}

/**
 * Deterministic winner selection: argmax of bids, ties broken by a seeded
 * uniform draw among the tied top bidders. The "second price" is the highest
 * bid among everyone except the chosen winner (so a tie at the top means the
 * winner pays their own bid == the second price). Reserve raises the floor.
 */
function settle(state: VickreyState, rng: SeededRng): {
  winner: Id | null;
  paymentCents: number;
} {
  const entries = state.players
    .filter((p) => p in state.bids)
    .map((p) => ({ p, bid: state.bids[p]! }));

  if (entries.length === 0) return { winner: null, paymentCents: 0 };

  const maxBid = Math.max(...entries.map((e) => e.bid));
  if (maxBid < state.reserveCents) {
    // No bid clears the reserve → no allocation.
    return { winner: null, paymentCents: 0 };
  }

  // Canonical (sorted) list of tied top bidders for a stable tie-break.
  const topBidders = entries
    .filter((e) => e.bid === maxBid)
    .map((e) => e.p)
    .sort();

  const tieRng = rng.fork("vickrey:tiebreak");
  const idx = Math.floor(tieRng.next() * topBidders.length);
  const winner = topBidders[idx]!;

  // Second price = highest bid excluding the winner's bid, floored at reserve.
  const others = entries.filter((e) => e.p !== winner).map((e) => e.bid);
  const secondHighest = others.length > 0 ? Math.max(...others) : 0;
  const paymentCents = Math.max(secondHighest, state.reserveCents);

  return { winner, paymentCents };
}

function seededShuffle<T>(arr: T[], rng: SeededRng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.fork(`shuffle:${i}`).next() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export const Vickrey: Mechanism<VickreyState, VickreyAction, VickreyConfig> & {
  /** Exposed for the runner: re-derive the RNG for a state. */
  rngFor(state: VickreyState): SeededRng;
} = {
  rngFor(state: VickreyState): SeededRng {
    // late import to avoid cycle weight; rng module is pure.
    return makeRngLocal(state.seed);
  },

  init(config: VickreyConfig): VickreyState {
    return {
      phase: "collecting",
      players: config.players.slice(),
      reserveCents: config.reserveCents ?? 0,
      bids: {},
      seed: config.seed,
      winner: null,
      paymentCents: 0,
      revealOrder: [],
      payoffsCents: null,
    };
  },

  validate(state, playerId, action): Ok | Rejection {
    if (action.type === "bid") {
      if (state.phase !== "collecting")
        return { ok: false, reason: "bidding is closed" };
      if (!state.players.includes(playerId))
        return { ok: false, reason: "not a participant" };
      if (!isInteger(action.cents))
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

  apply(state, playerId, action): { state: VickreyState; events: GameEvent[] } {
    const check = this.validate(state, playerId, action);
    if (!check.ok) throw new Error(`invalid action: ${check.reason}`);

    if (action.type === "bid") {
      const next: VickreyState = {
        ...state,
        bids: { ...state.bids, [playerId]: action.cents },
      };
      // Only the bidder learns their own bid was recorded; others see a count.
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
    const rng = makeRngLocal(state.seed);
    const { winner, paymentCents } = settle(state, rng);
    const revealOrder = seededShuffle(
      state.players.filter((p) => p in state.bids),
      rng.fork("vickrey:reveal"),
    );

    const payoffsCents: Record<Id, number> = {};
    for (const p of state.players) payoffsCents[p] = 0;
    if (winner !== null) {
      // Bidder utility here is the transfer side only: winner pays payment,
      // seller receives it. Surplus (value − payment) is computed by the
      // caller who knows private valuations; mechanism tracks money moved.
      payoffsCents[winner] = -paymentCents;
      payoffsCents[SELLER] = paymentCents;
    }

    const settled: VickreyState = {
      ...state,
      phase: "settled",
      winner,
      paymentCents,
      revealOrder,
      payoffsCents,
    };

    const events: GameEvent[] = [
      {
        type: "revealed",
        payload: {
          revealOrder,
          bids: state.bids,
          winner,
          paymentCents,
        },
        visibleTo: "all",
      },
    ];
    return { state: settled, events };
  },

  onTimer(state, timer): { state: VickreyState; events: GameEvent[] } {
    if (timer === "close" && state.phase === "collecting") {
      return this.apply(state, SELLER, { type: "reveal" });
    }
    return { state, events: [] };
  },

  view(state, viewer): unknown {
    if (state.phase === "collecting") {
      const ownBid =
        viewer !== "spectator" && viewer in state.bids
          ? state.bids[viewer]
          : null;
      return {
        phase: state.phase,
        bidsPlaced: Object.keys(state.bids).length,
        players: state.players,
        reserveCents: state.reserveCents,
        yourBid: ownBid, // sealed bids of OTHERS never appear here
      };
    }
    // After reveal everything is public.
    return {
      phase: state.phase,
      players: state.players,
      reserveCents: state.reserveCents,
      bids: state.bids,
      winner: state.winner,
      paymentCents: state.paymentCents,
      revealOrder: state.revealOrder,
    };
  },

  payoffs(state): Map<Id, number> {
    if (state.phase !== "settled" || state.payoffsCents === null)
      throw new Error("payoffs() valid only in terminal (settled) state");
    return new Map(Object.entries(state.payoffsCents));
  },

  isTerminal(state): boolean {
    return state.phase === "settled";
  },
};

// Local rng import indirection keeps the module graph simple for tsc -b.
import { makeRng as makeRngLocal } from "./rng.js";
