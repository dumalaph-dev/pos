"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toCentavos } from "@/lib/money";
import {
  organizationImageStoragePath,
  readOrganizationImageFile,
  removeOrganizationImage,
  uploadOrganizationImage,
} from "@/lib/admin/image-storage";
import { createClient } from "@/lib/supabase/server";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";
import { invalidateAdminProfile } from "@/lib/admin/profile";
import { saveOrganizationBusinessPreset } from "@/lib/admin/business-server";
import { getCatalogPreset } from "@/lib/catalog-presets";
import { isNonEmptyImportRow, MAX_IMPORT_TEXT_BYTES, normalizeImportHeader, parseDelimitedText } from "@/lib/catalog-import-format";
import { isInventoryMode, parseRecipeLines, type InventoryMode, type RecipeLineDraft } from "@/lib/inventory-recipes";

type PricingMode = "fixed" | "per_kg";

function catalogRedirect(message: string): never {
  redirect(`/products?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function readPricingMode(value: string): PricingMode | null {
  return value === "fixed" || value === "per_kg" ? value : null;
}

function readSortOrder(value: string) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 9999) : null;
}

function readPrice(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) return null;
  return toCentavos(parsed);
}

function readOptionalCostPrice(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) return undefined;
  return toCentavos(parsed);
}

function readMinimumStock(value: string) {
  if (!value) return 2;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return null;
  return parsed;
}

function readImageFile(formData: FormData): File | null | undefined {
  return readOrganizationImageFile(formData, "image_file");
}

function readImportImagePath(value: string) {
  if (!value) return null;
  if (!value.startsWith("/") || value.length > 500) return undefined;
  return value;
}

function readImportBoolean(value: string, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const OPTIONAL_PRODUCT_COLUMNS = ["sku", "barcode", "cost_price", "min_stock", "supplier_id", "inventory_mode"] as const;

function isMissingOptionalProductColumn(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const mentionsOptionalColumn = OPTIONAL_PRODUCT_COLUMNS.some((column) => message.includes(column));
  return mentionsOptionalColumn && (error.code === "42703" || error.code === "PGRST204" || message.includes("schema cache") || message.includes("does not exist"));
}

function baseProductRecord(record: Record<string, unknown>) {
  const base = { ...record };
  OPTIONAL_PRODUCT_COLUMNS.forEach((column) => delete base[column]);
  return base;
}

async function insertProductRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  records: Record<string, unknown> | Record<string, unknown>[],
) {
  const result = await supabase.from("products").insert(records);
  if (!result.error || !isMissingOptionalProductColumn(result.error)) {
    return { error: result.error, usedLegacySchema: false };
  }

  const legacyRecords = Array.isArray(records) ? records.map(baseProductRecord) : baseProductRecord(records);
  const fallback = await supabase.from("products").insert(legacyRecords);
  return { error: fallback.error, usedLegacySchema: !fallback.error };
}

async function updateProductRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  productId: string,
  expectedStoreId: string,
  fields: Record<string, unknown>,
) {
  const result = await supabase
    .from("products")
    .update(fields)
    .eq("id", productId)
    .eq("org_id", orgId)
    .eq("store_id", expectedStoreId);
  if (!result.error || !isMissingOptionalProductColumn(result.error)) {
    return { error: result.error, usedLegacySchema: false };
  }

  const fallback = await supabase
    .from("products")
    .update(baseProductRecord(fields))
    .eq("id", productId)
    .eq("org_id", orgId)
    .eq("store_id", expectedStoreId);
  return { error: fallback.error, usedLegacySchema: !fallback.error };
}

async function requireAdmin() {
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
    catalogRedirect("Only organization admins can manage the product catalog.");
  }

  const { data: branches, error: branchesError } = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", profile.org_id)
    .eq("is_active", true);

  if (branchesError) {
    catalogRedirect("We could not verify the selected branch. Try again.");
  }

  const selectedBranchId = await getSelectedAdminBranchId(
    (branches ?? []) as AdminBranchOption[],
    profile.store_id,
  );

  return { supabase, orgId: profile.org_id, userId: user.id, selectedBranchId };
}

async function validStore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  storeId: string,
  selectedBranchId: string | null,
  requireActive = false,
) {
  const { data } = await supabase
    .from("stores")
    .select("id, is_active")
    .eq("id", storeId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data && (!selectedBranchId || data.id === selectedBranchId) && (!requireActive || data.is_active));
}

async function validCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  storeId: string,
  categoryId: string,
  selectedBranchId: string | null,
) {
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("store_id", storeId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data && (!selectedBranchId || storeId === selectedBranchId));
}

async function readProductContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  productId: string,
) {
  const { data } = await supabase
    .from("products")
    .select("store_id, image_url")
    .eq("id", productId)
    .eq("org_id", orgId)
    .maybeSingle();
  return data as { store_id: string; image_url: string | null } | null;
}

async function validSupplier(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  supplierId: string,
) {
  const { data } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

function refreshCatalog() {
  revalidatePath("/products");
  revalidatePath("/admin/products");
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/reports/inventory");
  revalidatePath("/admin");
  revalidatePath("/admin/pos");
  revalidatePath("/pos");
}

function readInventoryMode(formData: FormData): InventoryMode | null {
  const requested = readText(formData, "inventory_mode");
  if (!requested) return readBoolean(formData, "track_stock") ? "direct" : "none";
  return isInventoryMode(requested) ? requested : null;
}

function inventorySchemaError(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return ["inventory_items", "product_recipes", "inventory_mode"].some((value) => message.includes(value))
    && (error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205" || message.includes("schema cache") || message.includes("does not exist"));
}

async function syncDirectInventoryItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  values: {
    orgId: string;
    storeId: string;
    productId: string;
    name: string;
    unit: string;
    costPerUnit: number | null;
    minStock: number;
    supplierId: string | null;
    isActive: boolean;
  },
) {
  const existingResult = await supabase
    .from("inventory_items")
    .select("id")
    .eq("linked_product_id", values.productId)
    .maybeSingle();
  if (existingResult.error) return existingResult;

  if (existingResult.data?.id) {
    return supabase
      .from("inventory_items")
      .update({
        store_id: values.storeId,
        name: values.name,
        unit: values.unit,
        cost_per_unit: values.costPerUnit,
        min_stock: values.minStock,
        supplier_id: values.supplierId,
        is_active: values.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingResult.data.id)
      .eq("org_id", values.orgId);
  }

  return supabase.from("inventory_items").insert({
    org_id: values.orgId,
    store_id: values.storeId,
    linked_product_id: values.productId,
    name: values.name,
    item_type: "finished_good",
    unit: values.unit,
    cost_per_unit: values.costPerUnit,
    min_stock: values.minStock,
    supplier_id: values.supplierId,
    is_active: values.isActive,
  });
}

async function archiveProductInventory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  productId: string,
) {
  const [itemResult, recipeResult] = await Promise.all([
    supabase.from("inventory_items").update({ is_active: false, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("linked_product_id", productId),
    supabase.from("product_recipes").update({ is_active: false }).eq("org_id", orgId).eq("product_id", productId),
  ]);
  return itemResult.error ?? recipeResult.error ?? null;
}

function recipePayload(lines: RecipeLineDraft[]) {
  return lines.map((line) => ({
    inventory_item_id: line.inventory_item_id,
    quantity_per_unit: line.quantity_per_unit,
    waste_percent: line.waste_percent,
    note: line.note || null,
  }));
}

export type InlineCategoryResult =
  | { ok: true; category: { id: string; store_id: string; name: string } }
  | { ok: false; message: string };

export async function createCategoryInline(formData: FormData): Promise<InlineCategoryResult> {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");

  if (!storeId || !(await validStore(supabase, orgId, storeId, selectedBranchId, true))) {
    return { ok: false, message: "Choose a valid branch for this category." };
  }
  if (name.length < 2 || name.length > 80) {
    return { ok: false, message: "Category names must be between 2 and 80 characters." };
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({ org_id: orgId, store_id: storeId, name, icon: null, sort_order: 0, is_active: true })
    .select("id, store_id, name")
    .single();

  if (error || !data) return { ok: false, message: error?.message || "The category could not be created." };

  refreshCatalog();
  return { ok: true, category: data as { id: string; store_id: string; name: string } };
}

export async function createCategory(formData: FormData) {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const icon = readText(formData, "icon");
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

  if (!storeId || !(await validStore(supabase, orgId, storeId, selectedBranchId, true))) {
    catalogRedirect("Choose a valid branch for this category.");
  }
  if (name.length < 2 || name.length > 80) {
    catalogRedirect("Category names must be between 2 and 80 characters.");
  }
  if (sortOrder === null) {
    catalogRedirect("Sort order must be a whole number greater than or equal to zero.");
  }

  const { error } = await supabase.from("categories").insert({
    org_id: orgId,
    store_id: storeId,
    name,
    icon: icon || null,
    sort_order: sortOrder,
    is_active: true,
  });

  if (error) catalogRedirect(error.message || "The category could not be created.");

  refreshCatalog();
  redirect("/products?saved=category");
}

export async function updateCategory(formData: FormData) {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const categoryId = readText(formData, "category_id");
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const icon = readText(formData, "icon");
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

  if (!categoryId || !storeId || !(await validStore(supabase, orgId, storeId, selectedBranchId, true)) || !(await validCategory(supabase, orgId, storeId, categoryId, selectedBranchId))) {
    catalogRedirect("That category is not available in your organization.");
  }
  if (name.length < 2 || name.length > 80) {
    catalogRedirect("Category names must be between 2 and 80 characters.");
  }
  if (sortOrder === null) {
    catalogRedirect("Sort order must be a whole number greater than or equal to zero.");
  }

  const { error } = await supabase
    .from("categories")
    .update({
      name,
      icon: icon || null,
      sort_order: sortOrder,
      is_active: readBoolean(formData, "is_active"),
    })
    .eq("id", categoryId)
    .eq("org_id", orgId)
    .eq("store_id", storeId);

  if (error) catalogRedirect(error.message || "The category could not be updated.");

  refreshCatalog();
  redirect("/products?saved=category");
}

export async function createProduct(formData: FormData) {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const categoryId = readText(formData, "category_id");
  const name = readText(formData, "name");
  const pricingMode = readPricingMode(readText(formData, "pricing_mode"));
  const unit = readText(formData, "unit");
  const price = readPrice(readText(formData, "price"));
  const costPrice = readOptionalCostPrice(readText(formData, "cost_price"));
  const minimumStock = readMinimumStock(readText(formData, "min_stock"));
  const sku = readText(formData, "sku");
  const barcode = readText(formData, "barcode");
  const supplierId = readText(formData, "supplier_id");
  const imageFile = readImageFile(formData);
  const sortOrder = readSortOrder(readText(formData, "sort_order"));
  const inventoryMode = readInventoryMode(formData);
  const recipeLines = parseRecipeLines(readText(formData, "recipe_lines"));

  if (!storeId || !(await validStore(supabase, orgId, storeId, selectedBranchId, true))) {
    catalogRedirect("Choose a valid branch for this product.");
  }
  if (categoryId && !(await validCategory(supabase, orgId, storeId, categoryId, selectedBranchId))) {
    catalogRedirect("Choose a category from the selected branch.");
  }
  if (name.length < 2 || name.length > 120) {
    catalogRedirect("Product names must be between 2 and 120 characters.");
  }
  if (!pricingMode) catalogRedirect("Choose fixed pricing or price per kilogram.");
  if (!unit || unit.length > 24) catalogRedirect("Add a unit such as pcs, tray, cup, bottle, or kg.");
  if (price === null) catalogRedirect("Enter a valid non-negative price in pesos.");
  if (costPrice === undefined) catalogRedirect("Cost price must be a valid non-negative peso amount.");
  if (minimumStock === null) catalogRedirect("Minimum stock must be a valid non-negative quantity.");
  if (sku.length > 80 || barcode.length > 80) catalogRedirect("SKU and barcode must be 80 characters or fewer.");
  if (supplierId && !(await validSupplier(supabase, orgId, supplierId))) catalogRedirect("Choose a supplier from your organization.");
  if (imageFile === undefined) catalogRedirect("Choose a JPG, PNG, or WebP product photo under 900 KB.");
  if (sortOrder === null) catalogRedirect("Sort order must be a whole number greater than or equal to zero.");
  if (!inventoryMode) catalogRedirect("Choose how this product should affect inventory.");
  if (inventoryMode === "recipe" && recipeLines.length === 0) catalogRedirect("Add at least one ingredient before tracking this product by recipe.");

  const productId = crypto.randomUUID();
  const uploadedImage = imageFile ? await uploadOrganizationImage(supabase, orgId, productId, imageFile) : null;
  if (uploadedImage?.error || (uploadedImage && !uploadedImage.url)) {
    catalogRedirect("Product photo upload failed. Check that product image storage is configured, then try again.");
  }

  const baseRecord = {
    id: productId,
    org_id: orgId,
    store_id: storeId,
    category_id: categoryId || null,
    name,
    pricing_mode: pricingMode,
    price,
    unit,
    inventory_mode: inventoryMode,
    track_stock: inventoryMode === "direct",
    image_url: uploadedImage?.url ?? null,
    is_active: true,
    sort_order: sortOrder,
  };
  const result = await insertProductRecords(supabase, {
    ...baseRecord,
    sku: sku || null,
    barcode: barcode || null,
    cost_price: costPrice,
    min_stock: minimumStock,
    supplier_id: supplierId || null,
  });

  if (result.error) {
    await removeOrganizationImage(supabase, uploadedImage?.path ?? null);
    catalogRedirect(result.error.message || "The product could not be created.");
  }

  if (result.usedLegacySchema && inventoryMode !== "none") {
    await supabase.from("products").delete().eq("id", productId).eq("org_id", orgId);
    await removeOrganizationImage(supabase, uploadedImage?.path ?? null);
    catalogRedirect("Recipe inventory requires the latest database migration. Apply it, then try again.");
  }

  if (inventoryMode === "direct") {
    const inventoryResult = await syncDirectInventoryItem(supabase, {
      orgId,
      storeId,
      productId,
      name,
      unit,
      costPerUnit: costPrice,
      minStock: minimumStock,
      supplierId: supplierId || null,
      isActive: true,
    });
    if (inventoryResult.error) {
      await supabase.from("products").delete().eq("id", productId).eq("org_id", orgId);
      await removeOrganizationImage(supabase, uploadedImage?.path ?? null);
      catalogRedirect(inventorySchemaError(inventoryResult.error)
        ? "Recipe inventory requires the latest database migration. Apply it, then try again."
        : inventoryResult.error.message || "The finished-stock inventory record could not be created.");
    }
  }

  if (inventoryMode === "recipe") {
    const recipeResult = await supabase.rpc("save_product_recipe", {
      p_product_id: productId,
      p_lines: recipePayload(recipeLines),
    });
    if (recipeResult.error) {
      await supabase.from("products").delete().eq("id", productId).eq("org_id", orgId);
      await removeOrganizationImage(supabase, uploadedImage?.path ?? null);
      catalogRedirect(inventorySchemaError(recipeResult.error)
        ? "Recipe inventory requires the latest database migration. Apply it, then try again."
        : recipeResult.error.message || "The product recipe could not be saved.");
    }
  }

  refreshCatalog();
  if (readText(formData, "return_to") === "inventory") {
    redirect(`/admin/inventory?saved=product${result.usedLegacySchema ? "&legacy=1" : ""}`);
  }
  redirect(`/products?saved=product${result.usedLegacySchema ? "&legacy=1" : ""}`);
}

type BundleDraft = {
  templateId: string;
  price: number;
  openingStock: number;
  minStock: number;
};

function readBundleDrafts(value: string): BundleDraft[] | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length > 100) return null;

  const drafts: BundleDraft[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const templateId = typeof record.templateId === "string" ? record.templateId.trim() : "";
    const price = Number(record.price);
    const openingStock = Number(record.openingStock);
    const minStock = Number(record.minStock);
    if (
      !templateId ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > 100_000_000 ||
      !Number.isFinite(openingStock) ||
      openingStock < 0 ||
      openingStock > 1_000_000 ||
      !Number.isFinite(minStock) ||
      minStock < 0 ||
      minStock > 1_000_000
    ) {
      return null;
    }
    drafts.push({ templateId, price, openingStock, minStock });
  }

  return drafts;
}

export type ProductBundleResult = {
  ok: boolean;
  message: string;
  createdCount: number;
  skippedCount: number;
};

export async function createProductBundle(formData: FormData): Promise<ProductBundleResult> {
  const { supabase, orgId, userId, selectedBranchId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const presetId = readText(formData, "preset_id");
  const preset = getCatalogPreset(presetId);
  const drafts = readBundleDrafts(readText(formData, "products"));
  const useStockPhotos = readBoolean(formData, "use_stock_photos");

  if (!storeId || !(await validStore(supabase, orgId, storeId, selectedBranchId, true))) {
    return { ok: false, message: "Choose a valid active branch before adding starter products.", createdCount: 0, skippedCount: 0 };
  }
  if (!preset) {
    return { ok: false, message: "That starter catalog is no longer available. Refresh and try again.", createdCount: 0, skippedCount: 0 };
  }
  if (!drafts || drafts.length === 0) {
    return { ok: false, message: "Select at least one product to add.", createdCount: 0, skippedCount: 0 };
  }

  const templateById = new Map(preset.products.map((product) => [product.id, product]));
  const selectedTemplates = [];
  const selectedIds = new Set<string>();
  for (const draft of drafts) {
    const template = templateById.get(draft.templateId);
    if (!template || selectedIds.has(draft.templateId)) {
      return { ok: false, message: "One or more selected products are invalid. Refresh and try again.", createdCount: 0, skippedCount: 0 };
    }
    selectedIds.add(draft.templateId);
    selectedTemplates.push({ template, draft });
  }

  const { data: existingCategories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("store_id", storeId);

  if (categoriesError) {
    return { ok: false, message: categoriesError.message || "The starter categories could not be loaded.", createdCount: 0, skippedCount: 0 };
  }

  const categoryIds = new Map<string, string>(
    (existingCategories ?? []).map((category) => [String(category.name).trim().toLowerCase(), category.id]),
  );
  const categoryNames = new Set(selectedTemplates.map(({ template }) => template.category.toLowerCase()));

  for (const category of preset.categories) {
    const normalizedName = category.name.toLowerCase();
    if (!categoryNames.has(normalizedName) || categoryIds.has(normalizedName)) continue;
    const { data, error } = await supabase
      .from("categories")
      .insert({
        org_id: orgId,
        store_id: storeId,
        name: category.name,
        icon: category.icon,
        sort_order: preset.categories.indexOf(category),
        is_active: true,
      })
      .select("id, name")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message || "The " + category.name + " category could not be created.", createdCount: 0, skippedCount: 0 };
    }
    categoryIds.set(normalizedName, data.id);
  }

  const { data: existingProducts, error: productsError } = await supabase
    .from("products")
    .select("name")
    .eq("org_id", orgId)
    .eq("store_id", storeId);

  if (productsError) {
    return { ok: false, message: productsError.message || "The existing product catalog could not be checked.", createdCount: 0, skippedCount: 0 };
  }

  const existingProductNames = new Set((existingProducts ?? []).map((product) => String(product.name).trim().toLowerCase()));
  const newProducts = selectedTemplates.filter(({ template }) => !existingProductNames.has(template.name.toLowerCase()));
  const skippedCount = selectedTemplates.length - newProducts.length;

  if (!newProducts.length) {
    const businessPresetError = await saveOrganizationBusinessPreset(supabase, orgId, preset.id);
    if (!businessPresetError) invalidateAdminProfile(userId);
    refreshCatalog();
    return {
      ok: true,
      message: "All " + skippedCount + " selected products already exist in this branch." + (businessPresetError ? " The business selection could not be saved; try again from POS settings." : ""),
      createdCount: 0,
      skippedCount,
    };
  }

  const records = newProducts.map(({ template, draft }, index) => ({
    id: crypto.randomUUID(),
    org_id: orgId,
    store_id: storeId,
    category_id: categoryIds.get(template.category.toLowerCase()) ?? null,
    name: template.name,
    pricing_mode: template.pricingMode,
    price: toCentavos(draft.price),
    unit: template.unit,
    inventory_mode: "direct",
    track_stock: true,
    image_url: useStockPhotos ? template.imageUrl : null,
    is_active: true,
    sort_order: index,
    sku: null,
    barcode: null,
    cost_price: null,
    min_stock: draft.minStock,
    supplier_id: null,
  }));

  const result = await insertProductRecords(supabase, records);
  if (result.error) {
    return { ok: false, message: result.error.message || "The starter products could not be added.", createdCount: 0, skippedCount };
  }

  const stockWarnings: string[] = [];
  for (const product of newProducts.map(({ template, draft }, index) => ({ ...records[index], template, draft }))) {
    const inventoryResult = await syncDirectInventoryItem(supabase, {
      orgId,
      storeId,
      productId: product.id,
      name: product.name,
      unit: product.unit,
      costPerUnit: product.cost_price,
      minStock: product.min_stock,
      supplierId: product.supplier_id,
      isActive: true,
    });
    if (inventoryResult.error) {
      return { ok: false, message: inventorySchemaError(inventoryResult.error)
        ? "Recipe inventory requires the latest database migration. Apply it, then try again."
        : inventoryResult.error.message || "The starter inventory records could not be created.", createdCount: 0, skippedCount };
    }
    if (product.draft.openingStock <= 0) continue;
    const { error } = await supabase.rpc("record_stock_movement", {
      p_store_id: storeId,
      p_product_id: product.id,
      p_type: "receive",
      p_qty: product.draft.openingStock,
      p_unit_cost: null,
      p_reason: "Opening stock - " + preset.label,
    });
    if (error) stockWarnings.push(product.template.name);
  }

  refreshCatalog();
  const categoryCount = new Set(newProducts.map(({ template }) => template.category)).size;
  const stockMessage = stockWarnings.length
    ? " Opening stock still needs a quick review for " + stockWarnings.length + " item" + (stockWarnings.length === 1 ? "" : "s") + "."
    : "";
  const businessPresetError = await saveOrganizationBusinessPreset(supabase, orgId, preset.id);
  if (!businessPresetError) invalidateAdminProfile(userId);
  return {
    ok: true,
    message: "Added " + newProducts.length + " product" + (newProducts.length === 1 ? "" : "s") + " and " + categoryCount + " categor" + (categoryCount === 1 ? "y" : "ies") + " to this branch." +
      (skippedCount ? " Skipped " + skippedCount + " existing item" + (skippedCount === 1 ? "" : "s") + "." : "") +
      stockMessage + (businessPresetError ? " The business selection could not be saved; try again from POS settings." : ""),
    createdCount: newProducts.length,
    skippedCount,
  };
}

export async function updateProduct(formData: FormData) {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const productId = readText(formData, "product_id");
  const storeId = readText(formData, "store_id");
  const categoryId = readText(formData, "category_id");
  const name = readText(formData, "name");
  const pricingMode = readPricingMode(readText(formData, "pricing_mode"));
  const unit = readText(formData, "unit");
  const price = readPrice(readText(formData, "price"));
  const costPrice = readOptionalCostPrice(readText(formData, "cost_price"));
  const minimumStock = readMinimumStock(readText(formData, "min_stock"));
  const sku = readText(formData, "sku");
  const barcode = readText(formData, "barcode");
  const supplierId = readText(formData, "supplier_id");
  const imageFile = readImageFile(formData);
  const sortOrder = readSortOrder(readText(formData, "sort_order"));
  const inventoryMode = readInventoryMode(formData);
  const recipeLines = parseRecipeLines(readText(formData, "recipe_lines"));

  const currentProduct = productId ? await readProductContext(supabase, orgId, productId) : null;
  const currentStoreId = currentProduct?.store_id ?? null;
  if (!productId || !currentStoreId || (selectedBranchId && currentStoreId !== selectedBranchId) || !storeId || !(await validStore(supabase, orgId, storeId, selectedBranchId, true))) {
    catalogRedirect("Choose a valid branch for this product.");
  }
  if (categoryId && !(await validCategory(supabase, orgId, storeId, categoryId, selectedBranchId))) {
    catalogRedirect("Choose a category from the selected branch.");
  }
  if (name.length < 2 || name.length > 120) {
    catalogRedirect("Product names must be between 2 and 120 characters.");
  }
  if (!pricingMode) catalogRedirect("Choose fixed pricing or price per kilogram.");
  if (!unit || unit.length > 24) catalogRedirect("Add a unit such as pcs, tray, cup, bottle, or kg.");
  if (price === null) catalogRedirect("Enter a valid non-negative price in pesos.");
  if (costPrice === undefined) catalogRedirect("Cost price must be a valid non-negative peso amount.");
  if (minimumStock === null) catalogRedirect("Minimum stock must be a valid non-negative quantity.");
  if (sku.length > 80 || barcode.length > 80) catalogRedirect("SKU and barcode must be 80 characters or fewer.");
  if (supplierId && !(await validSupplier(supabase, orgId, supplierId))) catalogRedirect("Choose a supplier from your organization.");
  if (imageFile === undefined) catalogRedirect("Choose a JPG, PNG, or WebP product photo under 900 KB.");
  if (sortOrder === null) catalogRedirect("Sort order must be a whole number greater than or equal to zero.");
  if (!inventoryMode) catalogRedirect("Choose how this product should affect inventory.");
  if (inventoryMode === "recipe" && recipeLines.length === 0) catalogRedirect("Add at least one ingredient before tracking this product by recipe.");

  const uploadedImage = imageFile ? await uploadOrganizationImage(supabase, orgId, productId, imageFile) : null;
  if (uploadedImage?.error || (uploadedImage && !uploadedImage.url)) {
    catalogRedirect("Product photo upload failed. Check that product image storage is configured, then try again.");
  }

  const updateFields: Record<string, unknown> = {
    store_id: storeId,
    category_id: categoryId || null,
    name,
    sku: sku || null,
    barcode: barcode || null,
    pricing_mode: pricingMode,
    price,
    cost_price: costPrice,
    min_stock: minimumStock,
    unit,
    supplier_id: supplierId || null,
    inventory_mode: inventoryMode,
    track_stock: inventoryMode === "direct",
    is_active: readBoolean(formData, "is_active"),
    sort_order: sortOrder,
  };
  if (uploadedImage?.url) updateFields.image_url = uploadedImage.url;

  const result = await updateProductRecord(supabase, orgId, productId, currentStoreId, updateFields);

  if (result.error) {
    await removeOrganizationImage(supabase, uploadedImage?.path ?? null);
    catalogRedirect(result.error.message || "The product could not be updated.");
  }
  if (uploadedImage?.url) {
    await removeOrganizationImage(supabase, organizationImageStoragePath(currentProduct?.image_url ?? null, orgId));
  }

  if (result.usedLegacySchema && inventoryMode !== "none") {
    catalogRedirect("Recipe inventory requires the latest database migration. Apply it, then try again.");
  }

  if (inventoryMode === "direct") {
    const inventoryResult = await syncDirectInventoryItem(supabase, {
      orgId,
      storeId,
      productId,
      name,
      unit,
      costPerUnit: costPrice,
      minStock: minimumStock,
      supplierId: supplierId || null,
      isActive: true,
    });
    if (inventoryResult.error) {
      catalogRedirect(inventorySchemaError(inventoryResult.error)
        ? "Recipe inventory requires the latest database migration. Apply it, then try again."
        : inventoryResult.error.message || "The finished-stock inventory record could not be updated.");
    }
    const archiveResult = await supabase.from("product_recipes").update({ is_active: false }).eq("org_id", orgId).eq("product_id", productId).eq("is_active", true);
    if (archiveResult.error && !inventorySchemaError(archiveResult.error)) {
      catalogRedirect(archiveResult.error.message || "The old product recipe could not be archived.");
    }
  } else if (inventoryMode === "recipe") {
    const recipeResult = await supabase.rpc("save_product_recipe", {
      p_product_id: productId,
      p_lines: recipePayload(recipeLines),
    });
    if (recipeResult.error) {
      catalogRedirect(inventorySchemaError(recipeResult.error)
        ? "Recipe inventory requires the latest database migration. Apply it, then try again."
        : recipeResult.error.message || "The product recipe could not be saved.");
    }
    const itemResult = await supabase.from("inventory_items").update({ is_active: false }).eq("org_id", orgId).eq("linked_product_id", productId);
    if (itemResult.error && !inventorySchemaError(itemResult.error)) {
      catalogRedirect(itemResult.error.message || "The old finished-stock item could not be archived.");
    }
  } else {
    const archiveError = await archiveProductInventory(supabase, orgId, productId);
    if (archiveError && !inventorySchemaError(archiveError)) {
      catalogRedirect(archiveError.message || "The product inventory links could not be archived.");
    }
  }

  refreshCatalog();
  redirect(`/products?saved=product${result.usedLegacySchema ? "&legacy=1" : ""}`);
}

export async function importProducts(formData: FormData) {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const defaultStoreId = readText(formData, "store_id");
  const csv = readText(formData, "csv");

  if (!defaultStoreId || !(await validStore(supabase, orgId, defaultStoreId, selectedBranchId, true))) {
    catalogRedirect("Choose a valid default branch for the import.");
  }
  if (!csv) catalogRedirect("Paste CSV, TXT, or spreadsheet data before importing items.");
  if (new TextEncoder().encode(csv).byteLength > MAX_IMPORT_TEXT_BYTES) {
    catalogRedirect("This import is too large for one submission. Split the catalog into smaller files.");
  }

  const rows = parseDelimitedText(csv).filter(isNonEmptyImportRow);
  if (rows.length < 2) catalogRedirect("The import needs a header row and at least one item row.");

  const headers = (rows[0] ?? []).map(normalizeImportHeader);
  if (!headers.includes("name") || !headers.includes("price") || !headers.includes("unit")) {
    catalogRedirect("Import headers must include name, price, and unit.");
  }

  const [storesResult, categoriesResult, suppliersResult] = await Promise.all([
    supabase.from("stores").select("id, name, is_active").eq("org_id", orgId),
    supabase.from("categories").select("id, store_id, name").eq("org_id", orgId),
    supabase.from("suppliers").select("id, name").eq("org_id", orgId),
  ]);
  const stores = (storesResult.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>;
  const categories = (categoriesResult.data ?? []) as Array<{ id: string; store_id: string; name: string }>;
  const suppliers = (suppliersResult.data ?? []) as Array<{ id: string; name: string }>;
  const defaultStore = stores.find((store) => store.id === defaultStoreId);
  const records: Array<Record<string, unknown>> = [];

  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index];
    const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
    const storeId = row.store_id || defaultStoreId;
    const store = stores.find((item) => item.id === storeId || item.name.toLowerCase() === String(storeId).toLowerCase());
    if (!store) catalogRedirect(`Row ${index + 1}: choose a valid store_id or branch name.`);
    if (!store.is_active) catalogRedirect(`Row ${index + 1}: products can only be added to an active branch.`);
    if (selectedBranchId && store.id !== selectedBranchId) catalogRedirect(`Row ${index + 1}: the selected branch is ${selectedBranchId === defaultStoreId ? "required" : "not available"} for this import.`);
    const categoryValue = String(row.category_id ?? row.category ?? "").trim();
    const category = categoryValue ? categories.find((item) => item.id === categoryValue || (item.store_id === store.id && item.name.toLowerCase() === categoryValue.toLowerCase())) : undefined;
    if (categoryValue && !category) catalogRedirect(`Row ${index + 1}: category does not belong to the selected branch.`);
    const supplierValue = String(row.supplier_id ?? row.supplier ?? "").trim();
    const supplier = supplierValue ? suppliers.find((item) => item.id === supplierValue || item.name.toLowerCase() === supplierValue.toLowerCase()) : undefined;
    if (supplierValue && !supplier) catalogRedirect(`Row ${index + 1}: supplier was not found in this organization.`);
    const name = String(row.name ?? "").trim();
    const unit = String(row.unit ?? "").trim();
    const pricingMode = readPricingMode(String(row.pricing_mode ?? "fixed"));
    const price = readPrice(String(row.price ?? ""));
    const costPrice = readOptionalCostPrice(String(row.cost_price ?? ""));
    const minimumStock = readMinimumStock(String(row.min_stock ?? ""));
    const imagePath = readImportImagePath(String(row.image_url ?? "").trim());
    const importedTrackStock = readImportBoolean(typeof row.track_stock === "string" ? row.track_stock : "", true);
    const importedModeValue = String(row.inventory_mode ?? "").trim();
    const importedInventoryMode = importedModeValue
      ? (isInventoryMode(importedModeValue) ? importedModeValue : null)
      : importedTrackStock ? "direct" : "none";
    if (name.length < 2 || name.length > 120 || !unit || unit.length > 24 || !pricingMode || price === null) catalogRedirect(`Row ${index + 1}: name, unit, pricing_mode, and a valid price are required.`);
    if (costPrice === undefined || minimumStock === null || imagePath === undefined) catalogRedirect(`Row ${index + 1}: cost, minimum stock, or legacy image value is invalid.`);
    if (!importedInventoryMode || importedInventoryMode === "recipe") catalogRedirect(`Row ${index + 1}: recipe products must be created from the product editor with ingredients.`);
    records.push({
      id: crypto.randomUUID(),
      org_id: orgId,
      store_id: store.id,
      category_id: category?.id ?? null,
      supplier_id: supplier?.id ?? null,
      name,
      sku: String(row.sku ?? "").trim() || null,
      barcode: String(row.barcode ?? "").trim() || null,
      pricing_mode: pricingMode,
      price,
      cost_price: costPrice,
      min_stock: minimumStock,
      unit,
      inventory_mode: importedInventoryMode,
      track_stock: importedInventoryMode === "direct",
      image_url: imagePath,
      is_active: readImportBoolean(typeof row.is_active === "string" ? row.is_active : "", true),
      sort_order: Number.isInteger(Number(row.sort_order)) && Number(row.sort_order) >= 0 ? Number(row.sort_order) : 0,
    });
  }

  const result = await insertProductRecords(supabase, records);
  if (result.error) catalogRedirect(result.error.message || "The inventory items could not be imported.");

  if (result.usedLegacySchema && records.some((record) => record.inventory_mode !== "none")) {
    catalogRedirect("Recipe inventory requires the latest database migration. Apply it, then try again.");
  }
  for (const record of records.filter((item) => item.inventory_mode === "direct")) {
    const inventoryResult = await syncDirectInventoryItem(supabase, {
      orgId,
      storeId: String(record.store_id),
      productId: String(record.id),
      name: String(record.name),
      unit: String(record.unit),
      costPerUnit: typeof record.cost_price === "number" ? record.cost_price : null,
      minStock: Number(record.min_stock),
      supplierId: typeof record.supplier_id === "string" ? record.supplier_id : null,
      isActive: Boolean(record.is_active),
    });
    if (inventoryResult.error) catalogRedirect(inventoryResult.error.message || "The imported inventory items could not be linked.");
  }

  refreshCatalog();
  redirect(`/products?saved=imported${result.usedLegacySchema ? "&legacy=1" : ""}${defaultStore ? `&store=${encodeURIComponent(defaultStore.name)}` : ""}`);
}

export async function toggleProductVisibility(formData: FormData) {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const productId = readText(formData, "product_id");
  const requestedValue = readText(formData, "is_active");
  const isActive = requestedValue === "true";

  if (!productId || (requestedValue !== "true" && requestedValue !== "false")) {
    catalogRedirect("That product visibility change is invalid.");
  }

  const currentProduct = await readProductContext(supabase, orgId, productId);
  const currentStoreId = currentProduct?.store_id ?? null;
  if (!currentStoreId || (selectedBranchId && currentStoreId !== selectedBranchId) || !(await validStore(supabase, orgId, currentStoreId, selectedBranchId, true))) {
    catalogRedirect("That product is outside the selected branch.");
  }

  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId)
    .eq("org_id", orgId)
    .eq("store_id", currentStoreId);

  if (error) catalogRedirect(error.message || "The product visibility could not be updated.");

  refreshCatalog();
  redirect(`/products?saved=visibility&product=${encodeURIComponent(productId)}`);
}

export async function bulkUpdateProducts(formData: FormData) {
  const { supabase, orgId, selectedBranchId } = await requireAdmin();
  const selectedIds = formData.getAll("product_ids").filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const productIds = Array.from(new Set(selectedIds)).slice(0, 100);
  const isActive = readText(formData, "is_active");
  const inventoryMode = readText(formData, "inventory_mode");

  if (productIds.length === 0) catalogRedirect("Select at least one product for the bulk update.");
  if (!["leave", "true", "false"].includes(isActive) || !["leave", "direct", "none"].includes(inventoryMode)) {
    catalogRedirect("Choose valid bulk update values.");
  }

  const fields: Record<string, unknown> = {};
  if (isActive !== "leave") fields.is_active = isActive === "true";
  if (inventoryMode !== "leave") {
    fields.inventory_mode = inventoryMode;
    fields.track_stock = inventoryMode === "direct";
  }
  if (Object.keys(fields).length === 0) catalogRedirect("Choose at least one field to update.");

  const { data: selectedProducts, error: selectedProductsError } = await supabase
    .from("products")
    .select("id, store_id, name, unit, cost_price, min_stock, supplier_id, is_active")
    .eq("org_id", orgId)
    .in("id", productIds);

  const selectedStoreIds = Array.from(new Set((selectedProducts ?? []).map((product) => product.store_id)));
  const { data: activeStores, error: activeStoresError } = selectedStoreIds.length
    ? await supabase.from("stores").select("id").eq("org_id", orgId).eq("is_active", true).in("id", selectedStoreIds)
    : { data: [], error: null };
  const activeStoreIds = new Set((activeStores ?? []).map((store) => store.id));
  if (selectedProductsError || selectedProducts?.length !== productIds.length || selectedProducts.some((product) => selectedBranchId && product.store_id !== selectedBranchId) || activeStoresError || activeStoreIds.size !== selectedStoreIds.length) {
    catalogRedirect("One or more selected products are outside the current branch context.");
  }

  let productUpdate = supabase
    .from("products")
    .update(fields)
    .eq("org_id", orgId)
    .in("id", productIds);
  if (selectedBranchId) productUpdate = productUpdate.eq("store_id", selectedBranchId);
  const { error } = await productUpdate;

  if (error) catalogRedirect(error.message || "The selected products could not be updated.");

  if (inventoryMode !== "leave") {
    for (const product of selectedProducts ?? []) {
      if (inventoryMode === "direct") {
        const inventoryResult = await syncDirectInventoryItem(supabase, {
          orgId,
          storeId: product.store_id,
          productId: product.id,
          name: product.name,
          unit: product.unit,
          costPerUnit: product.cost_price,
          minStock: product.min_stock,
          supplierId: product.supplier_id,
          isActive: true,
        });
        if (inventoryResult.error) catalogRedirect(inventoryResult.error.message || "The selected products could not be linked to inventory.");
        await supabase.from("product_recipes").update({ is_active: false }).eq("org_id", orgId).eq("product_id", product.id).eq("is_active", true);
      } else {
        const archiveError = await archiveProductInventory(supabase, orgId, product.id);
        if (archiveError && !inventorySchemaError(archiveError)) catalogRedirect(archiveError.message || "The selected inventory links could not be archived.");
      }
    }
  }

  refreshCatalog();
  redirect(`/products?saved=bulk&updated=${productIds.length}`);
}
