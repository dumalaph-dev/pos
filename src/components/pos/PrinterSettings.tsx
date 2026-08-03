"use client";

/**
 * Per-tablet printer settings (P3). Transport + connection + paper width.
 * Saved to localStorage (source of truth on the device); admins also push
 * the row to the `devices` table so settings follow the tablet.
 */
import { useState } from "react";
import {
  getPrinter,
  type PrinterSettings,
  type PrinterTransport,
} from "@/lib/printer";
import { buildReceipt } from "@/lib/receipt";

export default function PrinterSettingsModal({
  initial,
  storeName,
  onSave,
  onClose,
  onToast,
}: {
  initial: PrinterSettings;
  storeName: string;
  onSave: (s: PrinterSettings) => Promise<void>;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [form, setForm] = useState<PrinterSettings>({ ...initial });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PrinterSettings>(k: K, v: PrinterSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const testPrint = async () => {
    setTesting(true);
    try {
      const receipt = buildReceipt({
        storeName,
        orderNo: "TEST-PRINT",
        cashier: "",
        createdAt: new Date(),
        items: [{ name: "Printer test line", qty: 1, weightKg: null, lineTotal: 100 }],
        subtotal: 100,
        discountAmount: 0,
        vatableSale: 89,
        vatAmount: 11,
        vatExemptSale: 0,
        total: 100,
        paymentMethod: "cash",
        amountTendered: 100,
        changeDue: 0,
        paperWidth: form.paperWidth,
      });
      const printer = await getPrinter(form);
      await printer.print(receipt);
      onToast("✓ Test page printed");
    } catch (e) {
      onToast(`Printer test failed: ${(e as Error).message ?? e}`);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      onToast(`Couldn't save settings: ${(e as Error).message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary";

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Printer settings</p>

        <label className="mt-3 block text-sm font-medium text-ink">
          Transport
          <select
            value={form.transport}
            onChange={(e) => set("transport", e.target.value as PrinterTransport)}
            className={input + " mt-1"}
          >
            <option value="network">Network (LAN / TCP :9100)</option>
            <option value="bluetooth">Bluetooth (BLE)</option>
            <option value="usb">USB (WebUSB)</option>
          </select>
        </label>

        {form.transport === "network" && (
          <>
            <label className="mt-3 block text-sm font-medium text-ink">
              Printer IP
              <input
                value={form.ip}
                onChange={(e) => set("ip", e.target.value)}
                placeholder="192.168.1.50"
                className={input + " mt-1"}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-ink">
              Port
              <input
                value={form.port}
                onChange={(e) => set("port", Number(e.target.value) || 9100)}
                inputMode="numeric"
                className={input + " mt-1"}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-ink">
              Bridge host (where scripts/printer-bridge.mjs runs)
              <input
                value={form.bridgeHost}
                onChange={(e) => set("bridgeHost", e.target.value)}
                placeholder="127.0.0.1"
                className={input + " mt-1"}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-ink">
              Bridge port
              <input
                value={form.bridgePort}
                onChange={(e) => set("bridgePort", Number(e.target.value) || 8787)}
                inputMode="numeric"
                min={1}
                max={65535}
                className={input + " mt-1"}
              />
            </label>
          </>
        )}

        <label className="mt-3 block text-sm font-medium text-ink">Paper width</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {([58, 80] as const).map((w) => (
            <button
              key={w}
              onClick={() => set("paperWidth", w)}
              className={`rounded-btn py-2 text-sm font-bold ${
                form.paperWidth === w ? "bg-primary text-primary-fg" : "bg-secondary text-ink"
              }`}
            >
              {w}mm
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-ink-muted">
          {form.transport === "network" &&
            "Run `node scripts/printer-bridge.mjs` on any device on the printer's network; the bridge port must match."}
          {form.transport === "bluetooth" &&
            "Uses Web Bluetooth — pair once per browser on Chrome/Android."}
          {form.transport === "usb" && "Uses WebUSB — Chrome/Edge only."}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => void testPrint()}
            disabled={testing}
            className="rounded-btn bg-secondary py-3 font-bold text-ink disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test"}
          </button>
          <button onClick={onClose} className="rounded-btn bg-secondary py-3 font-bold text-ink">
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
