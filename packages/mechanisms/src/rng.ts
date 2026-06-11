import type { SeededRng } from "./mechanism.js";

/**
 * Deterministic seeded RNG. NO Math.random, NO Date.now — purity lint enforces.
 *
 * Hashing: splitmix64. Stream: xoshiro256** (Blackman & Vigna). All arithmetic
 * is done in BigInt mod 2^64 so results are identical across platforms.
 *
 * `next()` returns a float in [0, 1). `fork(label)` derives an independent,
 * deterministic substream by mixing the label into the seed — so a mechanism
 * can hand each player/round its own stream without correlation.
 */

const MASK64 = (1n << 64n) - 1n;

function splitmix64(seed: bigint): () => bigint {
  let z = seed & MASK64;
  return () => {
    z = (z + 0x9e3779b97f4a7c15n) & MASK64;
    let x = z;
    x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    x = x ^ (x >> 31n);
    return x & MASK64;
  };
}

function rotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

/** FNV-1a 64-bit string hash — used to fold a fork label into the seed. */
function hashLabel(label: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < label.length; i++) {
    h ^= BigInt(label.charCodeAt(i));
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h;
}

export class Xoshiro256 implements SeededRng {
  private s: [bigint, bigint, bigint, bigint];
  private readonly seed: bigint;

  constructor(seed: bigint) {
    this.seed = seed & MASK64;
    const sm = splitmix64(this.seed);
    this.s = [sm(), sm(), sm(), sm()];
  }

  /** Raw 64-bit step (xoshiro256**). */
  private nextU64(): bigint {
    const [s0, s1, s2, s3] = this.s;
    const result = (rotl((s1 * 5n) & MASK64, 7n) * 9n) & MASK64;
    const t = (s1 << 17n) & MASK64;
    let n2 = s2 ^ s0;
    let n3 = s3 ^ s1;
    const n1 = s1 ^ n2;
    const n0 = s0 ^ n3;
    n2 = n2 ^ t;
    n3 = rotl(n3, 45n);
    this.s = [n0, n1, n2, n3];
    return result;
  }

  /** Float in [0, 1) with 53 bits of entropy. */
  next(): number {
    const bits = this.nextU64() >> 11n; // top 53 bits
    return Number(bits) / 2 ** 53;
  }

  /** Integer in [0, n) via rejection-free multiply-shift (n must be < 2^32). */
  nextInt(n: number): number {
    if (n <= 0) throw new Error("nextInt bound must be positive");
    return Math.floor(this.next() * n);
  }

  fork(label: string): SeededRng {
    return new Xoshiro256((this.seed ^ hashLabel(label)) & MASK64);
  }
}

/** Construct a SeededRng from a number or bigint seed. */
export function makeRng(seed: number | bigint): SeededRng {
  return new Xoshiro256(typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed)));
}
