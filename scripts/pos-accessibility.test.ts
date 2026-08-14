import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("shared overlays keep keyboard, portal, focus, and z-index guarantees", () => {
  const overlay = read("src/components/ui/OverlayLayer.tsx");
  const globals = read("src/app/globals.css");
  assert.match(overlay, /createPortal/);
  assert.match(overlay, /event\.key === "Escape"/);
  assert.match(overlay, /event\.key !== "Tab"/);
  assert.match(overlay, /aria-modal="true"/);
  assert.match(overlay, /OVERLAY_Z_INDEX\.dialog/);
  assert.match(globals, /--z-dropdown:\s*900/);
  assert.match(globals, /--z-dialog:\s*1000/);
  assert.match(globals, /--z-toast:\s*1100/);
});

test("POS health and offline UI expose the operational states needed at the counter", () => {
  const health = read("src/components/pos/PosHealthPanel.tsx");
  const pos = read("src/components/pos/SellScreen.tsx");
  const css = read("src/components/pos/SellScreen.css");
  for (const label of ["Pending sync", "Oldest queued sale", "Failed prints", "Customer display", "Sync state"]) {
    assert.match(health, new RegExp(label));
  }
  assert.match(pos, /offline/);
  assert.match(pos, /aria-label=\{"Add " \+ product\.name\}/);
  assert.match(css, /\.pos-health-panel/);
  assert.match(css, /min-height:\s*44px/);
});

test("all POS dialogs use the shared overlay entry point", () => {
  const sell = read("src/components/pos/SellScreen.tsx");
  const charge = read("src/components/pos/ChargeModal.tsx");
  const printer = read("src/components/pos/PrinterSettings.tsx");
  const display = read("src/components/pos/CustomerDisplaySettings.tsx");
  const shift = read("src/components/pos/ShiftPanel.tsx");
  const history = read("src/components/pos/OrderHistory.tsx");
  for (const source of [sell, charge, printer, display, shift, history]) assert.match(source, /<OverlayDialog/);
  for (const source of [sell, charge, printer, display, shift]) assert.doesNotMatch(source, /fixed inset-0 z-40/);
  assert.doesNotMatch(printer, /fixed inset-0 z-40/);
  assert.doesNotMatch(display, /fixed inset-0 z-40/);
  assert.doesNotMatch(shift, /fixed inset-0 z-40/);
  assert.doesNotMatch(history, /role="dialog"/);
});
