"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;
type PrinterTransport = "network" | "bluetooth" | "usb";

const PALETTES = ["brown", "blue", "green", "purple", "custom"] as const;
const UI_STYLES = ["modern", "classic", "soft", "dark", "bold"] as const;
const ORDER_TYPES = ["Dine In", "Takeout", "Delivery"] as const;
const PAYMENT_METHODS = ["cash", "card", "gcash", "maya", "more"] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readFormBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function readEnum<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]) {
  return typeof value === "string" && values.includes(value) ? value as T[number] : fallback;
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max ? numberValue : fallback;
}

function readSettings(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function posRedirect(message: string, tab: "preview" | "receipts" | "hardware" = "preview"): never {
  redirect(`/admin/pos?tab=${tab}&error=${encodeURIComponent(message)}`);
}

function posSaved(value: "settings" | "branch" | "device", tab: "preview" | "receipts" | "hardware" = "preview"): never {
  redirect(`/admin/pos?tab=${tab}&saved=${value}`);
}

function validateRequiredText(value: string, label: string, maxLength: number, tab: "receipts" | "hardware") {
  if (!value || value.length > maxLength) posRedirect(`${label} is required and must be at most ${maxLength} characters.`, tab);
}

async function requireAdminStore(storeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") posRedirect("Only organization admins can save POS settings.");

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, address, tin, settings, vat_rate, vat_registered")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!store) posRedirect("Choose a valid branch before saving POS settings.");

  return { supabase, store };
}

function normalizePosSettings(value: JsonRecord, fallback: JsonRecord, fallbackVatRate: number, fallbackShowVat: boolean): JsonRecord {
  const paymentSource = isRecord(value.paymentMethods) ? value.paymentMethods : isRecord(fallback.paymentMethods) ? fallback.paymentMethods : {};
  const orderTypes = Array.isArray(value.orderTypes)
    ? value.orderTypes.filter((item): item is string => typeof item === "string" && ORDER_TYPES.includes(item as typeof ORDER_TYPES[number])).slice(0, 3)
    : Array.isArray(fallback.orderTypes)
      ? fallback.orderTypes.filter((item): item is string => typeof item === "string" && ORDER_TYPES.includes(item as typeof ORDER_TYPES[number])).slice(0, 3)
      : [];
  const enabledOrderTypes = orderTypes.length ? orderTypes : ["Dine In", "Takeout"];
  const configuredDefault = readEnum(value.defaultOrderType, ORDER_TYPES, readEnum(fallback.defaultOrderType, ORDER_TYPES, "Dine In"));

  const paymentMethods = Object.fromEntries(
    PAYMENT_METHODS.map((method) => [method, readBoolean(paymentSource[method], method === "cash" || method === "card" || method === "gcash")]),
  );
  if (!PAYMENT_METHODS.filter((method) => method !== "more").some((method) => paymentMethods[method])) {
    paymentMethods.cash = true;
  }

  return {
    palette: readEnum(value.palette, PALETTES, readEnum(fallback.palette, PALETTES, "brown")),
    customColor: typeof value.customColor === "string" && /^#[0-9a-f]{6}$/i.test(value.customColor) ? value.customColor : typeof fallback.customColor === "string" && /^#[0-9a-f]{6}$/i.test(fallback.customColor) ? fallback.customColor : "#5b2a0a",
    uiStyle: readEnum(value.uiStyle, UI_STYLES, readEnum(fallback.uiStyle, UI_STYLES, "modern")),
    defaultOrderType: enabledOrderTypes.includes(configuredDefault) ? configuredDefault : enabledOrderTypes[0],
    orderTypes: enabledOrderTypes,
    paymentMethods,
    vatRate: readNumber(value.vatRate, readNumber(fallback.vatRate, fallbackVatRate, 0, 1), 0, 1),
    showVat: readBoolean(value.showVat, readBoolean(fallback.showVat, fallbackShowVat)),
    showStockStatus: readBoolean(value.showStockStatus, readBoolean(fallback.showStockStatus, false)),
    enableOrderNotes: readBoolean(value.enableOrderNotes, readBoolean(fallback.enableOrderNotes, true)),
    receiptHeader: typeof value.receiptHeader === "string" ? value.receiptHeader.slice(0, 200) : typeof fallback.receiptHeader === "string" ? fallback.receiptHeader.slice(0, 200) : "",
    receiptFooter: typeof value.receiptFooter === "string" ? value.receiptFooter.slice(0, 200) : typeof fallback.receiptFooter === "string" ? fallback.receiptFooter.slice(0, 200) : "",
    showCashier: readBoolean(value.showCashier, readBoolean(fallback.showCashier, true)),
    paperWidth: value.paperWidth === "80" || (value.paperWidth === undefined && fallback.paperWidth === "80") ? "80" : "58",
  };
}

export async function savePosSettings(formData: FormData) {
  const storeId = readText(formData, "store_id");
  const serialized = readText(formData, "settings");
  if (!storeId || !serialized) return { ok: false, message: "POS settings are missing." };

  const incoming = readSettings(serialized);
  if (!incoming) return { ok: false, message: "POS settings could not be read." };

  const { supabase, store } = await requireAdminStore(storeId);
  const branchName = formData.has("branch_name") ? readText(formData, "branch_name") : String(store.name ?? "");
  const address = formData.has("address") ? readText(formData, "address") : String(store.address ?? "");
  const tin = formData.has("tin") ? readText(formData, "tin") : String(store.tin ?? "");
  validateRequiredText(branchName, "Branch name", 120, "receipts");
  if (address.length > 240 || tin.length > 80) return { ok: false, message: "Branch details are longer than the allowed limit." };

  const currentSettings = isRecord(store.settings) ? store.settings : {};
  const currentPosSettings = isRecord(currentSettings.pos_config) ? currentSettings.pos_config : {};
  const branchVatRate = Number(store.vat_rate);
  const nextPosSettings = normalizePosSettings(
    incoming,
    currentPosSettings,
    Number.isFinite(branchVatRate) ? branchVatRate : 0.12,
    Boolean(store.vat_registered),
  );
  const nextSettings = {
    ...currentSettings,
    pos_config: nextPosSettings,
    receipt_header: nextPosSettings.receiptHeader || null,
    receipt_footer: nextPosSettings.receiptFooter || null,
    paper_width: nextPosSettings.paperWidth,
  };

  const { error } = await supabase
    .from("stores")
    .update({
      name: branchName,
      address: address || null,
      tin: tin || null,
      settings: nextSettings,
      vat_rate: nextPosSettings.vatRate,
      vat_registered: nextPosSettings.showVat,
    })
    .eq("id", storeId);

  if (error) return { ok: false, message: error.message || "POS settings could not be saved." };

  revalidatePath("/admin/pos");
  revalidatePath("/admin/settings");
  revalidatePath("/pos");

  return { ok: true, message: "POS settings saved." };
}

function readTransport(value: string): PrinterTransport | null {
  return value === "network" || value === "bluetooth" || value === "usb" ? value : null;
}

function readPaperWidth(value: string) {
  return value === "58" || value === "80" ? Number(value) : null;
}

function readPort(value: string) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function readDeviceFields(formData: FormData) {
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const devicePrefix = readText(formData, "device_prefix").toUpperCase();
  const transport = readTransport(readText(formData, "printer_transport"));
  const paperWidth = readPaperWidth(readText(formData, "paper_width"));
  const port = readPort(readText(formData, "port"));
  const ip = readText(formData, "ip");
  const bridgeHost = readText(formData, "bridge_host");
  const bridgePort = readPort(readText(formData, "bridge_port"));

  validateRequiredText(name, "Terminal name", 80, "hardware");
  if (!storeId) posRedirect("Choose a branch for this terminal.", "hardware");
  if (!/^[A-Z0-9-]{1,12}$/.test(devicePrefix)) posRedirect("Device prefix may contain only letters, numbers, and hyphens.", "hardware");
  if (!transport || paperWidth === null || port === null || bridgePort === null) {
    posRedirect("Choose a valid printer transport, paper width, printer port, and bridge port.", "hardware");
  }
  if (ip.length > 120 || bridgeHost.length > 120) posRedirect("Printer connection details are too long.", "hardware");
  return { storeId, name, devicePrefix, transport, paperWidth, port, ip, bridgeHost, bridgePort };
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") posRedirect("Only organization admins can manage terminals.", "hardware");
  return { supabase, orgId: profile.org_id };
}

async function validStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).eq("org_id", orgId).maybeSingle();
  return Boolean(data);
}

async function validDeviceStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  if (!(await validStore(supabase, orgId, storeId))) posRedirect("Choose a branch from your organization.", "hardware");
}

function refreshPos() {
  revalidatePath("/admin/pos");
  revalidatePath("/admin/settings");
  revalidatePath("/pos");
}

export async function createDeviceSettings(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const fields = readDeviceFields(formData);
  await validDeviceStore(supabase, orgId, fields.storeId);

  const { error } = await supabase.from("devices").insert({
    org_id: orgId,
    store_id: fields.storeId,
    name: fields.name,
    device_prefix: fields.devicePrefix,
    printer_transport: fields.transport,
    printer_config: {
      ip: fields.ip,
      port: fields.port,
      paper_width: fields.paperWidth,
      bridge_host: fields.bridgeHost,
      bridge_port: fields.bridgePort,
    },
    is_active: true,
  });
  if (error) posRedirect(error.message || "The terminal could not be created.", "hardware");

  refreshPos();
  posSaved("device", "hardware");
}

export async function updateDeviceSettings(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const deviceId = readText(formData, "device_id");
  const fields = readDeviceFields(formData);
  await validDeviceStore(supabase, orgId, fields.storeId);
  if (!deviceId) posRedirect("The terminal identifier is missing.", "hardware");

  const { data: existing } = await supabase
    .from("devices")
    .select("printer_config")
    .eq("id", deviceId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing) posRedirect("That terminal is not available in your organization.", "hardware");

  const currentConfig = isRecord(existing.printer_config) ? existing.printer_config : {};
  const printerConfig = {
    ...currentConfig,
    ip: fields.ip,
    port: fields.port,
    paper_width: fields.paperWidth,
    bridge_host: fields.bridgeHost,
    bridge_port: fields.bridgePort,
  };
  const { error } = await supabase
    .from("devices")
    .update({
      store_id: fields.storeId,
      name: fields.name,
      device_prefix: fields.devicePrefix,
      printer_transport: fields.transport,
      printer_config: printerConfig,
      is_active: readFormBoolean(formData, "is_active"),
    })
    .eq("id", deviceId)
    .eq("org_id", orgId);
  if (error) posRedirect(error.message || "The terminal settings could not be saved.", "hardware");

  refreshPos();
  posSaved("device", "hardware");
}
