import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Minimal static file server for the econsim browser client (:3000). */
const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WEB_PORT ?? 3000);
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:4000";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

createServer(async (req, res) => {
  let path = new URL(req.url ?? "/", `http://x`).pathname;
  if (path === "/") path = "/index.html";
  // expose the room-server URL to the client without hardcoding
  if (path === "/config.js") {
    res.writeHead(200, { "content-type": MIME[".js"] });
    res.end(`window.ECONSIM_SERVER = ${JSON.stringify(SERVER_URL)};`);
    return;
  }
  try {
    const file = await readFile(join(here, "public", path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, () => {
  console.log(`econsim web client on http://localhost:${PORT} (room server ${SERVER_URL})`);
});
