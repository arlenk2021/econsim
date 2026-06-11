#!/usr/bin/env node
/**
 * Purity lint: the mechanisms package is the thesis — it must contain NO
 * ambient nondeterminism. Fails CI if Date.now / Math.random / new Date() /
 * performance.now / crypto.random* appear anywhere under packages/mechanisms/src.
 *
 * Grep-based on purpose: dead simple, no config, impossible to silently disable.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = join(root, "packages", "mechanisms", "src");

const FORBIDDEN = [
  /\bMath\s*\.\s*random\b/,
  /\bDate\s*\.\s*now\b/,
  /\bnew\s+Date\b/,
  /\bperformance\s*\.\s*now\b/,
  /\bcrypto\s*\.\s*(getRandomValues|randomBytes|randomUUID|randomInt)\b/,
  /\bprocess\s*\.\s*hrtime\b/,
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

let violations = 0;
for (const file of walk(target)) {
  const src = readFileSync(file, "utf8");
  // Strip block comments wholesale (handles multi-line JSDoc), then line comments.
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  const rawLines = src.split("\n");
  const lines = noBlocks.split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    for (const re of FORBIDDEN) {
      if (re.test(code)) {
        console.error(
          `PURITY VIOLATION ${relative(root, file)}:${i + 1}: ${rawLines[i].trim()}`,
        );
        violations++;
      }
    }
  });
}

if (violations > 0) {
  console.error(
    `\n${violations} purity violation(s). Mechanisms must use only the injected SeededRng.`,
  );
  process.exit(1);
}
console.log("lint:purity OK — no ambient nondeterminism under packages/mechanisms/src");
