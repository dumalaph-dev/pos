/**
 * Printer bridge (P3) — tiny local WebSocket → raw TCP gateway.
 *
 * Browsers cannot open raw TCP sockets, so this bridges the PWA to the
 * ESC/POS printer on the LAN. Run it on any always-on device on the same
 * network as the printer (the store PC / tablet):
 *
 *   node scripts/printer-bridge.mjs            # listens on ws://0.0.0.0:8787
 *
 * Messages: {"type":"print","ip":"192.168.1.50","port":9100,"bytes":"<b64>"}
 *           {"type":"ping"}
 * Replies:  {"ok":true} | {"ok":false,"error":"..."}
 */
import { WebSocketServer } from "ws";
import net from "node:net";

const PORT = Number(process.env.BRIDGE_PORT || 8787);
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ ok: false, error: "invalid JSON" }));
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ ok: true, type: "pong" }));
      return;
    }

    if (msg.type === "print") {
      const buf = Buffer.from(msg.bytes || "", "base64");
      if (buf.length === 0) {
        ws.send(JSON.stringify({ ok: false, error: "empty payload" }));
        return;
      }
      const sock = net.connect(msg.port || 9100, msg.ip, () => {
        sock.write(buf, () => sock.end());
      });
      sock.on("error", (e) => {
        ws.send(JSON.stringify({ ok: false, error: `printer unreachable: ${e.message}` }));
      });
      sock.on("close", () => {
        ws.send(JSON.stringify({ ok: true }));
      });
      return;
    }

    ws.send(JSON.stringify({ ok: false, error: `unknown type: ${msg.type}` }));
  });
});

console.log(`printer bridge listening on ws://0.0.0.0:${PORT}`);
