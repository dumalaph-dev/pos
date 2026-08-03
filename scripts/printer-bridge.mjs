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
const PRINTER_TIMEOUT_MS = Number(process.env.PRINTER_TIMEOUT_MS || 8000);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid BRIDGE_PORT: ${process.env.BRIDGE_PORT}`);
}
if (!Number.isInteger(PRINTER_TIMEOUT_MS) || PRINTER_TIMEOUT_MS < 100) {
  throw new Error(`Invalid PRINTER_TIMEOUT_MS: ${process.env.PRINTER_TIMEOUT_MS}`);
}

const wss = new WebSocketServer({ port: PORT });

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function parsePort(value, fallback = 9100) {
  const port = value == null || value === "" ? fallback : Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function parsePrintMessage(msg) {
  if (!msg || typeof msg !== "object") return { error: "message must be an object" };
  if (typeof msg.ip !== "string" || !msg.ip.trim() || msg.ip.length > 253) {
    return { error: "printer IP is required" };
  }
  const port = parsePort(msg.port);
  if (port === null) return { error: "printer port must be an integer from 1 to 65535" };
  if (typeof msg.bytes !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(msg.bytes) || msg.bytes.length % 4 !== 0) {
    return { error: "bytes must be base64" };
  }
  const buf = Buffer.from(msg.bytes, "base64");
  if (buf.length === 0) return { error: "empty payload" };
  if (buf.length > 2 * 1024 * 1024) return { error: "payload is too large" };
  return { ip: msg.ip.trim(), port, buf };
}

wss.on("connection", (ws) => {
  const sockets = new Set();

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { ok: false, error: "invalid JSON" });
      return;
    }
    if (!msg || typeof msg !== "object") {
      send(ws, { ok: false, error: "message must be an object" });
      return;
    }

    if (msg.type === "ping") {
      send(ws, { ok: true, type: "pong" });
      return;
    }

    if (msg.type === "print") {
      const parsed = parsePrintMessage(msg);
      if (parsed.error) {
        send(ws, { ok: false, error: parsed.error });
        return;
      }

      const sock = net.createConnection({ port: parsed.port, host: parsed.ip });
      sockets.add(sock);
      let replied = false;
      const reply = (message) => {
        if (replied) return;
        replied = true;
        sockets.delete(sock);
        send(ws, message);
      };

      sock.setTimeout(PRINTER_TIMEOUT_MS, () => {
        reply({ ok: false, error: `printer timed out after ${PRINTER_TIMEOUT_MS}ms` });
        sock.destroy();
      });
      sock.once("connect", () => {
        // `end`'s callback fires after the complete ESC/POS payload is handed
        // to the socket, without waiting for printers that keep TCP open.
        sock.end(parsed.buf, () => reply({ ok: true }));
      });
      sock.once("error", (e) => {
        reply({ ok: false, error: `printer unreachable: ${e.message}` });
      });
      sock.once("close", () => {
        if (!replied) reply({ ok: false, error: "printer closed before accepting the print" });
      });
      return;
    }

    send(ws, { ok: false, error: `unknown type: ${msg.type}` });
  });

  ws.on("close", () => {
    for (const sock of sockets) sock.destroy();
    sockets.clear();
  });
});

wss.on("error", (error) => console.error(`printer bridge error: ${error.message}`));
console.log(`printer bridge listening on ws://0.0.0.0:${PORT}`);
