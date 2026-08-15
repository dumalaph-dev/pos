import Image from "next/image";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { BranchProductSelector } from "@/components/admin/BranchProductSelector";
import { AdminMutationForm } from "@/components/admin/AdminMutationForm";
import { MultiProductModal } from "@/components/admin/MultiProductModal";
import { AdminReadModelHydrator, type AdminReadModelBatch } from "@/components/admin/AdminReadModelHydrator";
import { YieldEntryForm } from "@/components/admin/YieldEntryForm";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { categoryIconName } from "@/lib/category-icons";
import { isProductImageUrl } from "@/lib/product-images";
import {
  formatStockQuantity,
  stockMovementDelta,
  type StockMovementType,
} from "@/lib/inventory";
import { getAdminProfile } from "@/lib/admin/profile";
import { getAdminBranchOptions } from "@/lib/admin/branches";
import { isLechonHouseBusiness, readBusinessPresetId } from "@/lib/admin/business";
import { readAdminBranding } from "@/lib/admin/branding";
import { dashboardLowStockThreshold, readAdminInventorySettings } from "@/lib/admin/inventory-settings";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getSelectedAdminBranchId } from "@/lib/admin/branch-context";
import { OwnerGuidance } from "@/components/admin/OwnerOnboardingPanel";
import type {
  InventoryMovementReadModel,
  InventoryProductReadModel,
  InventoryStockSnapshot,
} from "@/lib/admin/inventory-read-models";
import type { AdminCacheScope } from "@/lib/admin/local-first-store";

type AdminRole = "admin" | "manager" | "cashier";
type PricingMode = "fixed" | "per_kg";
type InventoryStatus = "all" | "in_stock" | "low" | "out";
type InventoryColumn = "sku" | "category" | "unit" | "stock" | "status" | "cost" | "selling" | "supplier";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: { name?: string; settings?: unknown } | null;
};

type BranchRecord = {
  id: string;
  name: string;
  is_active: boolean;
};

type CategoryRecord = {
  id: string;
  store_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

type SupplierRecord = {
  id: string;
  store_id: string | null;
  name: string;
  is_active: boolean;
};

type ProductRecord = {
  id: string;
  store_id: string;
  category_id: string | null;
  supplier_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  pricing_mode: PricingMode;
  price: number;
  cost_price: number | null;
  unit: string;
  min_stock: number;
  track_stock: boolean;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

type BaseProductRecord = Omit<ProductRecord, "supplier_id" | "sku" | "barcode" | "cost_price" | "min_stock">;
type InventoryProductOption = Pick<ProductRecord, "id" | "name" | "store_id" | "unit">;

type MovementRecord = {
  id: string;
  store_id: string;
  product_id: string;
  type: StockMovementType;
  qty: number;
  unit: string;
  unit_cost: number | null;
  reason: string | null;
  ref_order_id: string | null;
  created_at: string;
};

type StockRow = {
  store_id: string;
  product_id: string;
  qty: number;
};

type InventoryRow = {
  branch: BranchRecord;
  product: ProductRecord;
  categoryName: string;
  supplierName: string;
  onHand: number;
  minStock: number;
  status: Exclude<InventoryStatus, "all">;
  inventoryValue: number;
};

const DEFAULT_STORE_NAME = "Your Store";
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_PRODUCT_IMAGES: Record<string, string> = {
  "whole lechon (small)": "/food/whole-lechon-small.webp",
  "whole lechon (medium)": "/food/whole-lechon-medium.webp",
  "whole lechon (large)": "/food/whole-lechon-medium.webp",
  "lechon belly (1/2kg)": "/food/lechon-belly-half.webp",
  "lechon belly (1kg)": "/food/lechon-belly-one.webp",
  "lechon paksiw (1/2kg)": "/food/lechon-paksiw.webp",
  "lechon kawali (1/2kg)": "/food/lechon-kawali.webp",
  "rice & sides": "/food/rice-sides.webp",
  "java rice": "/food/java-rice.webp",
  "mang tomas (small)": "/food/mang-tomas.webp",
};

const columnOptions: Array<{ value: InventoryColumn; label: string }> = [
  { value: "sku", label: "SKU / barcode" },
  { value: "category", label: "Category" },
  { value: "unit", label: "Unit" },
  { value: "stock", label: "Stock on hand" },
  { value: "status", label: "Status" },
  { value: "cost", label: "Cost price" },
  { value: "selling", label: "Selling price" },
  { value: "supplier", label: "Supplier" },
];

const movementOptions: Array<{ value: Exclude<StockMovementType, "sale">; label: string; detail: string }> = [
  { value: "receive", label: "Stock in", detail: "Add purchased or opening stock" },
  { value: "yield_out", label: "Stock out", detail: "Consume stock during prep or service" },
  { value: "yield_in", label: "Yield in", detail: "Add usable product from prep" },
  { value: "waste", label: "Waste / spoilage", detail: "Remove damaged or spoiled stock" },
  { value: "adjust", label: "Adjustment", detail: "Signed correction after a count" },
];

const statusOptions: Array<{ value: InventoryStatus; label: string }> = [
  { value: "all", label: "All status" },
  { value: "in_stock", label: "In stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readValues(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function isInventoryStatus(value: string): value is InventoryStatus {
  return statusOptions.some((option) => option.value === value);
}

function isInventoryColumn(value: string): value is InventoryColumn {
  return columnOptions.some((column) => column.value === value);
}

function readColumns(value: string | string[] | undefined) {
  const requested = readValues(value)
    .flatMap((item) => item.split(","))
    .filter(isInventoryColumn);
  return new Set<InventoryColumn>(requested.length > 0 ? requested : columnOptions.map((column) => column.value));
}

function readPageSize(value: string) {
  const parsed = Number(value);
  return parsed === 25 || parsed === 50 ? parsed : 10;
}

type SupabaseQueryError = { code?: string; message?: string; details?: string } | null | undefined;
const OPTIONAL_INVENTORY_FIELDS = ["sku", "barcode", "cost_price", "min_stock", "supplier_id"];

function isInventorySchemaError(error: SupabaseQueryError) {
  if (!error) return false;
  const code = error.code ?? "";
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  const pointsToInventorySchema = OPTIONAL_INVENTORY_FIELDS.some((field) => message.includes(field)) || message.includes("supplier");
  const indicatesMissingSchema = ["42703", "42P01", "PGRST204", "PGRST205"].includes(code)
    || message.includes("schema cache")
    || message.includes("does not exist")
    || message.includes("could not find the table");
  return pointsToInventorySchema && indicatesMissingSchema;
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatToday(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(value);
}

function getSingaporeDayBounds() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const start = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function productImage(product: ProductRecord) {
  return isProductImageUrl(product.image_url)
    ? product.image_url
    : LOCAL_PRODUCT_IMAGES[product.name.trim().toLowerCase()] ?? "/food/whole-lechon-small.webp";
}

function statusFor(onHand: number, minStock: number): Exclude<InventoryStatus, "all"> {
  if (onHand <= 0) return "out";
  if (onHand <= minStock) return "low";
  return "in_stock";
}

function statusLabel(status: Exclude<InventoryStatus, "all">) {
  if (status === "out") return "Out of stock";
  if (status === "low") return "Low stock";
  return "In stock";
}

function statusClass(status: Exclude<InventoryStatus, "all">) {
  if (status === "out") return "bg-danger-soft text-danger";
  if (status === "low") return "bg-warning/15 text-warning";
  return "bg-success/10 text-success";
}

function movementLabel(type: StockMovementType) {
  if (type === "receive") return "Stock in";
  if (type === "yield_in") return "Yield in";
  if (type === "yield_out") return "Stock out";
  if (type === "waste") return "Waste";
  if (type === "sale") return "POS sale";
  return "Adjustment";
}

function movementClass(type: StockMovementType) {
  if (type === "receive" || type === "yield_in") return "bg-success/10 text-success";
  if (type === "sale" || type === "waste" || type === "yield_out") return "bg-danger-soft text-danger";
  return "bg-warning/15 text-warning";
}

function buildInventoryHref({
  q,
  category,
  status,
  supplier,
  page,
  pageSize,
  product,
  movement,
  columns,
}: {
  q: string;
  category: string;
  status: InventoryStatus;
  supplier: string;
  page: number;
  pageSize: number;
  product?: string;
  movement?: string;
  columns?: Set<InventoryColumn>;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category !== "all") params.set("category", category);
  if (status !== "all") params.set("status", status);
  if (supplier) params.set("supplier", supplier);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 10) params.set("pageSize", String(pageSize));
  if (product) params.set("product", product);
  if (movement) params.set("movement", movement);
  if (columns && columns.size < columnOptions.length) params.set("columns", [...columns].join(","));
  const query = params.toString();
  return query ? `/admin/inventory?${query}` : "/admin/inventory";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    saved?: string | string[];
    q?: string | string[];
    category?: string | string[];
    status?: string | string[];
    supplier?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    columns?: string | string[];
    product?: string | string[];
    movement?: string | string[];
    yield?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <InventoryProfileMissing />;
  const inventorySettings = readAdminInventorySettings(profile.organizations?.settings);

  const { start: todayStart, end: todayEnd } = getSingaporeDayBounds();
  const branchesResult = await getAdminBranchOptions(profile.org_id);
  const branches = branchesResult.data as BranchRecord[];
  const selectedBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(branches, profile.store_id)
    : profile.store_id;
  const visibleBranches = selectedBranchId
    ? branches.filter((branch) => branch.id === selectedBranchId)
    : branches;

  let categoriesQuery = supabase
    .from("categories")
    .select("id, store_id, name, icon, sort_order, is_active")
    .eq("org_id", profile.org_id)
    .order("sort_order")
    .order("name");
  let productsQuery = supabase
    .from("products")
    .select("id, store_id, category_id, supplier_id, name, sku, barcode, pricing_mode, price, cost_price, unit, min_stock, track_stock, image_url, is_active, sort_order")
    .eq("org_id", profile.org_id)
    .eq("track_stock", true)
    .order("sort_order")
    .order("name")
    .limit(2000);
  let recentMovementsQuery = supabase
    .from("stock_movements")
    .select("id, store_id, product_id, type, qty, unit, unit_cost, reason, ref_order_id, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(100);
  let movedTodayQuery = supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .gte("created_at", todayStart.toISOString())
    .lt("created_at", todayEnd.toISOString());
  let posSaleCountQuery = supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .eq("type", "sale");
  if (selectedBranchId) {
    categoriesQuery = categoriesQuery.eq("store_id", selectedBranchId);
    productsQuery = productsQuery.eq("store_id", selectedBranchId);
    recentMovementsQuery = recentMovementsQuery.eq("store_id", selectedBranchId);
    movedTodayQuery = movedTodayQuery.eq("store_id", selectedBranchId);
    posSaleCountQuery = posSaleCountQuery.eq("store_id", selectedBranchId);
  }

  const [categoriesResult, suppliersResult, productsResult, recentMovementsResult, stockResult, movedTodayResult, posSaleCountResult] = await Promise.all([
    categoriesQuery,
    supabase
      .from("suppliers")
      .select("id, store_id, name, is_active")
      .eq("org_id", profile.org_id)
      .order("name")
      .limit(1000),
    productsQuery,
    recentMovementsQuery,
    // On-hand totals come from the server-side ledger aggregation. The raw
    // movement query is intentionally small for the history preview and is
    // expanded only if the RPC is unavailable.
    supabase.rpc("current_stock", { p_org_id: profile.org_id }),
    movedTodayQuery,
    posSaleCountQuery,
  ]);

  const categories = (categoriesResult.data ?? []) as CategoryRecord[];
  const suppliers = (suppliersResult.data ?? []) as SupplierRecord[];
  let products = (productsResult.data ?? []) as ProductRecord[];
  let productsQueryWarning = Boolean(productsResult.error);
  let productsSchemaWarning = isInventorySchemaError(productsResult.error);

  if (productsResult.error) {
    let fallbackProductsQuery = supabase
      .from("products")
      .select("id, store_id, category_id, name, pricing_mode, price, unit, track_stock, image_url, is_active, sort_order")
      .eq("org_id", profile.org_id)
      .eq("track_stock", true)
      .order("sort_order")
      .order("name")
      .limit(2000);
    if (selectedBranchId) fallbackProductsQuery = fallbackProductsQuery.eq("store_id", selectedBranchId);
    const fallbackProductsResult = await fallbackProductsQuery;
    const fallbackProducts = (fallbackProductsResult.data ?? []) as BaseProductRecord[];
    productsSchemaWarning = productsSchemaWarning || isInventorySchemaError(fallbackProductsResult.error);
    products = fallbackProducts.map((product) => ({
      ...product,
      sku: null,
      barcode: null,
      cost_price: null,
      min_stock: inventorySettings.defaultLowStockThreshold,
      supplier_id: null,
    }));
    productsQueryWarning = true;
  }

  if (selectedBranchId) {
    products = products.filter((product) => product.store_id === selectedBranchId);
  }

  let movements = (recentMovementsResult.data ?? []) as MovementRecord[];
  let movementQueryError = Boolean(recentMovementsResult.error);
  if (stockResult.error) {
    let fallbackMovementsQuery = supabase
      .from("stock_movements")
      .select("id, store_id, product_id, type, qty, unit, unit_cost, reason, ref_order_id, created_at")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (selectedBranchId) fallbackMovementsQuery = fallbackMovementsQuery.eq("store_id", selectedBranchId);
    const fallbackMovementsResult = await fallbackMovementsQuery;
    movements = (fallbackMovementsResult.data ?? []) as MovementRecord[];
    movementQueryError = Boolean(fallbackMovementsResult.error);
  }
  if (selectedBranchId) {
    movements = movements.filter((movement) => movement.store_id === selectedBranchId);
  }
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const trackedProducts = products.filter((product) => product.track_stock);
  const stockByKey = new Map<string, number>();
  if (stockResult.error) {
    // current_stock RPC unavailable (migration not applied yet): fall back to
    // deriving stock from the movements history fetch, as before.
    for (const movement of movements) {
      const key = `${movement.store_id}:${movement.product_id}`;
      stockByKey.set(key, (stockByKey.get(key) ?? 0) + stockMovementDelta(movement.type, Number(movement.qty)));
    }
  } else {
    for (const row of (stockResult.data ?? []) as StockRow[]) {
      stockByKey.set(`${row.store_id}:${row.product_id}`, Number(row.qty));
    }
  }

  const allRows: InventoryRow[] = trackedProducts.flatMap((product) => {
    const branch = branchById.get(product.store_id);
    if (!branch) return [];
    const onHand = stockByKey.get(`${branch.id}:${product.id}`) ?? 0;
    const minStock = dashboardLowStockThreshold(product.min_stock, inventorySettings.defaultLowStockThreshold);
    const costRate = product.cost_price ?? product.price;
    return [{
      branch,
      product,
      categoryName: product.category_id ? categoryById.get(product.category_id)?.name ?? "Uncategorized" : "Uncategorized",
      supplierName: product.supplier_id ? supplierById.get(product.supplier_id)?.name ?? "Unassigned" : "Unassigned",
      onHand,
      minStock,
      status: statusFor(onHand, minStock),
      inventoryValue: Math.max(0, onHand) * Number(costRate),
    }];
  });

  const requestedStatus = readParam(params.status);
  const status: InventoryStatus = isInventoryStatus(requestedStatus) ? requestedStatus : "all";
  const searchQuery = readParam(params.q).trim();
  const normalizedQuery = searchQuery.toLowerCase();
  const requestedCategory = readParam(params.category);
  const category = requestedCategory || "all";
  const requestedSupplier = readParam(params.supplier);
  const supplier = requestedSupplier && supplierById.has(requestedSupplier) ? requestedSupplier : "";
  const selectedProductId = productById.has(readParam(params.product)) ? readParam(params.product) : "";
  const visibleColumns = readColumns(params.columns);
  const pageSize = readPageSize(readParam(params.pageSize));
  const requestedPage = Math.max(1, Number(readParam(params.page)) || 1);
  const filteredRows = allRows.filter((row) => {
    if (category !== "all" && category !== "uncategorized" && row.product.category_id !== category) return false;
    if (category === "uncategorized" && row.product.category_id) return false;
    if (status !== "all" && row.status !== status) return false;
    if (supplier && row.product.supplier_id !== supplier) return false;
    if (!normalizedQuery) return true;
    return [row.product.name, row.product.sku, row.product.barcode, row.categoryName, row.supplierName]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const firstRow = filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, filteredRows.length);

  const lowStockCount = allRows.filter((row) => row.status === "low").length;
  const outOfStockCount = allRows.filter((row) => row.status === "out").length;
  const movedToday = stockResult.error
    ? movements.filter((movement) => {
        const time = new Date(movement.created_at).getTime();
        return time >= todayStart.getTime() && time < todayEnd.getTime();
      }).length
    : movedTodayResult.count ?? 0;
  const estimatedValue = allRows.reduce((sum, row) => sum + row.inventoryValue, 0);
  const estimatedValueItems = allRows.filter((row) => row.product.cost_price == null).length;
  const catalogFieldsWarning = productsSchemaWarning || isInventorySchemaError(suppliersResult.error);
  const queryWarning = Boolean(
    branchesResult.error
      || categoriesResult.error
      || movementQueryError
      || movedTodayResult.error
      || posSaleCountResult.error
      || (productsQueryWarning && !productsSchemaWarning)
      || (suppliersResult.error && !catalogFieldsWarning),
  );
  const canWrite = profile.role === "admin";
  const currentBranchName = selectedBranchId
    ? branchById.get(selectedBranchId)?.name ?? DEFAULT_STORE_NAME
    : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const activeBranches = visibleBranches.filter((branch) => branch.is_active);
  const activeBranchIds = new Set(activeBranches.map((branch) => branch.id));
  const formProducts: InventoryProductOption[] = trackedProducts
    .filter((product) => product.is_active && activeBranchIds.has(product.store_id))
    .map(({ id, name, store_id, unit }) => ({ id, name, store_id, unit }));
  const isLechonHouseBusinessSelected = isLechonHouseBusiness(profile.organizations?.settings);
  const selectedMovementProduct = selectedProductId ? productById.get(selectedProductId) : undefined;
  const defaultProduct = formProducts.find((product) => product.id === selectedMovementProduct?.id) ?? formProducts[0];
  const defaultBranch = selectedBranchId ?? defaultProduct?.store_id ?? activeBranches[0]?.id ?? visibleBranches[0]?.id ?? "";
  const requestedMovement = readParam(params.movement);
  const defaultMovement = movementOptions.some((option) => option.value === requestedMovement)
    ? (requestedMovement as Exclude<StockMovementType, "sale">)
    : "receive";
  const defaultYieldOutputProduct = formProducts.find((product) => product.id !== defaultProduct?.id)
    ?? formProducts[1];
  const recentMovements = movements
    .filter((movement) => !selectedProductId || movement.product_id === selectedProductId)
    .slice(0, 4);
  const categoryCounts = new Map<string, number>();
  for (const row of allRows) categoryCounts.set(row.product.category_id ?? "uncategorized", (categoryCounts.get(row.product.category_id ?? "uncategorized") ?? 0) + 1);
  const categoryTabs = [
    { id: "all", label: "All items", icon: "▦", count: allRows.length },
    ...categories.filter((item) => item.is_active).map((item) => ({ id: item.id, label: item.name, icon: item.icon ?? "•", count: categoryCounts.get(item.id) ?? 0 })),
    { id: "uncategorized", label: "Others", icon: "⋯", count: categoryCounts.get("uncategorized") ?? 0 },
  ];
  const savedMessage = isLechonHouseBusinessSelected && readParam(params.saved) === "yield"
    ? "Yield entry recorded. Source, output, and waste movements are linked in the ledger."
    : readParam(params.saved) === "1"
      ? "Stock movement recorded. The ledger and POS balance are up to date."
      : readParam(params.saved) === "product"
        ? "Product created with stock tracking enabled. It is now listed in Inventory."
        : "";
  const baseHref = { q: searchQuery, category, status, supplier, page, pageSize, columns: visibleColumns };
  const posSaleCount = stockResult.error ? movements.filter((movement) => movement.type === "sale").length : posSaleCountResult.count ?? 0;
  const userInitial = firstName.slice(0, 1).toUpperCase();
  const inventoryAlertCount = lowStockCount + outOfStockCount;
  const activeFilterCount = [category !== "all", status !== "all", Boolean(supplier)].filter(Boolean).length;
  const hiddenColumnCount = columnOptions.length - visibleColumns.size;
  const branding = readAdminBranding(profile.organizations?.settings);
  const cacheScope = { userId: user.id, orgId: profile.org_id, storeId: selectedBranchId, role: profile.role };
  const inventoryProductCacheRecords: Array<{ id: string; data: InventoryProductReadModel }> = pageRows.map((row) => ({
    id: row.product.id,
    data: {
      id: row.product.id,
      storeId: row.product.store_id,
      categoryId: row.product.category_id,
      supplierId: row.product.supplier_id,
      name: row.product.name,
      sku: row.product.sku,
      barcode: row.product.barcode,
      pricingMode: row.product.pricing_mode,
      price: Number(row.product.price),
      costPrice: row.product.cost_price === null ? null : Number(row.product.cost_price),
      unit: row.product.unit,
      minStock: Number(row.product.min_stock),
      trackStock: row.product.track_stock,
      imageUrl: row.product.image_url,
      isActive: row.product.is_active,
      sortOrder: row.product.sort_order,
      categoryName: row.categoryName,
      supplierName: row.supplierName,
      branchName: row.branch.name,
    },
  }));
  const inventorySnapshotCacheRecords: Array<{ id: string; data: InventoryStockSnapshot }> = allRows.map((row) => ({
    id: `${row.branch.id}:${row.product.id}`,
    data: {
      id: `${row.branch.id}:${row.product.id}`,
      storeId: row.branch.id,
      productId: row.product.id,
      branchName: row.branch.name,
      productName: row.product.name,
      categoryName: row.categoryName,
      supplierName: row.supplierName,
      unit: row.product.unit,
      onHand: row.onHand,
      minimum: row.minStock,
      status: row.status,
      inventoryValue: row.inventoryValue,
    },
  }));
  const inventoryMovementCacheRecords: Array<{ id: string; data: InventoryMovementReadModel }> = movements.map((movement) => ({
    id: movement.id,
    data: {
      id: movement.id,
      storeId: movement.store_id,
      productId: movement.product_id,
      productName: productById.get(movement.product_id)?.name ?? "Unknown product",
      branchName: branchById.get(movement.store_id)?.name ?? DEFAULT_STORE_NAME,
      type: movement.type,
      quantity: Number(movement.qty),
      unit: movement.unit,
      unitCost: movement.unit_cost === null ? null : Number(movement.unit_cost),
      reason: movement.reason,
      refOrderId: movement.ref_order_id,
      createdAt: movement.created_at,
    },
  }));
  const inventoryCacheBatches: AdminReadModelBatch[] = [
    // Keep the product cache bounded to the current page. Product records are
    // not read by the offline recovery shell; inventory snapshots are the
    // authoritative offline view. Upserting lets users build a useful cache
    // while paging without serializing the full catalog on every navigation.
    { entity: "products", records: inventoryProductCacheRecords },
    { entity: "inventory", records: inventorySnapshotCacheRecords, replace: true },
    { entity: "inventory_movements", records: inventoryMovementCacheRecords },
  ];

  return (
    <main data-admin-theme={branding.theme} className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminReadModelHydrator scope={cacheScope} batches={inventoryCacheBatches}>
          <header className="admin-topbar">
            <Link href="/admin" className="admin-mobile-brand" aria-label={`${branding.brandName} ${branding.brandTagline} dashboard`}><AdminBrandLogo logoUrl={branding.logoUrl} className="admin-brand__mark" iconSize={20} label="Brand logo" /><span className="admin-brand__copy"><strong>{branding.brandName}</strong><small>{branding.brandTagline}</small></span></Link>
            <Link href="#inventory-filters-heading" className="admin-icon-button" aria-label="Search inventory"><AdminIcon name="search" size={19} /></Link>
            <Link href="#inventory-table" className="admin-icon-button admin-icon-button--alert" aria-label={inventoryAlertCount ? `View ${inventoryAlertCount} inventory alerts` : "View inventory status"}><AdminIcon name="bell" size={19} />{inventoryAlertCount > 0 && <span className="admin-icon-button__badge" aria-hidden="true">{inventoryAlertCount > 9 ? "9+" : inventoryAlertCount}</span>}</Link>
            <Link href="#inventory-help" className="admin-icon-button admin-icon-button--help" aria-label="View inventory help"><AdminIcon name="help" size={19} /></Link>
            <div className="admin-user-chip"><span className="admin-user-chip__avatar" aria-hidden="true">{userInitial}</span><span className="admin-user-chip__copy"><strong>{firstName}</strong><small>{profile.role === "manager" ? "Manager" : "Admin"}⌄</small></span></div>
            <SignOutButton className="inventory-button text-[10px]" />
          </header>
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/70 pb-5 pt-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Inventory control · {currentBranchName}</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.05em] text-ink sm:text-4xl">Inventory</h1>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">Manage inventory items, stock levels, and usage for {currentBranchName}, {firstName}.</p>
            </div>
            <div className="admin-compact-toolbar">
              <Link href={buildInventoryHref({ ...baseHref, page: 1, movement: "receive" }) + "#stock-movement"} className="inventory-button gap-1.5 rounded-btn bg-secondary text-[11px] font-extrabold text-primary transition hover:bg-secondary-hover"><AdminIcon name="download" size={14} />Stock in<AdminIcon name="chevron" size={12} /></Link>
              <Link href={buildInventoryHref({ ...baseHref, page: 1, movement: "yield_out" }) + "#stock-movement"} className="inventory-button gap-1.5 rounded-btn bg-secondary text-[11px] font-extrabold text-primary transition hover:bg-secondary-hover"><AdminIcon name="upload" size={14} />Stock out<AdminIcon name="chevron" size={12} /></Link>
              {isLechonHouseBusinessSelected && <Link href="/admin/inventory?yield=1#yield-entry" className="inventory-button gap-1.5 rounded-btn bg-secondary text-[11px] font-extrabold text-primary transition hover:bg-secondary-hover"><AdminIcon name="inventory" size={14} />Yield entry<AdminIcon name="chevron" size={12} /></Link>}
              <Link href="/admin/inventory/variance" className="inventory-button gap-1.5 rounded-btn bg-secondary text-[11px] font-extrabold text-primary transition hover:bg-secondary-hover"><AdminIcon name="chart" size={14} />End-of-day count<AdminIcon name="chevron" size={12} /></Link>
              <MultiProductModal key={defaultBranch} storeId={defaultBranch} branchName={currentBranchName} branches={activeBranches} categories={categories} canWrite={canWrite} orgName={branding.brandName} initialPresetId={readBusinessPresetId(profile.organizations?.settings) ?? undefined} triggerLabel="Starter catalog" triggerClassName="inventory-button gap-1.5 rounded-btn bg-secondary text-[11px] font-extrabold text-primary transition hover:bg-secondary-hover" />
              <details className="relative">
                <summary className="inventory-button list-none cursor-pointer gap-1.5 rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg"><AdminIcon name="plus" size={14} />Add item<AdminIcon name="chevron" size={12} /></summary>
                <div className="absolute right-0 top-full z-20 mt-1 grid min-w-40 gap-1 rounded-card border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]">
                  <Link href="/products?create=product&inventory=1" className="inventory-menu-item">New product</Link>
                  <Link href="/products?create=category#category-form" className="inventory-menu-item">New category</Link>
                </div>
              </details>
            </div>
          </header>

          {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
          {readParam(params.error) && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{readParam(params.error)}</div>}
          {catalogFieldsWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-ink"><strong className="font-extrabold">Some inventory fields are unavailable.</strong> Ensure <code className="font-bold">0009_admin_business_records.sql</code> is applied before <code className="font-bold">0010_inventory_catalog_fields.sql</code> in Supabase to enable suppliers and advanced inventory fields.</div>}
          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-ink">Some inventory data could not refresh. Check the connection and try again.</div>}
          {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This inventory view is read-only for your role. Ask an organization admin to record stock movements or edit catalog fields.</div>}
          {canWrite && isLechonHouseBusinessSelected && <div className="mt-5"><OwnerGuidance topic="yield" /></div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <InventoryMetric label="Total items" value={String(allRows.length)} detail={`Tracked for ${currentBranchName}`} tone="bg-primary text-primary-fg" icon="box" />
            <InventoryMetric label="Low stock items" value={String(lowStockCount)} detail="Need to reorder soon" tone="bg-accent text-accent-fg" icon="inventory" />
            <InventoryMetric label="Out of stock" value={String(outOfStockCount)} detail="Require immediate attention" tone="bg-warning text-primary-fg" icon="alert" />
            <InventoryMetric label="Total inventory value" value={estimatedValue ? formatPeso(Math.round(estimatedValue)) : "₱0.00"} detail={estimatedValueItems ? `Estimated for ${estimatedValueItems} item${estimatedValueItems === 1 ? "" : "s"}` : "Based on cost price"} tone="bg-success text-primary-fg" icon="wallet" />
            <InventoryMetric label="Items moved today" value={String(movedToday)} detail={`Since ${formatToday(todayStart)}`} tone="bg-primary text-primary-fg" icon="chart" />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_252px]">
            <div className="min-w-0">
              <section aria-label="Inventory browsing controls" className="admin-panel inventory-directory-controls overflow-visible p-0">
                <nav aria-label="Inventory categories" className="products-category-tabs inventory-category-tabs">
                  {categoryTabs.map((tab) => (
                    <Link key={tab.id} href={buildInventoryHref({ ...baseHref, category: tab.id, page: 1 })} aria-current={category === tab.id ? "page" : undefined} className={`products-category-tab ${category === tab.id ? "is-active" : ""}`}>
                      <span className="products-category-tab__icon"><AdminIcon name={categoryIconName(tab.icon, tab.label)} size={14} /></span>
                      <strong>{tab.label}</strong>
                      <small>{tab.count}</small>
                    </Link>
                  ))}
                </nav>
                <form id="inventory-filters" action="/admin/inventory" method="get" className="products-filter-bar inventory-filter-bar">
                  <input type="hidden" name="page" value="1" />
                  <input type="hidden" name="pageSize" value={pageSize} />
                  <label className="products-search-field">
                    <span className="sr-only" id="inventory-filters-heading">Search inventory</span>
                    <AdminIcon name="search" size={16} />
                    <input name="q" defaultValue={searchQuery} placeholder="Search by item name, SKU or barcode…" />
                  </label>
                  <select name="category" defaultValue={category} aria-label="Filter inventory by category"><option value="all">All categories</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="uncategorized">Others</option></select>
                  <select name="status" defaultValue={status} aria-label="Filter inventory by status">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <select name="supplier" defaultValue={supplier || ""} aria-label="Filter inventory by supplier"><option value="">All suppliers</option>{suppliers.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  {activeFilterCount > 0 && <Link href={buildInventoryHref({ ...baseHref, category: "all", status: "all", supplier: "", page: 1 })} className="products-secondary-button inventory-filter-reset" aria-label="Reset inventory filters">Reset</Link>}
                  <details className="products-columns-menu">
                    <summary className="products-secondary-button"><AdminIcon name="columns" size={15} /> Columns{hiddenColumnCount > 0 && <span className="products-filter-count">{hiddenColumnCount}</span>}</summary>
                    <div className="products-popover products-columns-popover">
                      <p className="products-popover__label">Visible columns</p>
                      {columnOptions.map((column) => <label key={column.value} className="products-column-option"><input type="checkbox" name="columns" value={column.value} defaultChecked={visibleColumns.has(column.value)} />{column.label}</label>)}
                      <button type="submit" className="products-small-primary">Apply columns</button>
                    </div>
                  </details>
                  <button type="submit" className="products-small-primary products-search-button" aria-label="Search inventory"><AdminIcon name="search" size={14} /><span>Search</span></button>
                </form>
              </section>

              <section id="inventory-table" aria-labelledby="inventory-table-heading" className="admin-panel mt-3 overflow-hidden">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4">
                  <div><p className="admin-panel__eyebrow">Inventory directory</p><h2 id="inventory-table-heading" className="admin-panel__title">All inventory items</h2><p className="admin-panel__subtitle">{filteredRows.length} matching item{filteredRows.length === 1 ? "" : "s"} across your visible branches.</p></div>
                  <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{canWrite ? "Admin editing enabled" : "Read only"}</span>
                </div>
                {pageRows.length === 0 ? (
                  <EmptyState title="No inventory items match these filters" detail="Try a wider search, choose another category, or add a tracked product from Products." href="/products?create=product&inventory=1" action="Add item" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="admin-list-table min-w-[1180px]">
                      <thead><tr><th>Item name</th>{visibleColumns.has("sku") && <th>SKU / barcode</th>}{visibleColumns.has("category") && <th>Category</th>}{visibleColumns.has("unit") && <th>Unit</th>}{visibleColumns.has("stock") && <th>Stock on hand</th>}{visibleColumns.has("status") && <th>Status</th>}{visibleColumns.has("cost") && <th>Cost price</th>}{visibleColumns.has("selling") && <th>Selling price</th>}{visibleColumns.has("supplier") && <th>Supplier</th>}<th>Actions</th></tr></thead>
                      <tbody>
                        {pageRows.map((row) => (
                          <tr key={`${row.branch.id}:${row.product.id}`}>
                            <td><div className="flex min-w-[220px] items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-primary-soft text-primary"><Image src={productImage(row.product)} alt="" width={36} height={36} className="h-full w-full object-cover" /></span><span className="min-w-0"><strong className="block truncate text-[11px] font-extrabold">{row.product.name}</strong><small className="mt-1 block text-[10px] text-ink-muted">{row.branch.name}</small></span></div></td>
                            {visibleColumns.has("sku") && <td className="whitespace-nowrap"><strong className="block text-[10px] font-bold">{row.product.sku || "SKU not set"}</strong><small className="mt-1 block text-[10px] text-ink-muted">{row.product.barcode || "Barcode not set"}</small></td>}
                            {visibleColumns.has("category") && <td className="whitespace-nowrap text-[10px] font-bold text-accent">{row.categoryName}</td>}
                            {visibleColumns.has("unit") && <td className="whitespace-nowrap text-[10px] font-semibold text-ink-muted">{row.product.unit}</td>}
                            {visibleColumns.has("stock") && <td className="whitespace-nowrap"><strong className="tnums block text-[11px] font-extrabold">{formatStockQuantity(row.onHand)} {row.product.unit}</strong><small className="mt-1 block text-[10px] text-ink-muted">min: {formatStockQuantity(row.minStock)} {row.product.unit}</small></td>}
                            {visibleColumns.has("status") && <td><span className={`inline-flex whitespace-nowrap rounded-pill px-2.5 py-1 text-[10px] font-extrabold ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td>}
                            {visibleColumns.has("cost") && <td className="tnums whitespace-nowrap text-[10px] font-semibold">{row.product.cost_price == null ? "—" : formatPeso(Number(row.product.cost_price))}</td>}
                            {visibleColumns.has("selling") && <td className="tnums whitespace-nowrap text-[10px] font-semibold">{formatPeso(Number(row.product.price))}</td>}
                            {visibleColumns.has("supplier") && <td className="max-w-[130px] truncate text-[10px] font-semibold" title={row.supplierName}>{row.supplierName}</td>}
                            <td><div className="flex items-center justify-end gap-1"><Link href={`/products?edit=${row.product.id}#product-edit`} aria-label={`Edit ${row.product.name}`} className="inventory-icon-button border border-line bg-surface text-primary transition hover:bg-primary-soft"><AdminIcon name="edit" size={14} /></Link><details className="relative"><summary className="inventory-icon-button cursor-pointer list-none border border-line bg-surface text-primary transition hover:bg-primary-soft" aria-label={`More actions for ${row.product.name}`}><AdminIcon name="more" size={15} /></summary><div className="absolute right-0 top-full z-20 mt-1 grid min-w-44 gap-1 rounded-card border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]"><Link href={`/admin/inventory?product=${row.product.id}&movement=receive#stock-movement`} className="inventory-menu-item">Record stock movement</Link><Link href={`/products?edit=${row.product.id}#product-edit`} className="inventory-menu-item">Edit product</Link></div></details></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"><span className="text-[10px] font-semibold text-ink-muted">Showing {firstRow} to {lastRow} of {filteredRows.length} items</span><div className="flex items-center gap-1">{page > 1 ? <Link href={buildInventoryHref({ ...baseHref, page: page - 1 })} className="inventory-icon-button border border-line text-primary hover:bg-primary-soft" aria-label="Previous page">‹</Link> : <span className="inventory-icon-button border border-line text-ink-subtle" aria-hidden="true">‹</span>}{Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((pageNumber) => <Link key={pageNumber} href={buildInventoryHref({ ...baseHref, page: pageNumber })} className={`inventory-page-button ${pageNumber === page ? "is-active" : ""}`}>{pageNumber}</Link>)}{page < totalPages ? <Link href={buildInventoryHref({ ...baseHref, page: page + 1 })} className="inventory-icon-button border border-line text-primary hover:bg-primary-soft" aria-label="Next page">›</Link> : <span className="inventory-icon-button border border-line text-ink-subtle" aria-hidden="true">›</span>}</div><form action="/admin/inventory" method="get" className="flex items-center gap-2"><input type="hidden" name="q" value={searchQuery} /><input type="hidden" name="category" value={category} /><input type="hidden" name="status" value={status} /><input type="hidden" name="supplier" value={supplier} /><input type="hidden" name="columns" value={[...visibleColumns].join(",")} /><label htmlFor="inventory-page-size" className="text-[10px] font-semibold text-ink-muted">Rows per page:</label><select id="inventory-page-size" name="pageSize" defaultValue={String(pageSize)} className="inventory-input inventory-input--compact w-auto text-[10px]"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select><button type="submit" className="inventory-button inventory-button--ghost">Apply</button></form></div>
              </section>

              {isLechonHouseBusinessSelected && <YieldEntryForm branches={activeBranches} products={formProducts} defaultBranch={defaultBranch} defaultSourceProductId={defaultProduct?.id ?? ""} defaultOutputProductId={defaultYieldOutputProduct?.id ?? ""} canWrite={canWrite} open={Boolean(readParam(params.yield) || readParam(params.saved) === "yield")} />}
              <StockMovementForm scope={cacheScope} branches={activeBranches} products={formProducts} defaultBranch={defaultBranch} defaultProductId={defaultProduct?.id ?? ""} defaultMovement={defaultMovement} canWrite={canWrite} open={Boolean(readParam(params.movement) || selectedProductId || (readParam(params.error) && !readParam(params.yield)))} />
            </div>

            <aside className="grid content-start gap-3">
              <section className="admin-panel p-4"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-extrabold text-ink">Recent stock movements</h2><Link href="#stock-movement" className="text-[10px] font-extrabold text-primary hover:underline">View all</Link></div>{recentMovements.length === 0 ? <p className="mt-4 rounded-btn border border-dashed border-line-strong px-3 py-5 text-center text-[10px] text-ink-muted">No stock movements yet.</p> : <div className="mt-3 divide-y divide-line/70">{recentMovements.map((movement) => { const product = productById.get(movement.product_id); const delta = stockMovementDelta(movement.type, Number(movement.qty)); return <div key={movement.id} className="flex items-start gap-2 py-3 first:pt-0"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${movementClass(movement.type)}`} aria-hidden="true">{delta >= 0 ? "↓" : "↑"}</span><span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-extrabold text-ink">{movementLabel(movement.type)}</strong><small className="mt-1 block truncate text-[10px] text-ink-muted">{product?.name ?? "Unknown product"}</small><small className="block text-[9px] text-ink-muted">{formatDateTime(movement.created_at)}</small></span><strong className={`tnums whitespace-nowrap text-[10px] font-extrabold ${delta >= 0 ? "text-success" : "text-danger"}`}>{delta >= 0 ? "+" : "−"}{formatStockQuantity(Math.abs(delta))} {movement.unit}</strong></div>; })}</div>}<Link href="/admin/reports/inventory" className="inventory-button mt-3 w-full rounded-btn border border-line-strong text-[10px] font-extrabold text-primary transition hover:bg-primary-soft"><AdminIcon name="chart" size={14} />View inventory reports</Link></section>
              <section className="admin-panel p-4"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success/10 text-success"><AdminIcon name="check" size={16} /></span><div><h2 className="text-sm font-extrabold text-ink">Inventory is connected to POS</h2><p className="mt-2 text-[10px] leading-5 text-ink-muted">Tracked items deduct automatically when completed POS orders are recorded.</p></div></div><div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-[10px] font-semibold text-ink-muted"><span>Last movement</span><span className="text-right">{movements[0] ? formatDateTime(movements[0].created_at) : "No movement yet"}</span></div>{posSaleCount > 0 && <p className="mt-2 text-[10px] font-bold text-success">{posSaleCount} POS sale movement{posSaleCount === 1 ? "" : "s"} recorded.</p>}</section>
              <section id="inventory-help" className="admin-panel p-4"><h2 className="text-sm font-extrabold text-ink">Did you know?</h2><ul className="mt-4 grid gap-3 text-[10px] leading-4 text-ink-muted"><li className="flex gap-2"><AdminIcon name="check" size={15} /><span>Add items manually or import in bulk from the catalog.</span></li><li className="flex gap-2"><AdminIcon name="check" size={15} /><span>Set a minimum stock level for every tracked item.</span></li><li className="flex gap-2"><AdminIcon name="check" size={15} /><span>Track stock in, out, waste, and adjustments.</span></li><li className="flex gap-2"><AdminIcon name="check" size={15} /><span>Close the day with a physical count and review variance.</span></li></ul><Link href="/admin/inventory/variance" className="inventory-button mt-4 w-full rounded-btn border border-line-strong text-[10px] font-extrabold text-primary transition hover:bg-primary-soft"><AdminIcon name="chart" size={14} />Open end-of-day count</Link></section>
            </aside>
          </div>
        </AdminReadModelHydrator>
      </div>
    </main>
  );
}

function InventoryMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: AdminIconName }) {
  return <article className="admin-kpi-card min-h-[116px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function StockMovementForm({ scope, branches, products, defaultBranch, defaultProductId, defaultMovement, canWrite, open }: { scope: AdminCacheScope; branches: BranchRecord[]; products: InventoryProductOption[]; defaultBranch: string; defaultProductId: string; defaultMovement: Exclude<StockMovementType, "sale">; canWrite: boolean; open: boolean }) {
  return (
    <details id="stock-movement" open={open} className="admin-panel mt-4 p-4">
      <summary className="inventory-section-summary">
        <span>
          <span className="admin-panel__eyebrow">Stock control</span>
          <strong className="mt-1 block text-lg font-extrabold text-ink">Record a stock movement</strong>
          <small className="mt-1 block text-xs text-ink-muted">Use a signed ledger action. POS sales are recorded automatically.</small>
        </span>
        <span className="rounded-pill bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold text-primary">{canWrite ? "Admin only" : "Read only"}</span>
      </summary>
      {products.length === 0 ? (
        <div className="mt-4 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-6 text-center">
          <p className="text-sm font-extrabold text-ink">No tracked products yet</p>
          <p className="mt-1 text-xs text-ink-muted">Enable Track stock on a product before recording inventory.</p>
          <Link href="/products?create=product&inventory=1" className="inventory-button mt-3 rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg">Add item</Link>
        </div>
      ) : (
        <AdminMutationForm scope={scope} kind="inventory_movement" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <BranchProductSelector branches={branches} products={products} defaultBranch={defaultBranch} defaultProductId={defaultProductId} canWrite={canWrite} />
          <InventoryField label="Movement" htmlFor="inventory-type"><select id="inventory-type" name="type" defaultValue={defaultMovement} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">{movementOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.detail}</option>)}</select></InventoryField>
          <InventoryField label="Quantity" htmlFor="inventory-qty"><input id="inventory-qty" name="qty" type="number" inputMode="decimal" step="0.001" placeholder="e.g. 10 or -2" required disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" /></InventoryField>
          <InventoryField label="Unit cost · ₱" htmlFor="inventory-cost"><input id="inventory-cost" name="unit_cost" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Optional" disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" /></InventoryField>
          <InventoryField label="Reason / reference" htmlFor="inventory-reason" className="md:col-span-2"><input id="inventory-reason" name="reason" placeholder="Required for waste and adjustments" disabled={!canWrite} className="inventory-input inventory-input--compact text-xs" /></InventoryField>
          <button type="submit" disabled={!canWrite} className="inventory-button self-end rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Record movement</button>
        </AdminMutationForm>
      )}
    </details>
  );
}

function InventoryField({ label, htmlFor, children, className = "" }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return <label htmlFor={htmlFor} className={`block ${className}`}><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function EmptyState({ title, detail, href, action }: { title: string; detail: string; href: string; action: string }) {
  return <div className="grid place-items-center px-4 py-14 text-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="box" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-ink-muted">{detail}</p><Link href={href} className="inventory-button mt-3 rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg">{action}</Link></div>;
}

function InventoryProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
