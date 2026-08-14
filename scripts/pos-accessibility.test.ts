import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  getPosThemeDisplayColors,
  POS_THEME_DEFINITIONS,
  POS_THEME_IDS,
  POS_THEME_OPTIONS,
  type PosThemeId,
} from "../src/lib/pos-theme.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const RECENT_THEME_IDS = ["planner", "chicken", "ramen", "taqueria", "sushi", "deco", "paper", "icecream", "candy", "christmas"] satisfies PosThemeId[];

function colorLuminance(hex: string) {
  assert.match(hex, /^#[\da-f]{6}$/i, `Expected a six-digit hex color, received ${hex}`);
  const channels = hex.slice(1).match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255);
  assert.equal(channels?.length, 3);
  const [red, green, blue] = channels!.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function colorContrast(foreground: string, background: string) {
  const foregroundLuminance = colorLuminance(foreground);
  const backgroundLuminance = colorLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function assertTextContrast(label: string, foreground: string, background: string) {
  const ratio = colorContrast(foreground, background);
  assert.ok(ratio >= 4.5, `${label} contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
}

test("POS theme registry keeps every theme ordered and fully integrated", () => {
  assert.equal(POS_THEME_IDS.length, 26);
  assert.equal(new Set(POS_THEME_IDS).size, POS_THEME_IDS.length);
  assert.deepEqual(POS_THEME_OPTIONS.map(({ id }) => id), [...POS_THEME_IDS]);

  for (const id of POS_THEME_IDS) {
    const theme = POS_THEME_DEFINITIONS[id];
    assert.equal(theme.id, id);
    assert.ok(theme.label.trim());
    assert.ok(theme.shortLabel.trim());
    assert.ok(theme.description.trim());
    assert.ok(theme.mood.trim());
  }

  const cashierCss = read("src/components/pos/SellScreen.css");
  const settingsCss = read("src/components/admin/PosSettingsScreen.css");
  for (const id of RECENT_THEME_IDS) {
    assert.match(cashierCss, new RegExp(`\\.pos-app--${id}\\b`));
    assert.match(settingsCss, new RegExp(`\\.pos-preview-window--${id}\\b`));
    assert.match(settingsCss, new RegExp(`\\.pos-style-thumbnail--${id}\\b`));
  }
});

test("POS theme text and customer-display colors meet AA contrast", () => {
  for (const id of POS_THEME_IDS) {
    const variables = POS_THEME_DEFINITIONS[id].variables;
    const displayColors = getPosThemeDisplayColors(id);
    assertTextContrast(`${id} body text`, variables["--pos-theme-text"], variables["--pos-theme-surface"]);
    assertTextContrast(`${id} muted text`, variables["--pos-theme-text-muted"], variables["--pos-theme-surface"]);
    assertTextContrast(`${id} topbar text`, variables["--pos-theme-topbar-text"], variables["--pos-theme-topbar"]);
    assertTextContrast(`${id} display heading`, displayColors.heading, variables["--pos-theme-bg"]);
    assertTextContrast(`${id} display accent ink`, displayColors.accentInk, variables["--pos-theme-highlight"]);
  }
});

test("recent restaurant theme gradients keep readable action text", () => {
  const contrastPairs = [
    ["chicken topbar edge", "#fff8df", "#c34128"],
    ["ramen charge edge", "#ffffff", "#cf3263"],
    ["taqueria topbar edge", "#fff8e9", "#0b706c"],
    ["taqueria charge", "#fff8e9", "#c83c2a"],
    ["paper charge", "#fffaf0", "#b44335"],
    ["ice cream charge", "#2b1931", "#df638b"],
    ["candy charge", "#160b18", "#d84287"],
    ["christmas charge", "#fff8ed", "#c44740"],
  ] as const;
  for (const [label, foreground, background] of contrastPairs) {
    assertTextContrast(label, foreground, background);
  }

  const cashierCss = read("src/components/pos/SellScreen.css");
  const settingsCss = read("src/components/admin/PosSettingsScreen.css");
  for (const [, , background] of contrastPairs) {
    assert.match(cashierCss, new RegExp(background));
    assert.match(settingsCss, new RegExp(background));
  }
});

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
