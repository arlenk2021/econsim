import { defineConfig } from "vitest/config";

// Suite is selected via VITEST_SUITE env: unit | properties | replays.
// Each pnpm script sets it; default runs unit.
const suite = process.env.VITEST_SUITE ?? "unit";

const includeBySuite: Record<string, string[]> = {
  unit: ["packages/**/test/**/*.test.ts"],
  properties: ["packages/**/test/**/*.properties.ts"],
  replays: ["packages/**/test/**/*.replays.ts"],
};

export default defineConfig({
  test: {
    include: includeBySuite[suite] ?? includeBySuite.unit,
    testTimeout: suite === "properties" ? 180_000 : 20_000,
  },
});
