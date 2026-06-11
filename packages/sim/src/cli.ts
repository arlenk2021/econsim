#!/usr/bin/env node
import { runSim, type SimOptions } from "./runner.ts";

/**
 * Headless sim CLI. Same mechanism code as the live server (ADR-0002).
 *
 *   pnpm sim vickrey --players 100 --rounds 1000
 *   pnpm sim double-auction --players 50 --rounds 500 --strategy mixed
 */

const MECHANISMS = new Set([
  "vickrey",
  "all-pay",
  "double-auction",
  "public-goods",
]);

function parseArgs(rawArgv: string[]): SimOptions {
  // pnpm forwarding can inject a leading "--"; drop it.
  const argv = rawArgv[0] === "--" ? rawArgv.slice(1) : rawArgv;
  const [mechanism, ...rest] = argv;
  if (!mechanism || !MECHANISMS.has(mechanism)) {
    console.error(
      `usage: sim <${[...MECHANISMS].join("|")}> [--players N] [--rounds N] [--seed N] [--strategy truthful|random|shading|overbid|mixed] [--max-value CENTS]`,
    );
    process.exit(1);
  }
  const opts: SimOptions = {
    mechanism: mechanism as SimOptions["mechanism"],
    players: 100,
    rounds: 1000,
    seed: 1,
    strategy: "truthful",
    maxValueCents: 100_00,
  };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const val = rest[i + 1];
    if (val === undefined) break;
    switch (flag) {
      case "--players":
        opts.players = parseInt(val, 10);
        break;
      case "--rounds":
        opts.rounds = parseInt(val, 10);
        break;
      case "--seed":
        opts.seed = parseInt(val, 10);
        break;
      case "--strategy":
        opts.strategy = val;
        break;
      case "--max-value":
        opts.maxValueCents = parseInt(val, 10);
        break;
      default:
        console.error(`unknown flag: ${flag}`);
        process.exit(1);
    }
  }
  return opts;
}

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const start = performance.now();
  const { summary } = runSim(opts);
  const elapsed = performance.now() - start;

  console.log(`\n  econsim headless · ${summary.mechanism}`);
  console.log(`  ${"─".repeat(48)}`);
  console.log(`  players              ${summary.players}`);
  console.log(`  rounds               ${summary.rounds}`);
  console.log(`  seed                 ${summary.seed}`);
  console.log(`  strategy             ${summary.strategy}`);
  console.log(`  ${"─".repeat(48)}`);
  console.log(`  mean revenue         ${fmtCents(summary.meanRevenueCents)}`);
  console.log(
    `  mean efficiency      ${(summary.meanEfficiency * 100).toFixed(1)}%`,
  );
  console.log(
    `  mean truthful regret ${fmtCents(summary.meanTruthfulnessRegretCents)}`,
  );
  console.log(`  events processed     ${summary.eventCount}`);
  console.log(
    `  ${"─".repeat(48)}\n  done in ${elapsed.toFixed(0)}ms\n`,
  );
}

main();
