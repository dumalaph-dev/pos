"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toCentavos } from "@/lib/money";
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";
import { isLechonHouseBusiness } from "@/lib/admin/business";

function inventoryRedirect(message: string): never {
  redirect(`/admin/inventory?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    ? ""
    : value;
}

function yieldRedirect(message: string): never {
  redirect(`/admin/inventory?yield=1&error=${encodeURIComponent(message)}#yield-entry`);
}

function varianceRedirect(message: string, date = "", storeId = ""): never {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (storeId) params.set("branch", storeId);
  params.set("error", message);
  redirect(`/admin/inventory/variance?${params.toString()}`);
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

async function requireInventoryAdmin() {
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

  if (!profile || profile.role !== "admin") inventoryRedirect("Only organization admins can manage guided yields and inventory counts.");

  const { data: branches, error } = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", profile.org_id)
    .eq("is_active", true);

  if (error) inventoryRedirect("We could not verify the selected branch. Try again.");

  const selectedBranchId = await getSelectedAdminBranchId((branches ?? []) as AdminBranchOption[], profile.store_id);
  return { supabase, profile, selectedBranchId };
}

async function canRecordLechonYield(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data: organization, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  return !error && isLechonHouseBusiness(organization?.settings);
}

export async function recordYieldEntry(formData: FormData) {
  const { supabase, profile, selectedBranchId } = await requireInventoryAdmin();
  if (!(await canRecordLechonYield(supabase, profile.org_id))) {
    yieldRedirect("Guided yield is only available for Lechon House businesses.");
  }
  const storeId = readText(formData, "store_id");
  const sourceProductId = readText(formData, "source_product_id");
  const outputProductId = readText(formData, "output_product_id");
  const sourceQty = Number(readText(formData, "source_qty"));
  const totalYieldQty = Number(readText(formData, "total_yield_qty"));
  const wasteQtyValue = readText(formData, "waste_qty");
  const wasteQty = wasteQtyValue ? Number(wasteQtyValue) : 0;
  const reason = readText(formData, "reason");

  if (!storeId || !sourceProductId || !outputProductId || !Number.isFinite(sourceQty) || !Number.isFinite(totalYieldQty) || !Number.isFinite(wasteQty)) {
    yieldRedirect("Choose a branch, source product, output product, and valid quantities.");
  }
  if (sourceQty <= 0 || totalYieldQty <= 0 || wasteQty < 0 || wasteQty > totalYieldQty) {
    yieldRedirect("Source and total yield must be greater than zero, and waste cannot exceed total yield.");
  }
  if (sourceProductId === outputProductId) yieldRedirect("Choose a different output product so the source stock can be converted into usable yield.");
  if (reason.length > 180) yieldRedirect("The yield note must be at most 180 characters.");
  if (selectedBranchId && storeId !== selectedBranchId) yieldRedirect("Choose the branch currently selected in the workspace.");

  const { data: branch } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .maybeSingle();
  const { data: products } = await supabase
    .from("products")
    .select("id, store_id, track_stock, is_active")
    .eq("org_id", profile.org_id)
    .eq("store_id", storeId)
    .in("id", [sourceProductId, outputProductId]);

  const sourceProduct = (products ?? []).find((product) => product.id === sourceProductId);
  const outputProduct = (products ?? []).find((product) => product.id === outputProductId);
  if (!branch || !sourceProduct?.track_stock || !sourceProduct.is_active || !outputProduct?.track_stock || !outputProduct.is_active) {
    yieldRedirect("Choose active tracked products from the selected branch.");
  }

  const { error } = await supabase.rpc("record_yield_entry", {
    p_store_id: storeId,
    p_source_product_id: sourceProductId,
    p_source_qty: sourceQty,
    p_output_product_id: outputProductId,
    p_total_yield_qty: totalYieldQty,
    p_waste_qty: wasteQty,
    p_reason: reason || null,
  });

  if (error) yieldRedirect(error.message || "The yield entry could not be recorded.");

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  redirect("/admin/inventory?yield=1&saved=yield#yield-entry");
}

export async function recordInventoryCount(formData: FormData) {
  const { supabase, profile, selectedBranchId } = await requireInventoryAdmin();
  const storeId = readText(formData, "store_id");
  const countDate = readDate(readText(formData, "count_date"));

  if (!storeId || !countDate) varianceRedirect("Choose a valid branch and count date.", countDate, storeId);
  if (selectedBranchId && storeId !== selectedBranchId) varianceRedirect("Choose the branch currently selected in the workspace.", countDate, storeId);

  const { data: branch } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!branch) varianceRedirect("Choose an active branch from your organization.", countDate, storeId);

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("store_id", storeId)
    .eq("track_stock", true)
    .eq("is_active", true)
    .order("name")
    .limit(2000);
  if (productsError) varianceRedirect(productsError.message || "Tracked products could not be loaded.", countDate, storeId);
  if (!products?.length) varianceRedirect("There are no active tracked products in this branch yet.", countDate, storeId);

  const counts = products.map((product) => {
    const rawCount = readText(formData, `counted_${product.id}`);
    const countedQty = Number(rawCount);
    if (!rawCount || !Number.isFinite(countedQty) || countedQty < 0) {
      varianceRedirect("Enter a zero-or-greater counted quantity for every tracked product.", countDate, storeId);
    }
    return { product_id: product.id, counted_qty: countedQty };
  });

  const { error } = await supabase.rpc("record_inventory_count", {
    p_store_id: storeId,
    p_count_date: countDate,
    p_counts: counts,
  });
  if (error) varianceRedirect(error.message || "The end-of-day count could not be saved.", countDate, storeId);

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/variance");
  revalidatePath("/admin");
  redirect(`/admin/inventory/variance?date=${encodeURIComponent(countDate)}&branch=${encodeURIComponent(storeId)}&saved=1`);
}
