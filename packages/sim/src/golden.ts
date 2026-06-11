import { CLOSE_ACTORS, type Replay } from "./replay.ts";

/**
 * Golden replay fixtures. Each is a fully-specified (mechanism, config, log).
 * The replay test re-simulates these and asserts bit-for-bit equality against
 * the committed golden JSON. Adding a mechanism? Add a golden here.
 */

function bidLog(
  players: string[],
  bids: number[],
  closeActor: string,
): Replay["log"] {
  const log = players.map((p, i) => ({
    player: p,
    action: { type: "bid", cents: bids[i]! },
  }));
  log.push({ player: closeActor, action: { type: "reveal" } as never });
  return log;
}

export const GOLDEN_REPLAYS: Record<string, Replay> = {
  "vickrey-4p": {
    mechanism: "vickrey",
    config: { players: ["alice", "bob", "carol", "dave"], reserveCents: 0, seed: 12345 },
    log: bidLog(
      ["alice", "bob", "carol", "dave"],
      [4200, 9100, 9100, 3300],
      CLOSE_ACTORS.vickrey,
    ),
  },
  "vickrey-reserve-tie": {
    mechanism: "vickrey",
    config: { players: ["p0", "p1", "p2"], reserveCents: 5000, seed: 777 },
    log: bidLog(["p0", "p1", "p2"], [5000, 5000, 1200], CLOSE_ACTORS.vickrey),
  },
  "all-pay-3p": {
    mechanism: "all-pay",
    config: { players: ["x", "y", "z"], seed: 42 },
    log: [
      { player: "x", action: { type: "bid", cents: 1500 } },
      { player: "y", action: { type: "bid", cents: 3000 } },
      { player: "z", action: { type: "bid", cents: 3000 } },
      { player: CLOSE_ACTORS["all-pay"], action: { type: "reveal" } },
    ],
  },
  "double-auction-call": {
    mechanism: "double-auction",
    config: { buyers: ["b0", "b1"], sellers: ["s0", "s1"], seed: 9 },
    log: [
      { player: "b0", action: { type: "order", priceCents: 1200 } },
      { player: "b1", action: { type: "order", priceCents: 900 } },
      { player: "s0", action: { type: "order", priceCents: 700 } },
      { player: "s1", action: { type: "order", priceCents: 1100 } },
      { player: CLOSE_ACTORS["double-auction"], action: { type: "clear" } },
    ],
  },
  "public-goods-dilemma": {
    mechanism: "public-goods",
    config: {
      players: ["a", "b", "c"],
      endowmentCents: 1000,
      multiplierNum: 2,
      multiplierDen: 1,
      seed: 55,
    },
    log: [
      { player: "a", action: { type: "contribute", cents: 1000 } },
      { player: "b", action: { type: "contribute", cents: 500 } },
      { player: "c", action: { type: "contribute", cents: 0 } },
      { player: CLOSE_ACTORS["public-goods"], action: { type: "settle" } },
    ],
  },
};
