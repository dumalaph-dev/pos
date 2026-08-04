"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

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

function settingsRedirect(message: string): never {
  redirect(`/admin/pos?error=${encodeURIComponent(message)}`);
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

  if (!profile || profile.role !== "admin") settingsRedirect("Only organization admins can save POS settings.");

  const { data: store } = await supabase
    .from("stores")
    .select("id, settings, vat_rate, vat_registered")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!store) settingsRedirect("Choose a valid branch before saving POS settings.");

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
