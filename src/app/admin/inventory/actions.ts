"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toCentavos } from "@/lib/money";
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";

function inventoryRedirect(message: string): never {
  redirect(`/admin/inventory?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readMovementType(value: string): Exclude<StockMovementType, "sale"> | null {
  if (!STOCK_MOVEMENT_TYPES.includes(value as StockMovementType) || value === "sale") return null;
  return value as Exclude<StockMovementType, "sale">;
}

export async function recordStockMovement(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, store_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    inventoryRedirect("Only organization admins can record stock movements.");
  }

  const { data: branches, error: branchesError } = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", profile.org_id)
    .eq("is_active", true);

  if (branchesError) inventoryRedirect("We could not verify the selected branch. Try again.");

  const selectedBranchId = await getSelectedAdminBranchId(
    (branches ?? []) as AdminBranchOption[],
    profile.store_id,
  );

  const storeId = readText(formData, "store_id");
  const productId = readText(formData, "product_id");
  const movementType = readMovementType(readText(formData, "type"));
  const quantity = Number(readText(formData, "qty"));
  const reason = readText(formData, "reason");
  const unitCostPeso = readText(formData, "unit_cost");

  if (!storeId || !productId || !movementType || !Number.isFinite(quantity)) {
    inventoryRedirect("Choose a branch, tracked product, movement type, and valid quantity.");
  }

  if (selectedBranchId && storeId !== selectedBranchId) {
    inventoryRedirect("Choose the branch currently selected in the workspace.");
  }

  const { data: branch } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .maybeSingle();
  const { data: product } = await supabase
    .from("products")
    .select("id, store_id, track_stock")
    .eq("id", productId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (!branch || !product || product.store_id !== storeId || !product.track_stock) {
    inventoryRedirect("Choose an active branch and a tracked product from that branch.");
  }

  if (quantity === 0 || (movementType !== "adjust" && quantity < 0)) {
    inventoryRedirect("Use a positive quantity for stock in, yield, and waste. Adjustments may be negative.");
  }

  if ((movementType === "waste" || movementType === "adjust") && !reason) {
    inventoryRedirect("A reason is required for waste and adjustment movements.");
  }

  let unitCost: number | null = null;
  if (unitCostPeso) {
    const peso = Number(unitCostPeso);
    if (!Number.isFinite(peso) || peso < 0) inventoryRedirect("Unit cost must be a valid non-negative peso amount.");
    unitCost = toCentavos(peso);
  }

  const { error } = await supabase.rpc("record_stock_movement", {
    p_store_id: storeId,
    p_product_id: productId,
    p_type: movementType,
    p_qty: quantity,
    p_unit_cost: unitCost,
    p_reason: reason || null,
  });

  if (error) inventoryRedirect(error.message || "The stock movement could not be recorded.");

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  redirect("/admin/inventory?saved=1");
}
