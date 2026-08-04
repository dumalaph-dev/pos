/**
 * Printer adapters (P3). Browsers can't open raw TCP sockets, so the
 * `network` adapter sends ESC/POS bytes through a tiny local WebSocket
 * bridge (`scripts/printer-bridge.mjs`) that forwards them to the printer
 * on ip:9100. `bluetooth` (Web Bluetooth) and `usb` (WebUSB) talk to the
 * printer directly. All adapters share one interface: print(bytes).
 */

export type PrinterTransport = "network" | "bluetooth" | "usb";

export type PrinterSettings = {
  transport: PrinterTransport;
  bridgeHost: string; // host where the local bridge runs (same LAN)
  bridgePort: number; // usually 8787
  ip: string; // network printer address
  port: number; // usually 9100
  paperWidth: 58 | 80;
};

const SETTINGS_KEY = "pos.printer.v1";
export const DEFAULT_BRIDGE_PORT = 8787;

export const DEFAULT_SETTINGS: PrinterSettings = {
  transport: "network",
  bridgeHost: "127.0.0.1",
  bridgePort: DEFAULT_BRIDGE_PORT,
  ip: "",
  port: 9100,
  paperWidth: 58,
};

function validPort(value: unknown, fallback: number): number {
  const port = typeof value === "number" ? value : Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

function normalizeSettings(value: unknown): PrinterSettings {
  const raw = typeof value === "object" && value !== null ? (value as Partial<PrinterSettings>) : {};
  return {
    ...DEFAULT_SETTINGS,
    transport: raw.transport === "bluetooth" || raw.transport === "usb" ? raw.transport : "network",
    bridgeHost: typeof raw.bridgeHost === "string" ? raw.bridgeHost.trim() : DEFAULT_SETTINGS.bridgeHost,
    bridgePort: validPort(raw.bridgePort, DEFAULT_BRIDGE_PORT),
    ip: typeof raw.ip === "string" ? raw.ip.trim() : DEFAULT_SETTINGS.ip,
    port: validPort(raw.port, DEFAULT_SETTINGS.port),
    paperWidth: raw.paperWidth === 80 ? 80 : 58,
  };
}

export function loadPrinterSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function savePrinterSettings(s: PrinterSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(s)));
}

export interface PrinterAdapter {
  print(bytes: Uint8Array): Promise<void>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* ── network (raw TCP :9100 via the local WebSocket bridge) ───────────── */

class NetworkAdapter implements PrinterAdapter {
  private bridgeHost: string;
  private bridgePort: number;
  private ip: string;
  private port: number;

  constructor(bridgeHost: string, bridgePort: number, ip: string, port: number) {
    this.bridgeHost = bridgeHost;
    this.bridgePort = bridgePort;
    this.ip = ip;
    this.port = port;
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.ip) throw new Error("Printer IP is not set");
    const bridgeHost = this.bridgeHost.trim().replace(/^wss?:\/\//i, "").replace(/\/+$/, "");
    if (!bridgeHost) throw new Error("Printer bridge host is not set");
    const hostForUrl = bridgeHost.includes(":") && !bridgeHost.startsWith("[") ? `[${bridgeHost}]` : bridgeHost;
    const bridgeUrl = `ws://${hostForUrl}:${this.bridgePort}`;
    const payload = JSON.stringify({
      type: "print",
      ip: this.ip,
      port: this.port,
      bytes: bytesToBase64(bytes),
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(bridgeUrl);
      const timer = setTimeout(() => {
        settleFailure("Printer bridge timed out — is the bridge running?");
      }, 8000);
      const closeSocket = () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeSocket();
        callback();
      };
      const settleFailure = (message: string) => settle(() => reject(new Error(message)));

      ws.onopen = () => ws.send(payload);
      ws.onmessage = (event) => {
        try {
          const result = JSON.parse(String(event.data)) as { ok?: boolean; error?: string };
          if (typeof result.ok !== "boolean") return;
          if (result.ok) settle(resolve);
          else settleFailure(result.error ?? "Print failed");
        } catch {
          settleFailure("Printer bridge returned an invalid response");
        }
      };
      ws.onerror = () => settleFailure(`Cannot reach the printer bridge (${bridgeUrl})`);
      ws.onclose = () => {
        if (!settled) settleFailure("Printer bridge closed before confirming the print");
      };
    });
  }
}

/* ── bluetooth (Web Bluetooth, ESC/POS over GATT) ─────────────────────── */

const BLE_SERVICES = [
  "0000ff00-0000-1000-8000-00805f9b34fb", // common vendor ESC/POS service
  "000018f0-0000-1000-8000-00805f9b34fb", // some 58mm printers
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // MPT/other
];

class BluetoothAdapter implements PrinterAdapter {
  private device: BluetoothDevice | null = null;

  async print(bytes: Uint8Array): Promise<void> {
    if (!navigator.bluetooth) throw new Error("Web Bluetooth is not supported on this device");
    if (!this.device) {
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_SERVICES,
      });
    }
    const server = await this.device.gatt?.connect();
    if (!server) throw new Error("Could not connect to printer");
    const service = await server.getPrimaryService(BLE_SERVICES[0]).catch(() =>
      server.getPrimaryService(BLE_SERVICES[1]).catch(() =>
        server.getPrimaryService(BLE_SERVICES[2]),
      ),
    );
    const characteristic = await service.getCharacteristics();
    const write = characteristic.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (!write) throw new Error("Printer has no writable characteristic");
    await write.writeValue(bytes);
    this.device.gatt?.disconnect();
    this.device = null;
  }
}

/* ── usb (WebUSB) ─────────────────────────────────────────────────────── */

class UsbAdapter implements PrinterAdapter {
  private device: USBDevice | null = null;

  async print(bytes: Uint8Array): Promise<void> {
    if (!navigator.usb) throw new Error("WebUSB is not supported on this device");
    if (!this.device) {
      this.device = await navigator.usb.requestDevice({ filters: [] });
      await this.device.open();
      await this.device.selectConfiguration(1);
      await this.device.claimInterface(0);
    }
    const iface = this.device.configuration?.interfaces[0];
    const endpoint = iface?.alternate.endpoints.find((e) => e.direction === "out");
    if (!endpoint) throw new Error("Printer has no OUT endpoint");
    await this.device.transferOut(endpoint.endpointNumber, bytes);
  }
}

export async function getPrinter(s: PrinterSettings): Promise<PrinterAdapter> {
  switch (s.transport) {
    case "network":
      return new NetworkAdapter(s.bridgeHost, validPort(s.bridgePort, DEFAULT_BRIDGE_PORT), s.ip, s.port);
    case "bluetooth":
      return new BluetoothAdapter();
    case "usb":
      return new UsbAdapter();
  }
}

/** Standard ESC/POS cash-drawer kick pulse (drawer connected to pin 2). */
const CASH_DRAWER_PULSE = Uint8Array.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

export async function openCashDrawer(s: PrinterSettings): Promise<void> {
  const printer = await getPrinter(s);
  await printer.print(CASH_DRAWER_PULSE);
}
