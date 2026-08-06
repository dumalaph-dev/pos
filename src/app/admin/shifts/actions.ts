"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toCentavos } from "@/lib/money";

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Keeps the caller on the same filtered view after an action. Only the shifts
 * route is ever accepted as a return target so a crafted `return_to` cannot
 * bounce an admin somewhere else.
 */
function safeShiftsReturnTo(value: string, shiftId: string) {
  const fallback = new URL("/admin/shifts", "http://pos.local");

  try {
    const candidate = new URL(value || fallback.toString(), "http://pos.local");
    if (candidate.pathname !== "/admin/shifts") {
      if (shiftId) fallback.searchParams.set("shift", shiftId);
      return fallback;
    }
    if (shiftId) candidate.searchParams.set("shift", shiftId);
    return candidate;
  } catch {
    if (shiftId) fallback.searchParams.set("shift", shiftId);
    return fallback;
  }
}

function redirectShiftAction(returnTo: string, shiftId: string, key: "saved" | "error", value: string): never {
  const url = safeShiftsReturnTo(returnTo, shiftId);
  url.searchParams.set(key, value);
  redirect(`${url.pathname}${url.search}`);
}

function refreshShiftViews() {
  revalidatePath("/admin/shifts");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/audit");
}

async function requireAdmin(returnTo: string, shiftId: string) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    redirectShiftAction(returnTo, shiftId, "error", "Only organization admins can manage shifts here.");
  }

  return supabase;
}

/**
 * Admin close-out for a till a cashier left open (PRD §6.5). The RPC still
 * owns the expected-cash calculation and the variance-note rule.
 */
export async function closeShiftFromAdmin(formData: FormData): Promise<never> {
  const shiftId = readText(formData, "shift_id");
  const returnTo = readText(formData, "return_to");
  const countedRaw = readText(formData, "declared_cash");
  const note = readText(formData, "note");

  if (!shiftId) redirectShiftAction(returnTo, "", "error", "Select a shift before closing it.");

  const counted = Number(countedRaw);
  if (countedRaw === "" || !Number.isFinite(counted) || counted < 0) {
    redirectShiftAction(returnTo, shiftId, "error", "Enter the counted cash as a positive amount.");
  }
  if (note.length > 400) {
    redirectShiftAction(returnTo, shiftId, "error", "The shift note must be at most 400 characters.");
  }

  const supabase = await requireAdmin(returnTo, shiftId);
  const { error } = await supabase.rpc("close_shift", {
    p_shift_id: shiftId,
    p_declared_cash: toCentavos(counted),
    p_note: note || null,
  });

  if (error) redirectShiftAction(returnTo, shiftId, "error", error.message || "The shift could not be closed.");

  refreshShiftViews();
  redirectShiftAction(returnTo, shiftId, "saved", "closed");
}

/**
 * Seals a closed shift into the append-only Z-reading archive. The reading is
 * a stored snapshot, so a later void or refund on one of its orders never
 * rewrites a Z that was already taken.
 */
export async function generateZReading(formData: FormData): Promise<never> {
  const shiftId = readText(formData, "shift_id");
  const returnTo = readText(formData, "return_to");
  const note = readText(formData, "note");

  if (!shiftId) redirectShiftAction(returnTo, "", "error", "Select a closed shift to read.");
  if (note.length > 400) {
    redirectShiftAction(returnTo, shiftId, "error", "The Z-reading note must be at most 400 characters.");
  }

  const supabase = await requireAdmin(returnTo, shiftId);
  const { error } = await supabase.rpc("record_z_reading", {
    p_shift_id: shiftId,
    p_note: note || null,
  });

  if (error) redirectShiftAction(returnTo, shiftId, "error", error.message || "The Z-reading could not be generated.");

  refreshShiftViews();
  redirectShiftAction(returnTo, shiftId, "saved", "z-reading");
}
