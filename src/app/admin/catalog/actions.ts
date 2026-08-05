"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";

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

function readImagePath(value: string) {
  if (!value) return null;
  if (!value.startsWith("/") || value.length > 500) return undefined;
  return value;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function readImportBoolean(value: string, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const OPTIONAL_PRODUCT_COLUMNS = ["sku", "barcode", "cost_price", "min_stock", "supplier_id"] as const;

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

  return { supabase, orgId: profile.org_id, selectedBranchId };
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

async function readProductStoreId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  productId: string,
) {
  const { data } = await supabase
    .from("products")
    .select("store_id")
    .eq("id", productId)
    .eq("org_id", orgId)
    .maybeSingle();
  return data?.store_id ?? null;
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
  revalidatePath("/admin");
  revalidatePath("/pos");
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
  const imagePath = readImagePath(readText(formData, "image_url"));
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

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
  if (imagePath === undefined) catalogRedirect("Image paths must be local paths such as /food/product.png.");
  if (sortOrder === null) catalogRedirect("Sort order must be a whole number greater than or equal to zero.");

  const baseRecord = {
    org_id: orgId,
    store_id: storeId,
    category_id: categoryId || null,
    name,
    pricing_mode: pricingMode,
    price,
    unit,
    track_stock: readBoolean(formData, "track_stock"),
    image_url: imagePath,
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

  if (result.error) catalogRedirect(result.error.message || "The product could not be created.");

  refreshCatalog();
  redirect(`/products?saved=product${result.usedLegacySchema ? "&legacy=1" : ""}`);
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
  const imagePath = readImagePath(readText(formData, "image_url"));
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

  const currentStoreId = productId ? await readProductStoreId(supabase, orgId, productId) : null;
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
  if (imagePath === undefined) catalogRedirect("Image paths must be local paths such as /food/product.png.");
  if (sortOrder === null) catalogRedirect("Sort order must be a whole number greater than or equal to zero.");

  const result = await updateProductRecord(supabase, orgId, productId, currentStoreId, {
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
    track_stock: readBoolean(formData, "track_stock"),
    image_url: imagePath,
    is_active: readBoolean(formData, "is_active"),
    sort_order: sortOrder,
  });

  if (result.error) catalogRedirect(result.error.message || "The product could not be updated.");

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
  if (!csv) catalogRedirect("Paste a CSV file before importing items.");

  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) catalogRedirect("The CSV needs a header row and at least one item row.");

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, "_"));
  if (!headers.includes("name") || !headers.includes("price") || !headers.includes("unit")) {
    catalogRedirect("CSV headers must include name, price, and unit.");
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

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
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
    const imagePath = readImagePath(String(row.image_url ?? "").trim());
    if (name.length < 2 || name.length > 120 || !unit || unit.length > 24 || !pricingMode || price === null) catalogRedirect(`Row ${index + 1}: name, unit, pricing_mode, and a valid price are required.`);
    if (costPrice === undefined || minimumStock === null || imagePath === undefined) catalogRedirect(`Row ${index + 1}: cost, minimum stock, or image path is invalid.`);
    records.push({
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
      track_stock: readImportBoolean(typeof row.track_stock === "string" ? row.track_stock : "", true),
      image_url: imagePath,
      is_active: readImportBoolean(typeof row.is_active === "string" ? row.is_active : "", true),
      sort_order: Number.isInteger(Number(row.sort_order)) && Number(row.sort_order) >= 0 ? Number(row.sort_order) : 0,
    });
  }

  const result = await insertProductRecords(supabase, records);
  if (result.error) catalogRedirect(result.error.message || "The inventory items could not be imported.");

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

  const currentStoreId = await readProductStoreId(supabase, orgId, productId);
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
  const trackStock = readText(formData, "track_stock");

  if (productIds.length === 0) catalogRedirect("Select at least one product for the bulk update.");
  if (!["leave", "true", "false"].includes(isActive) || !["leave", "true", "false"].includes(trackStock)) {
    catalogRedirect("Choose valid bulk update values.");
  }

  const fields: Record<string, boolean> = {};
  if (isActive !== "leave") fields.is_active = isActive === "true";
  if (trackStock !== "leave") fields.track_stock = trackStock === "true";
  if (Object.keys(fields).length === 0) catalogRedirect("Choose at least one field to update.");

  const { data: selectedProducts, error: selectedProductsError } = await supabase
    .from("products")
    .select("id, store_id")
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

  refreshCatalog();
  redirect(`/products?saved=bulk&updated=${productIds.length}`);
}
