#!/usr/bin/env node
/** Starts the room server (:4000) and the web client (:3000) together. */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(name, cmd, args, env) {
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = `[${name}]`;
  child.stdout.on("data", (d) => process.stdout.write(`${prefix} ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`${prefix} ${d}`));
  child.on("exit", (code) => {
    console.error(`${prefix} exited with ${code}`);
    process.exit(code ?? 1);
  });
  return child;
}

console.log("econsim dev — starting room server :4000 and web :3000\n");
run("server", "node", ["apps/server/src/index.ts"], { PORT: "4000" });
run("web", "node", ["apps/web/server.mjs"], {
  WEB_PORT: "3000",
  SERVER_URL: "http://localhost:4000",
});

process.on("SIGINT", () => process.exit(0));
