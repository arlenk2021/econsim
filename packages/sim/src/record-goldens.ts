#!/usr/bin/env node
/**
 * Record golden replays to packages/sim/test/golden/*.json.
 * Run once to (re)generate; the replay test then re-simulates and asserts
 * bit-for-bit equality. Commit the output.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GOLDEN_REPLAYS } from "./golden.ts";
import { canonical, runReplay } from "./replay.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "test", "golden");
mkdirSync(outDir, { recursive: true });

for (const [name, replay] of Object.entries(GOLDEN_REPLAYS)) {
  const result = runReplay(replay);
  const golden = { replay, result };
  const file = join(outDir, `${name}.json`);
  writeFileSync(file, canonical(golden) + "\n", "utf8");
  console.log(`wrote ${file} (${result.events.length} events, terminal=${result.terminal})`);
}
