import { describe, expect, it } from "vitest";
import { makeRng } from "../src/index.js";

describe("SeededRng (xoshiro256**)", () => {
  it("is deterministic for a fixed seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces floats in [0, 1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("different seeds produce different streams", () => {
    const a = makeRng(1).next();
    const b = makeRng(2).next();
    expect(a).not.toBe(b);
  });

  it("fork derives independent, deterministic substreams", () => {
    const base = makeRng(99);
    const f1 = base.fork("alice").next();
    const f1again = makeRng(99).fork("alice").next();
    const f2 = base.fork("bob").next();
    expect(f1).toBe(f1again);
    expect(f1).not.toBe(f2);
  });
});
