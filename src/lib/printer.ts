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
  bridgeHost: string; // ws://<host>:8787 — where the bridge runs (same LAN)
  ip: string; // network printer address
  port: number; // usually 9100
  paperWidth: 58 | 80;
};

const SETTINGS_KEY = "pos.printer.v1";
const BRIDGE_PORT = 8787;

export const DEFAULT_SETTINGS: PrinterSettings = {
  transport: "network",
  bridgeHost: "127.0.0.1",
  ip: "",
  port: 9100,
  paperWidth: 58,
};

export function loadPrinterSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function savePrinterSettings(s: PrinterSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
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
  private ip: string;
  private port: number;

  constructor(bridgeHost: string, ip: string, port: number) {
    this.bridgeHost = bridgeHost;
    this.ip = ip;
    this.port = port;
  }

  async print(bytes: Uint8Array): Promise<void> {
    if (!this.ip) throw new Error("Printer IP is not set");
    const ws = new WebSocket(`ws://${this.bridgeHost}:${BRIDGE_PORT}`);
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Printer bridge timed out — is the bridge running?"));
      }, 8000);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "print",
            ip: this.ip,
            port: this.port,
            bytes: bytesToBase64(bytes),
          }),
        );
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          clearTimeout(timer);
          resolve(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`Cannot reach the printer bridge (ws://${this.bridgeHost}:${BRIDGE_PORT})`));
      };
      ws.onclose = () => clearTimeout(timer);
    });
    ws.close();
    if (!result.ok) throw new Error(result.error ?? "Print failed");
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
      return new NetworkAdapter(s.bridgeHost, s.ip, s.port);
    case "bluetooth":
      return new BluetoothAdapter();
    case "usb":
      return new UsbAdapter();
  }
}
