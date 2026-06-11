import type { GameEvent, Id, Mechanism, Ok, Rejection } from "./mechanism.js";

/**
 * Linear public-goods game (single round).
 * docs/mechanisms/public-goods.md.
 *
 * Each of n players gets an endowment `endowmentCents` and secretly contributes
 * c_i (0 <= c_i <= endowment) to a common pool. The pool is multiplied by the
 * MPCR-derived factor and split equally. Payoff_i = endowment - c_i +
 * (multiplier * Σ c) / n.
 *
 * To keep integer cents and exact conservation, the redistributed amount is
 * floor((multiplier * total) / n) per player, and the integer remainder is
 * burned (modeled as paid to a "__bank__" sink) so Σ payoffs is fully accounted.
 *
 * Free-riding (contribute 0) strictly dominates per-individual when multiplier
 * < n, while full contribution maximizes group welfare — the classic tension.
 */

export const BANK: Id = "__bank__";

export interface PGConfig {
  players: Id[];
  endowmentCents: number;
  /** Pool growth factor; with n players, 1 < multiplier < n => social dilemma.
   *  Provided as a rational m_num/m_den to keep arithmetic integer-exact. */
  multiplierNum: number;
  multiplierDen: number;
  seed: number;
}

export type PGPhase = "collecting" | "settled";

export interface PGState {
  phase: PGPhase;
  players: Id[];
  endowmentCents: number;
  multiplierNum: number;
  multiplierDen: number;
  seed: number;
  contributions: Record<Id, number>;
  payoffsCents: Record<Id, number> | null;
  publicReturnCents: number | null;
}

export type PGAction =
  | { type: "contribute"; cents: number }
  | { type: "settle" };

export const PublicGoods: Mechanism<PGState, PGAction, PGConfig> = {
  init(config) {
    return {
      phase: "collecting",
      players: config.players.slice(),
      endowmentCents: config.endowmentCents,
      multiplierNum: config.multiplierNum,
      multiplierDen: config.multiplierDen,
      seed: config.seed,
      contributions: {},
      payoffsCents: null,
      publicReturnCents: null,
    };
  },

  validate(state, playerId, action): Ok | Rejection {
    if (action.type === "contribute") {
      if (state.phase !== "collecting")
        return { ok: false, reason: "round is closed" };
      if (!state.players.includes(playerId))
        return { ok: false, reason: "not a participant" };
      if (!Number.isInteger(action.cents))
        return { ok: false, reason: "contribution must be integer cents" };
      if (action.cents < 0)
        return { ok: false, reason: "contribution must be >= 0" };
      if (action.cents > state.endowmentCents)
        return { ok: false, reason: "contribution exceeds endowment" };
      return { ok: true };
    }
    if (action.type === "settle") {
      if (state.phase !== "collecting")
        return { ok: false, reason: "already settled" };
      return { ok: true };
    }
    return { ok: false, reason: "unknown action" };
  },

  apply(state, playerId, action) {
    const check = this.validate(state, playerId, action);
    if (!check.ok) throw new Error(`invalid action: ${check.reason}`);

    if (action.type === "contribute") {
      const next: PGState = {
        ...state,
        contributions: { ...state.contributions, [playerId]: action.cents },
      };
      const events: GameEvent[] = [
        {
          type: "contributed",
          payload: { player: playerId, cents: action.cents },
          visibleTo: [playerId],
        },
        {
          type: "contribution_count",
          payload: { count: Object.keys(next.contributions).length },
          visibleTo: "all",
        },
      ];
      return { state: next, events };
    }

    // settle
    const n = state.players.length;
    const total = state.players.reduce(
      (acc, p) => acc + (state.contributions[p] ?? 0),
      0,
    );
    // grown = floor(multiplier * total); per-player share = floor(grown / n).
    const grown = Math.floor(
      (total * state.multiplierNum) / state.multiplierDen,
    );
    const perPlayer = Math.floor(grown / n);
    const remainder = grown - perPlayer * n;

    void remainder; // remainder of grown/n is burned, captured by the bank term
    const payoffsCents: Record<Id, number> = {};
    for (const p of state.players) {
      const c = state.contributions[p] ?? 0;
      // net change relative to endowment: -c (paid in) + perPlayer (received).
      payoffsCents[p] = -c + perPlayer;
    }
    // Conservation: Σ player payoffs = -total + perPlayer*n. The bank is the
    // explicit source/sink for money the multiplier creates (and the burned
    // remainder), so that Σ over ALL accounts (players + bank) == 0 exactly.
    payoffsCents[BANK] = total - perPlayer * n;

    const settled: PGState = {
      ...state,
      phase: "settled",
      payoffsCents,
      publicReturnCents: perPlayer,
    };

    const events: GameEvent[] = [
      {
        type: "settled",
        payload: {
          contributions: state.contributions,
          totalCents: total,
          perPlayerReturnCents: perPlayer,
        },
        visibleTo: "all",
      },
    ];
    return { state: settled, events };
  },

  onTimer(state, timer) {
    if (timer === "close" && state.phase === "collecting") {
      return this.apply(state, BANK, { type: "settle" });
    }
    return { state, events: [] };
  },

  view(state, viewer) {
    if (state.phase === "collecting") {
      const own =
        viewer !== "spectator" && viewer in state.contributions
          ? state.contributions[viewer]
          : null;
      return {
        phase: state.phase,
        contributionsPlaced: Object.keys(state.contributions).length,
        players: state.players,
        endowmentCents: state.endowmentCents,
        yourContribution: own,
      };
    }
    return {
      phase: state.phase,
      contributions: state.contributions,
      perPlayerReturnCents: state.publicReturnCents,
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
