/* econsim browser client. Connects to the room server, places bids, and
   overlays the theoretical prediction on actual play. Pure vanilla JS. */

const SERVER = window.ECONSIM_SERVER || "http://localhost:4000";
const WS_URL = SERVER.replace(/^http/, "ws");

const $ = (id) => document.getElementById(id);
let ws = null;
let myId = null;
let myCode = null;
let myMech = null;
let myBid = null;
const history = []; // {theory, actual} per completed round for the chart

function setStatus(msg) { $("status").textContent = msg; }

$("createBtn").onclick = async () => {
  const mechanism = $("mech").value;
  const players = $("players").value.split(",").map((s) => s.trim()).filter(Boolean);
  const config = { players, seed: Math.floor(Math.random() * 1e9) };
  const res = await fetch(`${SERVER}/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mechanism, config }),
  });
  const { code } = await res.json();
  $("createOut").textContent = `room created → code ${code}`;
  $("code").value = code;
};

$("joinBtn").onclick = () => {
  myId = $("me").value.trim();
  myCode = $("code").value.trim().toUpperCase();
  ws = new WebSocket(WS_URL);
  ws.onopen = () => ws.send(JSON.stringify({ t: "join", code: myCode, playerId: myId }));
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => setStatus("disconnected");
};

$("bidBtn").onclick = () => {
  const cents = parseInt($("bid").value, 10);
  myBid = cents;
  const action =
    myMech === "public-goods" ? { type: "contribute", cents } : { type: "bid", cents };
  ws.send(JSON.stringify({ t: "action", code: myCode, playerId: myId, action }));
};

$("closeBtn").onclick = () => ws.send(JSON.stringify({ t: "close", code: myCode }));

function handle(msg) {
  switch (msg.t) {
    case "joined":
      myMech = msg.mechanism;
      $("join").classList.add("hidden");
      $("create").classList.add("hidden");
      $("play").classList.remove("hidden");
      $("chartCard").classList.remove("hidden");
      $("roomCode").textContent = msg.code;
      $("roomMech").textContent = msg.mechanism;
      renderView(msg.view);
      break;
    case "view":
      renderView(msg.view);
      break;
    case "ack":
      setStatus("bid accepted (sealed)");
      break;
    case "reject":
      setStatus("rejected: " + msg.reason);
      break;
    case "event":
      if (msg.event.type === "revealed" || msg.event.type === "settled") {
        setStatus("round revealed");
      }
      break;
    case "terminal":
      onTerminal(msg.payoffs);
      break;
    case "error":
      setStatus("error: " + msg.reason);
      break;
  }
}

function renderView(view) {
  $("state").textContent = JSON.stringify(view, null, 2);
}

function onTerminal(payoffs) {
  const map = new Map(payoffs);
  const mine = map.get(myId) ?? 0;
  $("payoffs").textContent =
    "payoffs (cents): " + payoffs.map(([id, c]) => `${id}=${c}`).join("  ");

  // Theoretical prediction overlay:
  //  - Vickrey: under truthful play your bid IS your value, surplus = value - price.
  //    Theory point = your bid; actual = -payoff to seller side i.e. price paid.
  let theory = myBid ?? 0;
  let actual = myBid ?? 0;
  if (myMech === "vickrey") {
    // theory: pay the second price; actual: what you actually paid (=-mine if won)
    const sellerReceipt = map.get("__seller__") ?? 0;
    theory = sellerReceipt; // predicted revenue = 2nd-highest valuation
    actual = mine < 0 ? -mine : sellerReceipt; // what the winner paid
  }
  history.push({ theory, actual, label: `r${history.length + 1}` });
  drawChart();
  setStatus(`terminal · your payoff ${mine}¢`);
}

function drawChart() {
  const c = $("chart");
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  const pad = 32;
  const w = c.width - pad * 2;
  const h = c.height - pad * 2;
  const max = Math.max(1, ...history.flatMap((p) => [p.theory, p.actual]));
  // axes
  ctx.strokeStyle = "#3a3f52";
  ctx.beginPath();
  ctx.moveTo(pad, pad); ctx.lineTo(pad, pad + h); ctx.lineTo(pad + w, pad + h);
  ctx.stroke();
  const x = (i) => pad + (history.length <= 1 ? w / 2 : (i / (history.length - 1)) * w);
  const y = (v) => pad + h - (v / max) * h;
  const line = (key, color) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach((p, i) => {
      const px = x(i), py = y(p[key]);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    history.forEach((p, i) => { ctx.beginPath(); ctx.arc(x(i), y(p[key]), 3, 0, 7); ctx.fill(); });
  };
  line("theory", "#ffb454");
  line("actual", "#4ec9b0");
}
