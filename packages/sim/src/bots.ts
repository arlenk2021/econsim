import type { SeededRng } from "@econsim/mechanisms";

/**
 * Bidder strategies for headless sims. Each takes the player's private
 * valuation (cents) and a seeded RNG and returns a bid in integer cents.
 * Pure — randomness only via the injected RNG.
 */
export type BidderStrategy = (valuationCents: number, rng: SeededRng) => number;

/** Bid exactly your value — the Vickrey dominant strategy. */
export const truthful: BidderStrategy = (v) => v;

/** Bid a uniform-random fraction [0, 1.5] of your value (over/underbidding). */
export const random: BidderStrategy = (v, rng) =>
  Math.round(v * (rng.next() * 1.5));

/** Shade down: bid 80% of value (sensible in first-price; suboptimal in Vickrey). */
export const shading: BidderStrategy = (v) => Math.round(v * 0.8);

/** Overbid by 20% — the classic lab over-bidding finding. */
export const overbid: BidderStrategy = (v) => Math.round(v * 1.2);

export const STRATEGIES: Record<string, BidderStrategy> = {
  truthful,
  random,
  shading,
  overbid,
};
