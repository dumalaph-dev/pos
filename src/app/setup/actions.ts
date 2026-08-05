"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

export type SetupState = {
  ok: boolean;
  message: string;
  deviceId?: string;
  storeId?: string;
  branchName?: string;
  devicePrefix?: string;
};

const INITIAL_SETUP_STATE: SetupState = { ok: false, message: "" };

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readPort(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
}

function setupError(message: string): SetupState {
  return { ...INITIAL_SETUP_STATE, message };
}

export async function onboardTablet(_previousState: SetupState, formData: FormData): Promise<SetupState> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) return setupError("Your session has expired. Sign in again to set up this tablet.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") return setupError("Only an organization admin can bind a tablet.");

  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const devicePrefix = readText(formData, "device_prefix").toUpperCase();
  const transport = readText(formData, "printer_transport");
  const paperWidth = readText(formData, "paper_width");
  const ip = readText(formData, "ip");
  const port = readPort(readText(formData, "port"), 9100);
  const bridgeHost = readText(formData, "bridge_host");
  const bridgePort = readPort(readText(formData, "bridge_port"), 8787);

  if (!storeId) return setupError("Choose the branch where this tablet will operate.");
  if (!name || name.length > 80) return setupError("Give the tablet a name of at most 80 characters.");
  if (!/^[A-Z0-9-]{1,12}$/.test(devicePrefix)) return setupError("The device prefix may contain only letters, numbers, and hyphens.");
  if (!['network', 'bluetooth', 'usb'].includes(transport)) return setupError("Choose a supported printer transport.");
  if (paperWidth !== "58" && paperWidth !== "80") return setupError("Choose a paper width of 58mm or 80mm.");
  if (ip.length > 120 || bridgeHost.length > 120) return setupError("Printer connection details are too long.");

  const { data: branch, error: branchError } = await supabase
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .maybeSingle();
  if (branchError || !branch) return setupError("Choose an active branch from your organization.");

  const { data: device, error } = await supabase
    .from("devices")
    .insert({
      org_id: profile.org_id,
      store_id: storeId,
      name,
      device_prefix: devicePrefix,
      printer_transport: transport,
      printer_config: {
        ip,
        port,
        paper_width: Number(paperWidth),
        bridge_host: bridgeHost || "127.0.0.1",
        bridge_port: bridgePort,
      },
      is_active: true,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !device) {
    if (error?.code === "23505") return setupError("That device prefix is already registered at this branch. Choose another one.");
    return setupError(error?.message || "The tablet could not be registered.");
  }

  await supabase.from("audit_logs").insert({
    org_id: profile.org_id,
    store_id: storeId,
    actor_id: user.id,
    action: "device.created",
    entity: "devices",
    entity_id: device.id,
    device_id: device.id,
    after: { name, device_prefix: devicePrefix, printer_transport: transport, is_active: true, onboarding: true },
  });

  revalidatePath("/setup");
  revalidatePath("/pos");
  revalidatePath("/admin");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/branches");
  revalidatePath("/admin/audit");

  return {
    ok: true,
    message: `${branch.name} is ready for this tablet.`,
    deviceId: device.id,
    storeId,
    branchName: branch.name,
    devicePrefix,
  };
}
