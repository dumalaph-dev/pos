"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type PricingMode = "fixed" | "per_kg";

function catalogRedirect(message: string): never {
  redirect(`/admin/catalog?error=${encodeURIComponent(message)}`);
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

function readImagePath(value: string) {
  if (!value) return null;
  if (!value.startsWith("/") || value.length > 500) return undefined;
  return value;
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

  if (!profile || profile.role !== "admin") {
    catalogRedirect("Only organization admins can manage the product catalog.");
  }

  return { supabase, orgId: profile.org_id };
}

async function validStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  const { data } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

async function validCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  storeId: string,
  categoryId: string,
) {
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("store_id", storeId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

function refreshCatalog() {
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/pos");
}

export async function createCategory(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const icon = readText(formData, "icon");
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

  if (!storeId || !(await validStore(supabase, orgId, storeId))) {
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
  redirect("/admin/catalog?saved=category");
}

export async function updateCategory(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const categoryId = readText(formData, "category_id");
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const icon = readText(formData, "icon");
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

  if (!categoryId || !storeId || !(await validCategory(supabase, orgId, storeId, categoryId))) {
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
    .eq("org_id", orgId);

  if (error) catalogRedirect(error.message || "The category could not be updated.");

  refreshCatalog();
  redirect("/admin/catalog?saved=category");
}

export async function createProduct(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const categoryId = readText(formData, "category_id");
  const name = readText(formData, "name");
  const pricingMode = readPricingMode(readText(formData, "pricing_mode"));
  const unit = readText(formData, "unit");
  const price = readPrice(readText(formData, "price"));
  const imagePath = readImagePath(readText(formData, "image_url"));
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

  if (!storeId || !(await validStore(supabase, orgId, storeId))) {
    catalogRedirect("Choose a valid branch for this product.");
  }
  if (categoryId && !(await validCategory(supabase, orgId, storeId, categoryId))) {
    catalogRedirect("Choose a category from the selected branch.");
  }
  if (name.length < 2 || name.length > 120) {
    catalogRedirect("Product names must be between 2 and 120 characters.");
  }
  if (!pricingMode) catalogRedirect("Choose fixed pricing or price per kilogram.");
  if (!unit || unit.length > 24) catalogRedirect("Add a unit such as pcs, tray, cup, bottle, or kg.");
  if (price === null) catalogRedirect("Enter a valid non-negative price in pesos.");
  if (imagePath === undefined) catalogRedirect("Image paths must be local paths such as /food/product.png.");
  if (sortOrder === null) catalogRedirect("Sort order must be a whole number greater than or equal to zero.");

  const { error } = await supabase.from("products").insert({
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
  });

  if (error) catalogRedirect(error.message || "The product could not be created.");

  refreshCatalog();
  redirect("/admin/catalog?saved=product");
}

export async function updateProduct(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const productId = readText(formData, "product_id");
  const storeId = readText(formData, "store_id");
  const categoryId = readText(formData, "category_id");
  const name = readText(formData, "name");
  const pricingMode = readPricingMode(readText(formData, "pricing_mode"));
  const unit = readText(formData, "unit");
  const price = readPrice(readText(formData, "price"));
  const imagePath = readImagePath(readText(formData, "image_url"));
  const sortOrder = readSortOrder(readText(formData, "sort_order"));

  if (!productId || !storeId || !(await validStore(supabase, orgId, storeId))) {
    catalogRedirect("Choose a valid branch for this product.");
  }
  if (categoryId && !(await validCategory(supabase, orgId, storeId, categoryId))) {
    catalogRedirect("Choose a category from the selected branch.");
  }
  if (name.length < 2 || name.length > 120) {
    catalogRedirect("Product names must be between 2 and 120 characters.");
  }
  if (!pricingMode) catalogRedirect("Choose fixed pricing or price per kilogram.");
  if (!unit || unit.length > 24) catalogRedirect("Add a unit such as pcs, tray, cup, bottle, or kg.");
  if (price === null) catalogRedirect("Enter a valid non-negative price in pesos.");
  if (imagePath === undefined) catalogRedirect("Image paths must be local paths such as /food/product.png.");
  if (sortOrder === null) catalogRedirect("Sort order must be a whole number greater than or equal to zero.");

  const { error } = await supabase
    .from("products")
    .update({
      store_id: storeId,
      category_id: categoryId || null,
      name,
      pricing_mode: pricingMode,
      price,
      unit,
      track_stock: readBoolean(formData, "track_stock"),
      image_url: imagePath,
      is_active: readBoolean(formData, "is_active"),
      sort_order: sortOrder,
    })
    .eq("id", productId)
    .eq("org_id", orgId);

  if (error) catalogRedirect(error.message || "The product could not be updated.");

  refreshCatalog();
  redirect("/admin/catalog?saved=product");
}
