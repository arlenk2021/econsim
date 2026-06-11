import { describe, expect, it } from "vitest";
import {
  Vickrey,
  VICKREY_SELLER,
  DoubleAuction,
  PublicGoods,
  PG_BANK,
  AllPay,
} from "../src/index.js";

describe("Vickrey edge cases (docs/mechanisms/vickrey.md)", () => {
  it("single bidder pays the reserve", () => {
    let s = Vickrey.init({ players: ["a"], reserveCents: 500, seed: 1 }, undefined as never);
    s = Vickrey.apply(s, "a", { type: "bid", cents: 900 }).state;
    s = Vickrey.apply(s, VICKREY_SELLER, { type: "reveal" }).state;
    expect(s.winner).toBe("a");
    expect(s.paymentCents).toBe(500);
  });

  it("no bids → no allocation, all payoffs zero", () => {
    let s = Vickrey.init({ players: ["a", "b"], seed: 1 }, undefined as never);
    s = Vickrey.apply(s, VICKREY_SELLER, { type: "reveal" }).state;
    expect(s.winner).toBeNull();
    expect([...Vickrey.payoffs(s).values()].every((v) => v === 0)).toBe(true);
  });

  it("bid below reserve → no allocation", () => {
    let s = Vickrey.init({ players: ["a"], reserveCents: 1000, seed: 1 }, undefined as never);
    s = Vickrey.apply(s, "a", { type: "bid", cents: 500 }).state;
    s = Vickrey.apply(s, VICKREY_SELLER, { type: "reveal" }).state;
    expect(s.winner).toBeNull();
  });

  it("view hides other bidders' sealed bids during collecting", () => {
    let s = Vickrey.init({ players: ["a", "b"], seed: 1 }, undefined as never);
    s = Vickrey.apply(s, "a", { type: "bid", cents: 300 }).state;
    s = Vickrey.apply(s, "b", { type: "bid", cents: 700 }).state;
    const viewA = Vickrey.view(s, "a") as { yourBid: number | null };
    expect(viewA.yourBid).toBe(300);
    expect(JSON.stringify(viewA)).not.toContain("700");
    const spec = Vickrey.view(s, "spectator");
    expect(JSON.stringify(spec)).not.toContain("700");
    expect(JSON.stringify(spec)).not.toContain("300");
  });

  it("rejects bids after reveal", () => {
    let s = Vickrey.init({ players: ["a"], seed: 1 }, undefined as never);
    s = Vickrey.apply(s, "a", { type: "bid", cents: 100 }).state;
    s = Vickrey.apply(s, VICKREY_SELLER, { type: "reveal" }).state;
    expect(Vickrey.validate(s, "a", { type: "bid", cents: 200 }).ok).toBe(false);
  });
});

describe("DoubleAuction basics", () => {
  it("clears at the midpoint when supply meets demand", () => {
    let s = DoubleAuction.init({ buyers: ["b0"], sellers: ["s0"], seed: 1 }, undefined as never);
    s = DoubleAuction.apply(s, "b0", { type: "order", priceCents: 1000 }).state;
    s = DoubleAuction.apply(s, "s0", { type: "order", priceCents: 800 }).state;
    s = DoubleAuction.apply(s, "__market__", { type: "clear" }).state;
    expect(s.clearingPriceCents).toBe(900);
    expect(s.matched.sort()).toEqual(["b0", "s0"]);
  });

  it("no trade when no buyer bid meets any ask", () => {
    let s = DoubleAuction.init({ buyers: ["b0"], sellers: ["s0"], seed: 1 }, undefined as never);
    s = DoubleAuction.apply(s, "b0", { type: "order", priceCents: 500 }).state;
    s = DoubleAuction.apply(s, "s0", { type: "order", priceCents: 900 }).state;
    s = DoubleAuction.apply(s, "__market__", { type: "clear" }).state;
    expect(s.clearingPriceCents).toBeNull();
    expect(s.matched).toEqual([]);
  });
});

describe("PublicGoods basics", () => {
  it("full contribution multiplies and redistributes", () => {
    let s = PublicGoods.init(
      { players: ["a", "b"], endowmentCents: 100, multiplierNum: 2, multiplierDen: 1, seed: 1 },
      undefined as never,
    );
    s = PublicGoods.apply(s, "a", { type: "contribute", cents: 100 }).state;
    s = PublicGoods.apply(s, "b", { type: "contribute", cents: 100 }).state;
    s = PublicGoods.apply(s, PG_BANK, { type: "settle" }).state;
    // total 200, grown 400, per player 200, net -100+200 = +100 each
    expect(PublicGoods.payoffs(s).get("a")).toBe(100);
    expect(PublicGoods.payoffs(s).get("b")).toBe(100);
  });
});

describe("AllPay basics", () => {
  it("all bidders pay, highest wins", () => {
    let s = AllPay.init({ players: ["a", "b"], seed: 1 }, undefined as never);
    s = AllPay.apply(s, "a", { type: "bid", cents: 300 }).state;
    s = AllPay.apply(s, "b", { type: "bid", cents: 700 }).state;
    s = AllPay.apply(s, "__seller__", { type: "reveal" }).state;
    expect(s.winner).toBe("b");
    expect(AllPay.payoffs(s).get("a")).toBe(-300);
    expect(AllPay.payoffs(s).get("b")).toBe(-700);
  });
});
