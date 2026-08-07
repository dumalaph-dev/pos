/**
 * Store-printer validation (P3).
 *
 * Real printer:
 *   node --experimental-strip-types scripts/validate-printer.mjs --printer-ip 192.168.1.50
 *
 * Repeatable local path, including a forced failure followed by a retry:
 *   npm run printer:validate:mock
 *
 * The command starts a local bridge automatically when the bridge host is a
 * loopback address and no bridge is already listening. A real-printer pass
 * proves that the bridge accepted the ESC/POS payload over TCP; the paper
 * still needs to be observed at the store.
 */
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildReceipt } from "../src/lib/receipt.ts";
import { getPrinter } from "../src/lib/printer.ts";
import { parsePaperWidth as parseConfiguredPaperWidth } from "../src/lib/paper-width.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const DEFAULT_BRIDGE_PORT = 8787;
const DEFAULT_PRINTER_PORT = 9100;
const MAX_PRINT_MS = 3000;

function usage() {
  console.log(`Usage:
  node --experimental-strip-types scripts/validate-printer.mjs --printer-ip <ip> [options]
  npm run printer:validate:mock

Options:
  --bridge-host <host>   Bridge host (default: BRIDGE_HOST or 127.0.0.1)
  --bridge-port <port>   Bridge WebSocket port (default: BRIDGE_PORT or 8787)
  --printer-port <port>  Printer TCP port (default: PRINTER_PORT or 9100)
  --paper-width <52|58|80>  Receipt width (default: PAPER_WIDTH or 80)
  --store-name <name>    Header printed on the validation slip
  --skip-retry           Skip the local forced-failure/retry check
  --no-start-bridge      Do not start a local bridge automatically
  --help                 Show this help

Environment equivalents: PRINTER_IP, BRIDGE_HOST, BRIDGE_PORT,
PRINTER_PORT, and PAPER_WIDTH.`);
}

function parseArgs(argv) {
  const options = { flags: new Set(), values: {} };
  const valueFlags = new Set([
    "--bridge-host",
    "--bridge-port",
    "--printer-ip",
    "--printer-port",
    "--paper-width",
    "--store-name",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      options.flags.add(arg);
      continue;
    }
    if (valueFlags.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      options.values[arg] = value;
      index += 1;
      continue;
    }
    if (arg === "--mock" || arg === "--skip-retry" || arg === "--no-start-bridge") {
      options.flags.add(arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function option(options, flag, environment, fallback = undefined) {
  return options.values[flag] ?? process.env[environment] ?? fallback;
}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer from 1 to 65535`);
  }
  return port;
}

function parsePaperWidth(value) {
  const parsed = parseConfiguredPaperWidth(value);
  if (parsed === null) throw new Error("paper width must be 52, 58, or 80");
  return parsed;
}

function isLoopback(host) {
  const normalized = host.trim().replace(/^wss?:\/\//i, "").replace(/^\[|\]$/g, "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function bridgeUrl(host, port) {
  const normalized = host.trim().replace(/^wss?:\/\//i, "").replace(/\/+$/, "");
  if (!normalized) throw new Error("bridge host is required");
  const urlHost = normalized.includes(":") && !normalized.startsWith("[") ? `[${normalized}]` : normalized;
  return `ws://${urlHost}:${port}`;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function pingBridge(url, timeoutMs = 750) {
  return new Promise((resolvePing, rejectPing) => {
    let settled = false;
    let socket;
    const timer = setTimeout(() => finish(new Error(`bridge did not answer ${url}`)), timeoutMs);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // The socket may already be closed.
      }
      if (error) rejectPing(error);
      else resolvePing();
    };

    try {
      socket = new WebSocket(url);
      socket.onopen = () => socket.send(JSON.stringify({ type: "ping" }));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.ok && message.type === "pong") finish();
        } catch {
          finish(new Error("bridge returned invalid ping data"));
        }
      };
      socket.onerror = () => finish(new Error(`cannot reach bridge at ${url}`));
      socket.onclose = () => {
        if (!settled) finish(new Error(`bridge closed before answering ${url}`));
      };
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function waitForBridge(url, attempts = 16) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await pingBridge(url);
      return;
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }
  throw lastError ?? new Error(`bridge is not available at ${url}`);
}

async function ensureBridge({ host, port, start }) {
  const url = bridgeUrl(host, port);
  try {
    await pingBridge(url);
    console.log(`PASS bridge reachable at ${url}`);
    return null;
  } catch {
    if (!start) throw new Error(`bridge is not reachable at ${url}; start scripts/printer-bridge.mjs first`);
    if (!isLoopback(host)) throw new Error("--start-bridge is only supported for a loopback bridge host");
  }

  const child = spawn(process.execPath, [resolve(SCRIPT_DIR, "printer-bridge.mjs")], {
    cwd: ROOT_DIR,
    env: { ...process.env, BRIDGE_PORT: String(port) },
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("error", () => undefined);
  try {
    await waitForBridge(url);
  } catch (error) {
    child.kill();
    throw error;
  }
  console.log(`PASS started local bridge at ${url}`);
  return child;
}

function listenCapture(port = 0) {
  return new Promise((resolveCapture, rejectCapture) => {
    const chunks = [];
    const server = net.createServer((socket) => {
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("error", () => undefined);
    });
    server.once("error", rejectCapture);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolveCapture({
        port: typeof address === "object" && address ? address.port : port,
        bytes: () => Buffer.concat(chunks),
        server,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => {
    if (!server.listening) {
      resolveClose();
      return;
    }
    server.close(() => resolveClose());
  });
}

function buildValidationReceipt(paperWidth, storeName) {
  return buildReceipt({
    storeName,
    storeAddress: "LAN printer validation",
    orderNo: "PRINTER-TEST",
    cashier: "Validation",
    createdAt: new Date("2026-08-03T10:00:00+08:00"),
    items: [
      { name: "Whole Lechon", qty: 1, weightKg: null, lineTotal: 295000 },
      { name: "Lechon Per Kilo", qty: 1, weightKg: 1.35, lineTotal: 114750 },
    ],
    subtotal: 409750,
    discountAmount: 0,
    discountRef: null,
    vatableSale: 365848,
    vatAmount: 43902,
    vatExemptSale: 0,
    total: 409750,
    paymentMethod: "cash",
    paymentRef: null,
    amountTendered: 500000,
    changeDue: 90250,
    officialReceipt: false,
    paperWidth,
  });
}

async function print(settings, receipt) {
  const started = performance.now();
  const printer = await getPrinter(settings);
  await printer.print(receipt);
  return performance.now() - started;
}

function assertCapturedReceipt(received, expected) {
  const text = received.toString("latin1");
  const searchableText = text.replace(/\s+/g, " ");
  const checks = [
    ["payload is non-empty", received.length > 0],
    ["payload matches the receipt bytes", Buffer.compare(received, Buffer.from(expected)) === 0],
    ["init ESC @", received[0] === 0x1b && received[1] === 0x40],
    ["partial cut GS V 66", received.at(-3) === 0x1d && received.at(-2) === 0x56 && received.at(-1) === 0x66],
    ["validation order number", text.includes("PRINTER-TEST")],
    ["weight line", text.includes("1.35 kg")],
    ["VAT line", text.includes("VAT (12%)")],
    ["not-official line", searchableText.includes("THIS IS NOT AN OFFICIAL RECEIPT")],
  ];
  let failed = 0;
  for (const [label, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
    if (!passed) failed += 1;
  }
  if (failed > 0) throw new Error(`${failed} captured receipt assertion(s) failed`);
}

async function runRetryCheck(baseSettings, receipt) {
  if (!isLoopback(baseSettings.bridgeHost)) {
    console.log("SKIP failure/retry check: bridge host is remote; run the mock check on the bridge device");
    return;
  }

  const reserved = await listenCapture();
  const failurePort = reserved.port;
  await closeServer(reserved.server);
  const retrySettings = { ...baseSettings, ip: "127.0.0.1", port: failurePort };
  let failedAsExpected = false;
  try {
    await print(retrySettings, receipt);
  } catch (error) {
    failedAsExpected = true;
    console.log(`PASS unreachable printer is reported: ${error.message}`);
  }
  if (!failedAsExpected) throw new Error("unreachable printer unexpectedly succeeded");

  const capture = await listenCapture(failurePort);
  try {
    const elapsed = await print(retrySettings, receipt);
    await delay(25);
    assertCapturedReceipt(capture.bytes(), receipt);
    if (elapsed > MAX_PRINT_MS) throw new Error(`retry took ${Math.round(elapsed)}ms; expected <= ${MAX_PRINT_MS}ms`);
    console.log(`PASS retry delivered ${receipt.length} bytes in ${Math.round(elapsed)}ms`);
  } finally {
    await closeServer(capture.server);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.flags.has("--help")) {
    usage();
    return;
  }

  const mock = options.flags.has("--mock") || process.env.PRINTER_MOCK === "1";
  const bridgeHost = option(options, "--bridge-host", "BRIDGE_HOST", "127.0.0.1");
  const bridgePort = parsePort(option(options, "--bridge-port", "BRIDGE_PORT", String(DEFAULT_BRIDGE_PORT)), "bridge port");
  const printerPort = parsePort(option(options, "--printer-port", "PRINTER_PORT", String(DEFAULT_PRINTER_PORT)), "printer port");
  const paperWidth = parsePaperWidth(option(options, "--paper-width", "PAPER_WIDTH", "80"));
  const printerIp = option(options, "--printer-ip", "PRINTER_IP", "");
  const storeName = option(options, "--store-name", "STORE_NAME", "Dumala POS");
  const skipRetry = options.flags.has("--skip-retry") || process.env.SKIP_PRINTER_RETRY === "1";
  const startBridge = !options.flags.has("--no-start-bridge") && (options.flags.has("--start-bridge") || isLoopback(bridgeHost));

  if (!mock && !printerIp) throw new Error("--printer-ip or PRINTER_IP is required (use --mock for the local path)");
  if (mock && !isLoopback(bridgeHost)) throw new Error("--mock requires a loopback bridge host");

  const bridgeChild = await ensureBridge({ host: bridgeHost, port: bridgePort, start: startBridge });
  let capture;
  try {
    const receipt = buildValidationReceipt(paperWidth, storeName);
    const settings = {
      transport: "network",
      bridgeHost,
      bridgePort,
      ip: mock ? "127.0.0.1" : printerIp,
      port: mock ? (capture = await listenCapture()).port : printerPort,
      paperWidth,
    };

    const elapsed = await print(settings, receipt);
    if (elapsed > MAX_PRINT_MS) throw new Error(`network print took ${Math.round(elapsed)}ms; expected <= ${MAX_PRINT_MS}ms`);
    console.log(`PASS network print acknowledged ${receipt.length} bytes in ${Math.round(elapsed)}ms`);

    if (capture) {
      await delay(25);
      assertCapturedReceipt(capture.bytes(), receipt);
    } else {
      console.log("ACTION observe the physical slip: store header, PRINTER-TEST, VAT, total, and non-official notice");
    }

    if (skipRetry) console.log("SKIP failure/retry check by request");
    else await runRetryCheck(settings, receipt);
    console.log("PASS printer validation complete");
  } finally {
    if (capture) await closeServer(capture.server);
    if (bridgeChild && !bridgeChild.killed) bridgeChild.kill();
  }
}

main().catch((error) => {
  console.error(`FAIL printer validation: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
