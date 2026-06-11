import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { GameEvent } from "@econsim/mechanisms";
import {
  RoomManager,
  eventsVisibleTo,
  type MechanismName,
  type Room,
} from "./rooms.ts";

/**
 * econsim room server (:4000). Authoritative mechanism host (ADR-0002/0003).
 *
 * HTTP:
 *   POST /rooms              {mechanism, config}  -> {code}
 *   GET  /rooms/:code        -> {mechanism, terminal, seats}
 *   GET  /health            -> ok
 *
 * WebSocket (ws://host:4000):  JSON messages
 *   {t:"join", code, playerId}             -> {t:"joined", view}
 *   {t:"action", code, playerId, action}   -> {t:"ack"} | {t:"reject", reason}
 *   {t:"close", code}                      -> broadcast reveal/settle
 *  Server pushes: {t:"view", view}, {t:"event", event}, {t:"terminal", payoffs}
 *
 * Crucially: each socket only ever receives view(state, theirId) + events whose
 * visibleTo includes them. Other players' sealed bids never cross the wire.
 */

const PORT = Number(process.env.PORT ?? 4000);
const manager = new RoomManager();

interface Conn {
  ws: WebSocket;
  code?: string;
  playerId?: string;
}

const conns = new Set<Conn>();

function connsInRoom(code: string): Conn[] {
  return [...conns].filter((c) => c.code === code);
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** Push fresh personalized views to everyone in a room. */
function pushViews(room: Room): void {
  for (const c of connsInRoom(room.code)) {
    if (!c.playerId) continue;
    send(c.ws, { t: "view", view: manager.viewFor(room, c.playerId) });
  }
}

function broadcastEvents(room: Room, events: GameEvent[]): void {
  for (const c of connsInRoom(room.code)) {
    if (!c.playerId) continue;
    for (const e of eventsVisibleTo(events, c.playerId)) {
      send(c.ws, { t: "event", event: e });
    }
  }
}

function maybeTerminal(room: Room): void {
  if (manager.isTerminal(room)) {
    const payoffs = manager.payoffs(room);
    for (const c of connsInRoom(room.code)) {
      send(c.ws, { t: "terminal", payoffs });
    }
  }
}

const http = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: [...conns].length }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/rooms") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const { mechanism, config } = JSON.parse(body || "{}") as {
          mechanism: MechanismName;
          config: Record<string, unknown>;
        };
        const room = manager.create(mechanism, config ?? {});
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: room.code, mechanism: room.mechanism }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  const roomMatch = url.pathname.match(/^\/rooms\/([A-Za-z]{5})$/);
  if (req.method === "GET" && roomMatch) {
    const room = manager.get(roomMatch[1]!);
    if (!room) {
      res.writeHead(404).end(JSON.stringify({ error: "no such room" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        code: room.code,
        mechanism: room.mechanism,
        terminal: manager.isTerminal(room),
        seats: room.seats,
      }),
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

const wss = new WebSocketServer({ server: http });

wss.on("connection", (ws) => {
  const conn: Conn = { ws };
  conns.add(conn);

  ws.on("message", (raw) => {
    let msg: { t: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { t: "error", reason: "bad json" });
      return;
    }

    if (msg.t === "join") {
      const room = manager.get(String(msg.code));
      if (!room) {
        send(ws, { t: "error", reason: "no such room" });
        return;
      }
      conn.code = room.code;
      conn.playerId = String(msg.playerId);
      send(ws, {
        t: "joined",
        code: room.code,
        mechanism: room.mechanism,
        view: manager.viewFor(room, conn.playerId),
      });
      return;
    }

    if (msg.t === "action") {
      const room = manager.get(String(msg.code));
      if (!room || !conn.playerId) {
        send(ws, { t: "reject", reason: "not in a room" });
        return;
      }
      const result = manager.apply(room, conn.playerId, msg.action);
      if (!result.ok) {
        send(ws, { t: "reject", reason: result.reason });
        return;
      }
      send(ws, { t: "ack" });
      broadcastEvents(room, result.events);
      pushViews(room);
      maybeTerminal(room);
      return;
    }

    if (msg.t === "close") {
      const room = manager.get(String(msg.code));
      if (!room) {
        send(ws, { t: "error", reason: "no such room" });
        return;
      }
      const result = manager.close(room);
      if (!result.ok) {
        send(ws, { t: "reject", reason: result.reason });
        return;
      }
      broadcastEvents(room, result.events);
      pushViews(room);
      maybeTerminal(room);
      return;
    }

    send(ws, { t: "error", reason: `unknown message type: ${msg.t}` });
  });

  ws.on("close", () => conns.delete(conn));
});

http.listen(PORT, () => {
  console.log(`econsim room server listening on :${PORT} (http + ws)`);
});

export { manager };
