/**
 * Golden replay determinism (ADR-0002). Re-simulate each committed golden and
 * assert the event stream + payoffs reproduce bit-for-bit.
 *
 * If a mechanism change is intentional, regenerate with:
 *   node packages/sim/src/record-goldens.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GOLDEN_REPLAYS } from "../src/golden.ts";
import { canonical, runReplay } from "../src/replay.ts";

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(here, "golden");

describe("golden replays re-simulate bit-for-bit", () => {
  for (const name of Object.keys(GOLDEN_REPLAYS)) {
    it(`${name} reproduces its committed golden`, () => {
      const committed = readFileSync(join(goldenDir, `${name}.json`), "utf8").trim();
      const replay = GOLDEN_REPLAYS[name]!;
      const result = runReplay(replay);
      const regenerated = canonical({ replay, result });
      expect(regenerated).toBe(committed);
    });

    it(`${name} is internally deterministic across two runs`, () => {
      const replay = GOLDEN_REPLAYS[name]!;
      const a = canonical(runReplay(replay));
      const b = canonical(runReplay(replay));
      expect(a).toBe(b);
    });
  }
});
