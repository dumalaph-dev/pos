"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PrinterTransport = "network" | "bluetooth" | "usb";

function settingsRedirect(message: string): never {
  redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
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

function readVatRate(value: string) {
  const percentage = Number(value);
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100 ? percentage / 100 : null;
}

function validateRequiredText(value: string, label: string, maxLength: number) {
  if (!value || value.length > maxLength) settingsRedirect(`${label} is required and must be at most ${maxLength} characters.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") settingsRedirect("Only organization admins can change backoffice settings.");
  return { supabase, orgId: profile.org_id };
}

async function validStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).eq("org_id", orgId).maybeSingle();
  return Boolean(data);
}

function refreshSettings() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/inventory");
  revalidatePath("/pos");
}

export async function updateOrganizationSettings(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const name = readText(formData, "name");
  const currency = readText(formData, "currency").toUpperCase();
  validateRequiredText(name, "Organization name", 120);
  if (!/^[A-Z]{3}$/.test(currency)) settingsRedirect("Currency must be a three-letter code such as PHP.");

  const { error } = await supabase.from("organizations").update({ name, currency }).eq("id", orgId);
  if (error) settingsRedirect(error.message || "Organization settings could not be saved.");

  refreshSettings();
  redirect("/admin/settings?saved=organization");
}

export async function updateBranchSettings(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const address = readText(formData, "address");
  const tin = readText(formData, "tin");
  const vatRate = readVatRate(readText(formData, "vat_rate"));
  const receiptHeader = readText(formData, "receipt_header");
  const receiptFooter = readText(formData, "receipt_footer");

  if (!storeId || !(await validStore(supabase, orgId, storeId))) settingsRedirect("Choose a valid branch before saving.");
  validateRequiredText(name, "Branch name", 120);
  if (address.length > 240 || tin.length > 80 || receiptHeader.length > 200 || receiptFooter.length > 200) {
    settingsRedirect("Branch details are longer than the allowed limit.");
  }
  if (vatRate === null) settingsRedirect("VAT rate must be between 0 and 100 percent.");

  const { data: existing } = await supabase.from("stores").select("settings").eq("id", storeId).eq("org_id", orgId).single();
  const existingSettings = isRecord(existing?.settings) ? existing.settings : {};
  const settings = { ...existingSettings, receipt_header: receiptHeader || null, receipt_footer: receiptFooter || null };
  const { error } = await supabase
    .from("stores")
    .update({
      name,
      address: address || null,
      tin: tin || null,
      vat_registered: readBoolean(formData, "vat_registered"),
      vat_rate: vatRate,
      settings,
    })
    .eq("id", storeId)
    .eq("org_id", orgId);

  if (error) settingsRedirect(error.message || "Branch settings could not be saved.");
  refreshSettings();
  redirect("/admin/settings?saved=branch");
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

  validateRequiredText(name, "Terminal name", 80);
  if (!storeId) settingsRedirect("Choose a branch for this terminal.");
  if (!/^[A-Z0-9-]{1,12}$/.test(devicePrefix)) settingsRedirect("Device prefix may contain only letters, numbers, and hyphens.");
  if (!transport || paperWidth === null || port === null) settingsRedirect("Choose a valid printer transport, paper width, and port.");
  if (ip.length > 120 || bridgeHost.length > 120) settingsRedirect("Printer connection details are too long.");
  return { storeId, name, devicePrefix, transport, paperWidth, port, ip, bridgeHost };
}

async function validDeviceStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  if (!(await validStore(supabase, orgId, storeId))) settingsRedirect("Choose a branch from your organization.");
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
    printer_config: { ip: fields.ip, port: fields.port, paper_width: fields.paperWidth, bridge_host: fields.bridgeHost },
    is_active: true,
  });
  if (error) settingsRedirect(error.message || "The terminal could not be created.");

  refreshSettings();
  redirect("/admin/settings?saved=device");
}

export async function updateDeviceSettings(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const deviceId = readText(formData, "device_id");
  const fields = readDeviceFields(formData);
  await validDeviceStore(supabase, orgId, fields.storeId);
  if (!deviceId) settingsRedirect("The terminal identifier is missing.");

  const { data: existing } = await supabase.from("devices").select("printer_config").eq("id", deviceId).eq("org_id", orgId).maybeSingle();
  if (!existing) settingsRedirect("That terminal is not available in your organization.");
  const currentConfig = isRecord(existing.printer_config) ? existing.printer_config : {};
  const printerConfig = { ...currentConfig, ip: fields.ip, port: fields.port, paper_width: fields.paperWidth, bridge_host: fields.bridgeHost };
  const { error } = await supabase
    .from("devices")
    .update({
      store_id: fields.storeId,
      name: fields.name,
      device_prefix: fields.devicePrefix,
      printer_transport: fields.transport,
      printer_config: printerConfig,
      is_active: readBoolean(formData, "is_active"),
    })
    .eq("id", deviceId)
    .eq("org_id", orgId);
  if (error) settingsRedirect(error.message || "The terminal settings could not be saved.");

  refreshSettings();
  redirect("/admin/settings?saved=device");
}
