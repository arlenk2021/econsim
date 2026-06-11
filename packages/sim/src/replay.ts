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
  type Id,
} from "@econsim/mechanisms";

/**
 * A replay = (mechanism, config, action_log). Re-simulating it must reproduce
 * the exact event stream and terminal payoffs bit-for-bit (ADR-0002).
 *
 * The action log is a flat list of (playerId, action) records. We run each
 * action through the matching mechanism's apply() and collect every event.
 */

export interface ActionRecord {
  player: Id;
  action: unknown;
}

export interface Replay {
  mechanism: "vickrey" | "all-pay" | "double-auction" | "public-goods";
  config: Record<string, unknown>;
  log: ActionRecord[];
}

export interface ReplayResult {
  events: GameEvent[];
  payoffs: Array<[Id, number]>;
  terminal: boolean;
}

/** Stable stringify with sorted keys so two replays compare bit-for-bit. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      );
    }
    return v;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mechFor(name: Replay["mechanism"]): any {
  switch (name) {
    case "vickrey":
      return Vickrey;
    case "all-pay":
      return AllPay;
    case "double-auction":
      return DoubleAuction;
    case "public-goods":
      return PublicGoods;
  }
}

export function runReplay(replay: Replay): ReplayResult {
  const mech = mechFor(replay.mechanism);
  const seed = (replay.config.seed as number) ?? 0;
  let state = mech.init(replay.config, makeRng(seed));
  const events: GameEvent[] = [];
  for (const rec of replay.log) {
    const r = mech.apply(state, rec.player, rec.action);
    state = r.state;
    events.push(...r.events);
  }
  return {
    events,
    payoffs: mech.isTerminal(state)
      ? [...(mech.payoffs(state) as Map<Id, number>)]
      : [],
    terminal: mech.isTerminal(state),
  };
}

export const CLOSE_ACTORS: Record<Replay["mechanism"], Id> = {
  vickrey: VICKREY_SELLER,
  "all-pay": ALLPAY_SELLER,
  "double-auction": "__market__",
  "public-goods": PG_BANK,
};
