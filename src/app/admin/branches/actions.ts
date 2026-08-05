"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { clearSelectedAdminBranch } from "@/lib/admin/branch-context";

type BranchFields = {
  name: string;
  address: string;
  tin: string;
  vatRate: number;
  vatRegistered: boolean;
  currency: string;
};

type ExistingBranch = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  tin: string | null;
  vat_registered: boolean;
  vat_rate: number;
  currency: string;
  is_active: boolean;
};

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function branchRedirect(message: string, editId = ""): never {
  const params = new URLSearchParams({ error: message });
  if (editId) params.set("edit", editId);
  redirect(`/admin/branches?${params.toString()}`);
}

function branchSaved(message: "created" | "updated", branchId = "", cloneFailed = false): never {
  const params = new URLSearchParams({ saved: message });
  if (branchId) params.set("edit", branchId);
  if (cloneFailed) params.set("clone", "failed");
  redirect(`/admin/branches?${params.toString()}`);
}

async function getActor() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") branchRedirect("Only organization admins can manage branches.");

  return { supabase, userId: user.id, orgId: profile.org_id as string };
}

function readFields(formData: FormData, editId = ""): BranchFields {
  const name = readText(formData, "name");
  const address = readText(formData, "address");
  const tin = readText(formData, "tin");
  const currency = readText(formData, "currency").toUpperCase();
  const vatPercent = Number(readText(formData, "vat_rate"));

  if (!name || name.length > 120) branchRedirect("Branch name is required and must be at most 120 characters.", editId);
  if (address.length > 240) branchRedirect("Branch address must be at most 240 characters.", editId);
  if (tin.length > 80) branchRedirect("TIN must be at most 80 characters.", editId);
  if (!/^[A-Z]{3}$/.test(currency)) branchRedirect("Currency must be a three-letter code such as PHP.", editId);
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100) branchRedirect("VAT rate must be a percentage between 0 and 100.", editId);

  return {
    name,
    address,
    tin,
    currency,
    vatRate: Math.round((vatPercent / 100) * 10000) / 10000,
    vatRegistered: readBoolean(formData, "vat_registered"),
  };
}

function refreshBranchViews() {
  revalidatePath("/admin");
  revalidatePath("/admin/branches");
  revalidatePath("/admin/employees");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/pos");
  revalidatePath("/pos");
}

async function writeAudit(supabase: Awaited<ReturnType<typeof createClient>>, actor: { userId: string; orgId: string }, branchId: string, action: string, before: unknown, after: unknown) {
  await supabase.from("audit_logs").insert({
    org_id: actor.orgId,
    store_id: branchId,
    actor_id: actor.userId,
    action,
    entity: "stores",
    entity_id: branchId,
    before,
    after,
  });
}

export async function createBranch(formData: FormData) {
  const actor = await getActor();
  const fields = readFields(formData);
  const cloneFromStoreId = readText(formData, "clone_from_store_id");

  if (cloneFromStoreId) {
    const { data: sourceBranch, error: sourceError } = await actor.supabase
      .from("stores")
      .select("id")
      .eq("id", cloneFromStoreId)
      .eq("org_id", actor.orgId)
      .eq("is_active", true)
      .maybeSingle();
    if (sourceError || !sourceBranch) branchRedirect("Choose an active source branch for the menu clone.");
  }

  const { data: branch, error } = await actor.supabase
    .from("stores")
    .insert({
      org_id: actor.orgId,
      name: fields.name,
      address: fields.address || null,
      tin: fields.tin || null,
      vat_registered: fields.vatRegistered,
      vat_rate: fields.vatRate,
      currency: fields.currency,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !branch) branchRedirect(error?.message || "The branch could not be created.");

  let cloneFailed = false;
  if (cloneFromStoreId) {
    const { error: cloneError } = await actor.supabase.rpc("clone_menu", {
      source_store: cloneFromStoreId,
      target_store: branch.id,
    });
    cloneFailed = Boolean(cloneError);
  }

  await writeAudit(actor.supabase, actor, branch.id, "branch.created", null, {
    name: fields.name,
    address: fields.address || null,
    tin: fields.tin || null,
    vat_registered: fields.vatRegistered,
    vat_rate: fields.vatRate,
    currency: fields.currency,
    is_active: true,
    menu_cloned_from: cloneFromStoreId || null,
    menu_clone_failed: cloneFailed,
  });

  refreshBranchViews();
  branchSaved("created", branch.id, cloneFailed);
}

export async function updateBranch(formData: FormData) {
  const branchId = readText(formData, "branch_id");
  if (!branchId) branchRedirect("The branch identifier is missing.");

  const actor = await getActor();
  const fields = readFields(formData, branchId);
  const isActive = readBoolean(formData, "is_active");

  const { data: existing, error: existingError } = await actor.supabase
    .from("stores")
    .select("id, org_id, name, address, tin, vat_registered, vat_rate, currency, is_active")
    .eq("id", branchId)
    .eq("org_id", actor.orgId)
    .maybeSingle();
  const current = existing as ExistingBranch | null;

  if (existingError || !current) branchRedirect("That branch is not available in your organization.", branchId);

  if (!isActive && current.is_active) {
    const { data: otherActiveBranches, error: activeError } = await actor.supabase
      .from("stores")
      .select("id")
      .eq("org_id", actor.orgId)
      .eq("is_active", true)
      .neq("id", branchId)
      .limit(1);

    if (activeError) branchRedirect(activeError.message || "The branch status could not be checked.", branchId);
    if (!otherActiveBranches?.length) branchRedirect("Keep at least one active branch in your organization.", branchId);
  }

  const { error } = await actor.supabase
    .from("stores")
    .update({
      name: fields.name,
      address: fields.address || null,
      tin: fields.tin || null,
      vat_registered: fields.vatRegistered,
      vat_rate: fields.vatRate,
      currency: fields.currency,
      is_active: isActive,
    })
    .eq("id", branchId)
    .eq("org_id", actor.orgId);

  if (error) branchRedirect(error.message || "The branch could not be updated.", branchId);
  if (!isActive) await clearSelectedAdminBranch(branchId);

  await writeAudit(actor.supabase, actor, branchId, isActive ? "branch.updated" : "branch.deactivated", {
    name: current.name,
    address: current.address,
    tin: current.tin,
    vat_registered: current.vat_registered,
    vat_rate: current.vat_rate,
    currency: current.currency,
    is_active: current.is_active,
  }, {
    name: fields.name,
    address: fields.address || null,
    tin: fields.tin || null,
    vat_registered: fields.vatRegistered,
    vat_rate: fields.vatRate,
    currency: fields.currency,
    is_active: isActive,
  });

  refreshBranchViews();
  branchSaved("updated");
}
