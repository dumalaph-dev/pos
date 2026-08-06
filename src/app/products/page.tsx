import Image from "next/image";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { ProductCreateDialog } from "@/components/admin/ProductCreateDialog";
import { ProductFields } from "@/components/admin/ProductFields";
import { SignOutButton } from "@/components/SignOutButton";
import { formatStockQuantity, salesQuantity, stockMovementDelta, stockStatus, type StockMovementType } from "@/lib/inventory";
import { formatPeso } from "@/lib/money";
import { isProductImageUrl } from "@/lib/product-images";
import { getAdminProfile } from "@/lib/admin/profile";
import { readAdminBranding } from "@/lib/admin/branding";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getSelectedAdminBranchId } from "@/lib/admin/branch-context";
import {
  bulkUpdateProducts,
  createCategory,
  importProducts,
  toggleProductVisibility,
  updateCategory,
  updateProduct,
} from "@/app/admin/catalog/actions";

type AdminRole = "admin" | "manager" | "cashier";
type PricingMode = "fixed" | "per_kg";
type ProductStatusFilter = "all" | "active" | "inactive" | "in_stock" | "low" | "out";
type ProductColumn = "category" | "sku" | "price" | "status" | "pos" | "stock";
type ProductStockStatus = "untracked" | "in_stock" | "low" | "out";
type ProductAction = "product" | "category" | "import" | "bulk" | "edit" | "none";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: { name?: string; settings?: unknown } | null;
};

type BranchRecord = { id: string; name: string; is_active: boolean };

type SupplierRecord = { id: string; name: string; is_active: boolean };

type CategoryRecord = {
  id: string;
  store_id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
};

type ProductRecord = {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  pricing_mode: PricingMode;
  price: number;
  cost_price: number | null;
  min_stock: number;
  unit: string;
  supplier_id: string | null;
  track_stock: boolean;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

type LegacyProductRecord = Omit<ProductRecord, "sku" | "barcode" | "cost_price" | "min_stock" | "supplier_id">;

type OrderRecord = {
  id: string;
  store_id: string;
  total: number;
  status: "completed" | "voided" | "refunded";
  created_at: string;
};

type OrderItemRecord = {
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  qty: number;
  weight_kg: number | null;
  line_total: number;
};

type MovementRecord = {
  store_id: string;
  product_id: string;
  type: StockMovementType;
  qty: number;
};

type StockRecord = {
  store_id: string;
  product_id: string;
  qty: number;
};


type ProductRow = {
  product: ProductRecord;
  categoryName: string;
  onHand: number | null;
  stockStatus: ProductStockStatus;
};

type TopSellingProduct = {
  productId: string | null;
  name: string;
  qty: number;
  unit: string;
  total: number;
  orderIds: Set<string>;
  imageUrl: string | null;
};

type QueryValue = string | string[] | undefined;

const DEFAULT_STORE_NAME = "Mario's Lechon House";
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_PRODUCT_IMAGES: Record<string, string> = {
  "whole lechon (small)": "/food/whole-lechon-small.png",
  "whole lechon (medium)": "/food/whole-lechon-medium.png",
  "whole lechon (large)": "/food/whole-lechon-medium.png",
  "lechon belly (1/2kg)": "/food/lechon-belly-half.png",
  "lechon belly (1kg)": "/food/lechon-belly-one.png",
  "lechon paksiw (1/2kg)": "/food/lechon-paksiw.png",
  "lechon kawali (1/2kg)": "/food/lechon-kawali.png",
  "java rice": "/food/java-rice.png",
  "mang tomas (small)": "/food/mang-tomas.png",
};

const rangeOptions = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
] as const;

const statusOptions: Array<{ value: ProductStatusFilter; label: string }> = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "in_stock", label: "In stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

const columnOptions: Array<{ value: ProductColumn; label: string }> = [
  { value: "category", label: "Category" },
  { value: "sku", label: "SKU / barcode" },
  { value: "price", label: "Price" },
  { value: "status", label: "Status" },
  { value: "pos", label: "POS visibility" },
  { value: "stock", label: "Stock" },
];

const OPTIONAL_PRODUCT_COLUMNS = ["sku", "barcode", "cost_price", "min_stock", "supplier_id"] as const;

function readParam(value: QueryValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readPage(value: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readPageSize(value: string) {
  return value === "25" || value === "50" ? Number(value) : 10;
}

function isProductStatusFilter(value: string): value is ProductStatusFilter {
  return statusOptions.some((option) => option.value === value);
}

function isColumn(value: string): value is ProductColumn {
  return columnOptions.some((option) => option.value === value);
}

function readColumns(value: string) {
  const requested = value.split(",").map((column) => column.trim()).filter(isColumn);
  return new Set<ProductColumn>(requested.length > 0 ? requested : columnOptions.map((column) => column.value));
}

function rangeDays(range: string) {
  return rangeOptions.find((option) => option.value === range)?.days ?? 7;
}

function getSingaporeDayBounds() {
  const parts = new Map(new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const date = `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function formatDateRange(start: Date, endExclusive: Date) {
  const end = new Date(endExclusive.getTime() - DAY_MS);
  const formatter = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function productImage(product: { name: string; image_url?: string | null }) {
  return isProductImageUrl(product.image_url)
    ? product.image_url
    : LOCAL_PRODUCT_IMAGES[product.name.trim().toLowerCase()] ?? "/food/whole-lechon-small.png";
}

function productStockStatus(product: ProductRecord, onHand: number | null): ProductStockStatus {
  if (!product.track_stock) return "untracked";
  const status = stockStatus(onHand ?? 0, product.min_stock);
  if (status === "out") return "out";
  if (status === "low") return "low";
  return "in_stock";
}

function stockStatusLabel(status: ProductStockStatus) {
  if (status === "out") return "Out of stock";
  if (status === "low") return "Low stock";
  if (status === "in_stock") return "In stock";
  return "Not tracked";
}

function stockStatusClass(status: ProductStockStatus) {
  if (status === "out") return "is-out";
  if (status === "low") return "is-low";
  if (status === "in_stock") return "is-in-stock";
  return "is-untracked";
}

function statusMatches(row: ProductRow, filter: ProductStatusFilter) {
  if (filter === "all") return true;
  if (filter === "active") return row.product.is_active;
  if (filter === "inactive") return !row.product.is_active;
  return row.stockStatus === filter;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function buildProductsHref({
  q,
  category,
  status,
  posOnly,
  range,
  page,
  pageSize,
  columns,
}: {
  q?: string;
  category?: string;
  status?: ProductStatusFilter;
  posOnly?: boolean;
  range?: string;
  page?: number;
  pageSize?: number;
  columns?: Set<ProductColumn>;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category && category !== "all") params.set("category", category);
  if (status && status !== "all") params.set("status", status);
  if (posOnly) params.set("pos", "1");
  if (range && range !== "7d") params.set("range", range);
  if (page && page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== 10) params.set("pageSize", String(pageSize));
  if (columns && columns.size !== columnOptions.length) params.set("columns", [...columns].join(","));
  return params.toString() ? `/products?${params.toString()}` : "/products";
}

function isMissingOptionalProductField(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return OPTIONAL_PRODUCT_COLUMNS.some((column) => message.includes(column)) && (
    error.code === "42703" || error.code === "PGRST204" || message.includes("schema cache") || message.includes("does not exist")
  );
}

function isMissingSupplierSchema(error: { code?: string | null; message?: string | null } | null) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("supplier") && (error.code === "42P01" || error.code === "PGRST205" || message.includes("schema cache") || message.includes("does not exist"));
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: QueryValue;
    saved?: QueryValue;
    legacy?: QueryValue;
    q?: QueryValue;
    category?: QueryValue;
    status?: QueryValue;
    pos?: QueryValue;
    range?: QueryValue;
    page?: QueryValue;
    pageSize?: QueryValue;
    columns?: QueryValue;
    create?: QueryValue;
    inventory?: QueryValue;
    import?: QueryValue;
    bulk?: QueryValue;
    edit?: QueryValue;
    product?: QueryValue;
    updated?: QueryValue;
  }>;
}) {
  const params = await searchParams;
  const searchQuery = readParam(params.q).trim();
  const categoryFilter = readParam(params.category) || "all";
  const requestedStatus = readParam(params.status);
  const status: ProductStatusFilter = isProductStatusFilter(requestedStatus) ? requestedStatus : "all";
  const posOnly = ["1", "true", "on"].includes(readParam(params.pos));
  const requestedRange = readParam(params.range);
  const range = rangeOptions.some((option) => option.value === requestedRange) ? requestedRange : "7d";
  const pageSize = readPageSize(readParam(params.pageSize));
  const columns = readColumns(readParam(params.columns));
  const requestedPage = readPage(readParam(params.page));
  const createAction = readParam(params.create);
  const fromInventory = readParam(params.inventory) === "1";
  const showImport = readParam(params.import) === "1";
  const showBulk = readParam(params.bulk) === "1";
  const selectedProductId = readParam(params.edit) || readParam(params.product);
  const action: ProductAction = selectedProductId ? "edit" : createAction === "category" ? "category" : createAction === "product" ? "product" : showImport ? "import" : showBulk ? "bulk" : "none";

  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <ProductsProfileMissing />;

  const { start: todayStart, end: todayEnd } = getSingaporeDayBounds();
  const selectedDays = rangeDays(range);
  const currentStart = new Date(todayStart.getTime() - DAY_MS * (selectedDays - 1));
  const previousStart = new Date(currentStart.getTime() - DAY_MS * selectedDays);

  const branchesResult = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", profile.org_id)
    .order("name");
  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const selectedBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(branches, profile.store_id)
    : profile.store_id;
  const visibleBranches = selectedBranchId
    ? branches.filter((branch) => branch.id === selectedBranchId)
    : branches;

  let currentOrdersQuery = supabase
    .from("orders")
    .select("id, store_id, total, status, created_at")
    .eq("org_id", profile.org_id)
    .eq("status", "completed")
    .gte("created_at", currentStart.toISOString())
    .lt("created_at", todayEnd.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  let previousOrdersQuery = supabase
    .from("orders")
    .select("id, store_id, total, status, created_at")
    .eq("org_id", profile.org_id)
    .eq("status", "completed")
    .gte("created_at", previousStart.toISOString())
    .lt("created_at", currentStart.toISOString())
    .limit(5000);

  let categoriesQuery = supabase
    .from("categories")
    .select("id, store_id, name, icon, sort_order, is_active")
    .eq("org_id", profile.org_id)
    .order("sort_order")
    .order("name");
  let productsQuery = supabase
    .from("products")
    .select("id, store_id, category_id, name, sku, barcode, pricing_mode, price, cost_price, min_stock, unit, supplier_id, track_stock, image_url, is_active, sort_order")
    .eq("org_id", profile.org_id)
    .order("sort_order")
    .order("name")
    .limit(1000);
  let orderItemsQuery = supabase
    .from("order_items")
    .select("order_id, product_id, name_snapshot, qty, weight_kg, line_total, orders!inner(status)")
    .eq("orders.org_id", profile.org_id)
    .eq("orders.status", "completed")
    .gte("orders.created_at", currentStart.toISOString())
    .lt("orders.created_at", todayEnd.toISOString());
  if (selectedBranchId) {
    currentOrdersQuery = currentOrdersQuery.eq("store_id", selectedBranchId);
    previousOrdersQuery = previousOrdersQuery.eq("store_id", selectedBranchId);
    categoriesQuery = categoriesQuery.eq("store_id", selectedBranchId);
    productsQuery = productsQuery.eq("store_id", selectedBranchId);
    orderItemsQuery = orderItemsQuery.eq("orders.store_id", selectedBranchId);
  }

  const [categoriesResult, productsResult, suppliersResult, stockResult, currentOrdersResult, previousOrdersResult, orderItemsResult] = await Promise.all([
    categoriesQuery,
    productsQuery,
    supabase.from("suppliers").select("id, name, is_active").eq("org_id", profile.org_id).order("name").limit(1000),
    supabase.rpc("current_stock", { p_org_id: profile.org_id }),
    currentOrdersQuery,
    previousOrdersQuery,
    orderItemsQuery,
  ]);

  const allCategories = (categoriesResult.data ?? []) as CategoryRecord[];
  const categories = selectedBranchId
    ? allCategories.filter((category) => category.store_id === selectedBranchId)
    : allCategories;
  let products = (productsResult.data ?? []) as ProductRecord[];
  let fallbackProductsError = false;
  const productsSchemaWarning = isMissingOptionalProductField(productsResult.error);
  const suppliersSchemaWarning = isMissingSupplierSchema(suppliersResult.error);
  if (productsResult.error) {
    let fallbackProductsQuery = supabase
      .from("products")
      .select("id, store_id, category_id, name, pricing_mode, price, unit, track_stock, image_url, is_active, sort_order")
      .eq("org_id", profile.org_id)
      .order("sort_order")
      .order("name")
      .limit(1000);
    if (selectedBranchId) fallbackProductsQuery = fallbackProductsQuery.eq("store_id", selectedBranchId);
    const fallbackProductsResult = await fallbackProductsQuery;
    fallbackProductsError = Boolean(fallbackProductsResult.error);
    const fallbackProducts = (fallbackProductsResult.data ?? []) as LegacyProductRecord[];
    products = fallbackProducts.map((product) => ({ ...product, sku: null, barcode: null, cost_price: null, min_stock: 2, supplier_id: null }));
  }

  if (selectedBranchId) {
    products = products.filter((product) => product.store_id === selectedBranchId);
  }

  const suppliers = (suppliersResult.data ?? []) as SupplierRecord[];
  let fallbackMovements: MovementRecord[] = [];
  let stockFallbackError = false;
  if (stockResult.error) {
    let fallbackMovementsQuery = supabase
      .from("stock_movements")
      .select("store_id, product_id, type, qty")
      .eq("org_id", profile.org_id)
      .limit(10000);
    if (selectedBranchId) fallbackMovementsQuery = fallbackMovementsQuery.eq("store_id", selectedBranchId);
    const fallbackMovementsResult = await fallbackMovementsQuery;
    fallbackMovements = (fallbackMovementsResult.data ?? []) as MovementRecord[];
    stockFallbackError = Boolean(fallbackMovementsResult.error);
  }
  const currentOrders = ((currentOrdersResult.data ?? []) as OrderRecord[]).filter((order) => !selectedBranchId || order.store_id === selectedBranchId);
  const previousOrders = ((previousOrdersResult.data ?? []) as OrderRecord[]).filter((order) => !selectedBranchId || order.store_id === selectedBranchId);
  const orderItems = (orderItemsResult.data ?? []) as OrderItemRecord[];
  const orderItemsError = Boolean(orderItemsResult.error);

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const stockByKey = new Map<string, number>();
  if (stockResult.error) {
    for (const movement of fallbackMovements) {
      const key = `${movement.store_id}:${movement.product_id}`;
      stockByKey.set(key, (stockByKey.get(key) ?? 0) + stockMovementDelta(movement.type, Number(movement.qty)));
    }
  } else {
    for (const stock of (stockResult.data ?? []) as StockRecord[]) {
      const key = `${stock.store_id}:${stock.product_id}`;
      stockByKey.set(key, Number(stock.qty));
    }
  }

  const productRows: ProductRow[] = products.map((product) => {
    const onHand = product.track_stock ? stockByKey.get(`${product.store_id}:${product.id}`) ?? 0 : null;
    return {
      product,
      categoryName: product.category_id ? categoryById.get(product.category_id)?.name ?? "Unknown category" : "Uncategorized",
      onHand,
      stockStatus: productStockStatus(product, onHand),
    };
  });
  const normalizedQuery = searchQuery.toLowerCase();
  const filteredRows = productRows.filter((row) => {
    const { product } = row;
    if (normalizedQuery && ![product.name, product.sku ?? "", product.barcode ?? "", row.categoryName].some((value) => value.toLowerCase().includes(normalizedQuery))) return false;
    if (categoryFilter === "uncategorized" ? product.category_id !== null : categoryFilter !== "all" && product.category_id !== categoryFilter) return false;
    if (posOnly && !product.is_active) return false;
    return statusMatches(row, status);
  });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const firstRow = filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, filteredRows.length);

  const activeProducts = products.filter((product) => product.is_active).length;
  const inactiveProducts = products.length - activeProducts;
  const outOfStockProducts = productRows.filter((row) => row.stockStatus === "out").length;
  const lowStockProducts = productRows.filter((row) => row.stockStatus === "low").length;
  const completedOrders = currentOrders.filter((order) => order.status === "completed");
  const previousCompletedOrders = previousOrders.filter((order) => order.status === "completed");
  const currentSales = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const previousSales = previousCompletedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const salesChange = percentChange(currentSales, previousSales);
  const completedOrderIds = new Set(completedOrders.map((order) => order.id));
  const topItemsByKey = new Map<string, TopSellingProduct>();
  for (const item of orderItems) {
    if (!completedOrderIds.has(item.order_id)) continue;
    const key = item.product_id ?? item.name_snapshot;
    const product = item.product_id ? productById.get(item.product_id) : undefined;
    const existing = topItemsByKey.get(key) ?? {
      productId: item.product_id,
      name: product?.name ?? item.name_snapshot,
      qty: 0,
      unit: product?.unit ?? "items",
      total: 0,
      orderIds: new Set<string>(),
      imageUrl: product?.image_url ?? null,
    };
    existing.qty += salesQuantity(item);
    existing.total += Number(item.line_total);
    existing.orderIds.add(item.order_id);
    topItemsByKey.set(key, existing);
  }
  const topSelling = Array.from(topItemsByKey.values()).sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 5);
  const bestSeller = topSelling[0];
  const categoryCounts = new Map<string, number>();
  for (const product of products) categoryCounts.set(product.category_id ?? "uncategorized", (categoryCounts.get(product.category_id ?? "uncategorized") ?? 0) + 1);
  const categoryTabs = [
    { id: "all", name: "All products", icon: "◈", count: products.length },
    ...categories.map((category) => ({ id: category.id, name: category.name, icon: category.icon || "•", count: categoryCounts.get(category.id) ?? 0 })),
    ...(categoryCounts.get("uncategorized") ? [{ id: "uncategorized", name: "Uncategorized", icon: "•", count: categoryCounts.get("uncategorized") ?? 0 }] : []),
  ];
  const categoryOverview = categories.map((category) => ({ ...category, count: categoryCounts.get(category.id) ?? 0 })).filter((category) => category.count > 0 || category.is_active);
  const currentBranchName = selectedBranchId ? branchById.get(selectedBranchId)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const orgName = profile.organizations?.name ?? DEFAULT_STORE_NAME;
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const userInitial = firstName.charAt(0).toUpperCase();
  const branding = readAdminBranding(profile.organizations?.settings);
  const dataWarning = Boolean(
    branchesResult.error || categoriesResult.error || Boolean(productsResult.error && !productsSchemaWarning) || fallbackProductsError || (suppliersResult.error && !suppliersSchemaWarning) || stockFallbackError || currentOrdersResult.error || previousOrdersResult.error || orderItemsError,
  );
  const canWrite = profile.role === "admin";
  const selectedProduct = selectedProductId ? productById.get(selectedProductId) : undefined;
  const formBranches = visibleBranches.filter((branch) => branch.is_active);
  const formDefaultBranch = selectedBranchId ?? formBranches[0]?.id ?? "";
  const baseHref = { q: searchQuery, category: categoryFilter, status, posOnly, range, pageSize, columns };

  return (
    <main data-admin-theme={branding.theme} className="admin-page products-page text-ink">
      <div className="min-w-0 px-4 pb-10 sm:px-6 lg:px-8">
          <header className="admin-topbar products-topbar">
            <Link href="/products" className="admin-mobile-brand" aria-label={`${branding.brandName} ${branding.brandTagline} products`}>
              <AdminBrandLogo logoUrl={branding.logoUrl} className="admin-brand__mark" iconSize={20} label="Brand logo" />
              <span className="admin-brand__copy"><strong>{branding.brandName}</strong><small>{branding.brandTagline}</small></span>
            </Link>
            <Link href="#product-filters" className="admin-icon-button" aria-label="Search products"><AdminIcon name="search" size={19} /></Link>
            <Link href="/admin/inventory?status=out" className="admin-icon-button admin-icon-button--alert" aria-label={outOfStockProducts ? `View ${outOfStockProducts} out of stock products` : "View inventory status"}>
              <AdminIcon name="bell" size={19} />
              {outOfStockProducts > 0 && <span className="admin-icon-button__badge" aria-hidden="true">{outOfStockProducts > 9 ? "9+" : outOfStockProducts}</span>}
            </Link>
            <Link href="#product-tips" className="admin-icon-button admin-icon-button--help" aria-label="View product tips"><AdminIcon name="help" size={19} /></Link>
            <div className="admin-user-chip"><span className="admin-user-chip__avatar" aria-hidden="true">{userInitial}</span><span className="admin-user-chip__copy"><strong>{firstName}</strong><small>{profile.role === "manager" ? "Manager" : "Admin"}</small></span></div>
            <SignOutButton className="px-2 py-2.5 text-[10px]" />
          </header>

          <div className="products-heading">
            <div className="min-w-0">
              <p className="products-heading__eyebrow">Product workspace · {currentBranchName}</p>
              <h1>Products</h1>
              <p>Manage your menu items and products that are available for sale in your POS.</p>
            </div>
            <div className="products-heading__actions">
              <details className="products-date-menu">
                <summary className="products-date-trigger"><AdminIcon name="calendar" size={15} /><span>{formatDateRange(currentStart, todayEnd)}</span><AdminIcon name="chevron" size={13} /></summary>
                <div className="products-popover products-date-popover">
                  <p className="products-popover__label">Sales and top products period</p>
                  {rangeOptions.map((option) => <Link key={option.value} href={buildProductsHref({ ...baseHref, range: option.value, page: 1 })} className={`products-menu-link ${range === option.value ? "is-active" : ""}`}>{option.label}<span>{option.value === "7d" ? "Current week" : `Current ${option.days} days`}</span></Link>)}
                </div>
              </details>
              <Link href="#product-filters" className="products-secondary-button"><AdminIcon name="filter" size={15} /> Filters{(searchQuery || categoryFilter !== "all" || status !== "all" || posOnly) && <span className="products-filter-count">!</span>}</Link>
              <ProductCreateDialog key={action === "product" ? "product-create-open" : "product-create-closed"} branches={formBranches} categories={categories} suppliers={suppliers} defaultBranch={formDefaultBranch} canWrite={canWrite} orgName={orgName} fromInventory={fromInventory} initialOpen={action === "product"} />
              <details className="products-add-menu">
                <summary className="products-secondary-button"><AdminIcon name="more" size={15} /> More</summary>
                <div className="products-popover products-add-popover">
                  <p className="products-popover__label">Catalog tools</p>
                  <Link href="/products?create=category#category-form" className="products-menu-link"><AdminIcon name="box" size={14} />Manage categories</Link>
                  <Link href="/products?import=1#import-items" className="products-menu-link"><AdminIcon name="upload" size={14} />Import products</Link>
                </div>
              </details>
            </div>
          </div>

          {params.error && <div role="alert" className="products-alert products-alert--danger">{readParam(params.error)}</div>}
          {params.saved && <div role="status" className="products-alert products-alert--success">{readParam(params.saved) === "bulk" ? `${readParam(params.updated) || "Selected"} product records updated.` : readParam(params.saved) === "visibility" ? "Product POS visibility updated." : readParam(params.saved) === "category" ? "Category saved. POS will use the updated category on its next refresh." : readParam(params.saved) === "imported" ? "Products imported. The table and inventory now use the new catalog rows." : readParam(params.legacy) === "1" ? "Product saved, but advanced catalog fields are unavailable until migrations 0009 and 0010 are applied." : "Product saved. POS will use the updated catalog on its next refresh."}</div>}
          {(productsSchemaWarning || suppliersSchemaWarning) && <div role="status" className="products-alert products-alert--warning"><strong>Some product fields are unavailable.</strong> Ensure <code>0009_admin_business_records.sql</code> is applied before <code>0010_inventory_catalog_fields.sql</code> in Supabase to enable suppliers and advanced inventory fields.</div>}
          {dataWarning && <div role="status" className="products-alert products-alert--warning">Some product insights could not refresh. The page is showing the data that was available; product edits remain protected by your admin role.</div>}

          {action === "edit" && selectedProduct && <ProductEditPanel product={selectedProduct} branches={visibleBranches} categories={categories} suppliers={suppliers} canWrite={canWrite} />}
          {action === "category" && <CategoryActionPanel branches={formBranches} categories={categories} defaultBranch={formDefaultBranch} canWrite={canWrite} branchById={branchById} />}
          {action === "import" && <ImportPanel branches={formBranches} defaultBranch={formDefaultBranch} canWrite={canWrite} />}
          {action === "bulk" && <BulkUpdatePanel canWrite={canWrite} />}

          <section aria-label="Product performance" className="products-kpi-grid">
            <ProductKpi label="Total products" value={String(products.length)} detail={`${activeProducts} active products`} icon="tag" tone="brown" />
            <ProductKpi label="Active" value={String(activeProducts)} detail="Visible in POS" icon="check" tone="green" />
            <ProductKpi label="Inactive" value={String(inactiveProducts)} detail="Hidden from POS" icon="eye" tone="gray" />
            <ProductKpi label="Out of stock" value={String(outOfStockProducts)} detail={`${lowStockProducts} also low stock`} icon="alert" tone="red" href="/admin/inventory?status=out" />
            <ProductKpi label="Top selling" value={bestSeller?.name ?? "No sales yet"} detail={bestSeller ? `${formatStockQuantity(bestSeller.qty)} ${bestSeller.unit} sold · ${formatDateRange(currentStart, todayEnd)}` : "Completed POS sales will appear here"} icon="star" tone="yellow" />
            <ProductKpi label={`Total sales (${range === "7d" ? "this week" : range})`} value={displayPeso(currentSales)} detail={salesChange === null ? "New sales in this period" : `${salesChange >= 0 ? "↑" : "↓"} ${Math.abs(salesChange).toFixed(1)}% vs previous period`} icon="wallet" tone="green" />
          </section>

          <div className="products-content-grid">
            <div className="min-w-0">
              <section className="products-table-card" aria-labelledby="products-table-heading">
                <nav className="products-category-tabs" aria-label="Product categories">
                  {categoryTabs.map((tab) => <Link key={tab.id} href={buildProductsHref({ ...baseHref, category: tab.id, page: 1 })} className={`products-category-tab ${categoryFilter === tab.id ? "is-active" : ""}`}><span>{tab.icon}</span><strong>{tab.name}</strong><small>{tab.count}</small></Link>)}
                </nav>

                <form id="product-filters" action="/products" method="get" className="products-filter-bar">
                  <label className="products-search-field"><AdminIcon name="search" size={16} /><span className="sr-only">Search products</span><input name="q" defaultValue={searchQuery} placeholder="Search by product name, SKU or barcode…" /></label>
                  <select name="category" defaultValue={categoryFilter} aria-label="Filter by category"><option value="all">All categories</option>{categoryTabs.slice(1).map((tab) => <option key={tab.id} value={tab.id}>{tab.name} · {tab.count}</option>)}</select>
                  <select name="status" defaultValue={status} aria-label="Filter by status">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <label className="products-pos-filter"><span>POS only</span><input type="checkbox" name="pos" value="1" defaultChecked={posOnly} /><span className="products-switch products-switch--filter" aria-hidden="true"><span /></span></label>
                  <details className="products-columns-menu">
                    <summary className="products-secondary-button"><AdminIcon name="columns" size={15} /> Columns</summary>
                    <div className="products-popover products-columns-popover">
                      <p className="products-popover__label">Visible columns</p>
                      {columnOptions.map((column) => <label key={column.value} className="products-column-option"><input type="checkbox" name="columns" value={column.value} defaultChecked={columns.has(column.value)} />{column.label}</label>)}
                      <button type="submit" className="products-small-primary">Apply columns</button>
                    </div>
                  </details>
                  <button type="submit" className="products-small-primary products-search-button"><AdminIcon name="search" size={14} /><span>Search</span></button>
                </form>

                <div className="products-table-heading"><div><p className="products-table-heading__eyebrow">Menu inventory</p><h2 id="products-table-heading">All products</h2><p>{filteredRows.length} matching product{filteredRows.length === 1 ? "" : "s"} for {currentBranchName}.</p></div><span className="products-table-heading__scope">{canWrite ? "Admin editing enabled" : "Read only"}</span></div>

                {pageRows.length === 0 ? <ProductsEmptyState hasProducts={products.length > 0} href="/products?create=product" /> : (
                  <div className="products-table-scroll">
                    <table className="products-table">
                      <thead><tr>{showBulk && <th className="products-select-column"><span className="sr-only">Select</span></th>}<th>Product</th>{columns.has("category") && <th>Category</th>}{columns.has("sku") && <th>SKU / barcode</th>}{columns.has("price") && <th>Price</th>}{columns.has("status") && <th>Status</th>}{columns.has("pos") && <th>POS visibility</th>}{columns.has("stock") && <th>Stock</th>}<th>Actions</th></tr></thead>
                      <tbody>
                        {pageRows.map((row) => {
                          const { product } = row;
                          const supplier = product.supplier_id ? supplierById.get(product.supplier_id)?.name : null;
                          return <tr key={product.id} className={selectedProductId === product.id ? "is-selected" : undefined}>
                            {showBulk && <td className="products-select-column"><input form="bulk-update-form" type="checkbox" name="product_ids" value={product.id} aria-label={`Select ${product.name}`} /></td>}
                            <td><div className="products-table-product"><Image src={productImage(product)} alt="" width={38} height={38} className="products-table-product__image" /><div className="products-table-product__copy"><strong>{product.name}</strong><small>{product.pricing_mode === "per_kg" ? `Price per kg · ${product.unit}` : `${product.unit} · ${supplier ?? "No supplier assigned"}`}</small></div></div></td>
                            {columns.has("category") && <td><span className="products-category-label">{row.categoryName}</span></td>}
                            {columns.has("sku") && <td><strong className="products-table-code">{product.sku || "SKU not set"}</strong><small className="products-table-code__sub">{product.barcode || "Barcode not set"}</small></td>}
                            {columns.has("price") && <td className="products-price">{displayPeso(Number(product.price))}<small>{product.pricing_mode === "per_kg" ? "/ kg" : `per ${product.unit}`}</small></td>}
                            {columns.has("status") && <td><span className={`products-status-pill ${product.is_active ? "is-active" : "is-inactive"}`}>{product.is_active ? "Active" : "Inactive"}</span></td>}
                            {columns.has("pos") && <td><form action={toggleProductVisibility}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="is_active" value={String(!product.is_active)} /><button type="submit" role="switch" aria-checked={product.is_active} aria-label={`${product.is_active ? "Hide" : "Show"} ${product.name} in POS`} disabled={!canWrite} className={`products-switch ${product.is_active ? "is-on" : ""}`}><span /></button></form></td>}
                            {columns.has("stock") && <td><div className="products-stock-cell">{row.onHand === null ? <strong>—</strong> : <strong className="tnums">{formatStockQuantity(row.onHand)} {product.unit}</strong>}<small className={stockStatusClass(row.stockStatus)}>{stockStatusLabel(row.stockStatus)}</small></div></td>}
                            <td><div className="products-row-actions"><Link href={`/products?edit=${product.id}#product-edit`} className="products-icon-button" aria-label={`Edit ${product.name}`}><AdminIcon name="edit" size={14} /></Link><details className="products-row-menu"><summary className="products-icon-button" aria-label={`More actions for ${product.name}`}><AdminIcon name="more" size={15} /></summary><div className="products-popover products-row-popover"><Link href={`/products?edit=${product.id}#product-edit`} className="products-menu-link">Edit product</Link><Link href={`/admin/inventory?product=${product.id}&movement=receive#stock-movement`} className="products-menu-link">Record stock movement</Link><Link href={`/admin/sales?range=${range}`} className="products-menu-link">View sales report</Link></div></details></div></td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="products-table-footer"><span>Showing {firstRow} to {lastRow} of {filteredRows.length} products</span><div className="products-pagination"><Link href={page > 1 ? buildProductsHref({ ...baseHref, page: page - 1 }) : buildProductsHref({ ...baseHref, page: 1 })} aria-label="Previous page" className={page > 1 ? "" : "is-disabled"}>‹</Link>{Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((pageNumber) => <Link key={pageNumber} href={buildProductsHref({ ...baseHref, page: pageNumber })} className={pageNumber === page ? "is-active" : ""}>{pageNumber}</Link>)}{page < totalPages && <Link href={buildProductsHref({ ...baseHref, page: page + 1 })} aria-label="Next page">›</Link>}</div><form action="/products" method="get" className="products-page-size"><input type="hidden" name="q" value={searchQuery} /><input type="hidden" name="category" value={categoryFilter} /><input type="hidden" name="status" value={status} /><input type="hidden" name="range" value={range} />{posOnly && <input type="hidden" name="pos" value="1" />}<input type="hidden" name="columns" value={[...columns].join(",")} /><label htmlFor="products-page-size">Rows per page:</label><select id="products-page-size" name="pageSize" defaultValue={String(pageSize)}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select><button type="submit" aria-label="Apply rows per page">⌄</button></form></div>
              </section>
            </div>

            <aside className="products-sidebar-panels">
              <section className="products-side-card" aria-labelledby="categories-overview-heading"><div className="products-side-card__header"><div><h2 id="categories-overview-heading">Categories overview</h2><p>Manage your product categories</p></div></div><div className="products-category-list">{categoryOverview.length === 0 ? <p className="products-side-empty">No categories yet.</p> : categoryOverview.map((category) => <Link key={category.id} href={buildProductsHref({ ...baseHref, category: category.id, page: 1 })} className="products-category-row"><span className="products-category-row__icon">{category.icon || "•"}</span><strong>{category.name}</strong><small>{category.count} product{category.count === 1 ? "" : "s"}</small></Link>)}</div><Link href="/products?create=category#category-form" className="products-outline-button"><AdminIcon name="box" size={14} /> Manage categories</Link></section>
              <section className="products-side-card" aria-labelledby="top-selling-heading"><div className="products-side-card__header"><div><h2 id="top-selling-heading">Top selling products</h2><p>{range === "7d" ? "This week" : `Last ${selectedDays} days`}</p></div><details className="products-side-period"><summary className="products-side-select">{rangeOptions.find((option) => option.value === range)?.label ?? "Period"} <AdminIcon name="chevron" size={11} /></summary><div className="products-popover products-side-period-popover">{rangeOptions.map((option) => <Link key={option.value} href={buildProductsHref({ ...baseHref, range: option.value, page: 1 })} className={`products-menu-link ${range === option.value ? "is-active" : ""}`}>{option.label}</Link>)}</div></details></div><div className="products-ranking">{topSelling.slice(0, 3).length === 0 ? <p className="products-side-empty">Completed POS sales will appear here.</p> : topSelling.slice(0, 3).map((item, index) => <div key={`${item.productId ?? item.name}-${index}`} className="products-ranking__item"><span className={`products-ranking__rank ${index === 0 ? "is-first" : ""}`}>{index + 1}</span><Image src={productImage({ name: item.name, image_url: item.imageUrl })} alt="" width={32} height={32} className="products-ranking__image" /><span className="products-ranking__copy"><strong>{item.name}</strong><small>{displayPeso(item.total)} · {item.orderIds.size} order{item.orderIds.size === 1 ? "" : "s"}</small></span><small className="products-ranking__qty">{formatStockQuantity(item.qty)} {item.unit} sold</small></div>)}</div><Link href={`/admin/sales?range=${range}`} className="products-outline-button"><AdminIcon name="chart" size={14} /> View sales report</Link></section>
              <section id="product-tips" className="products-tip-card"><span className="products-tip-card__icon"><AdminIcon name="alert" size={15} /></span><h2>Product tips</h2><strong>Keep your menu updated</strong><p>Review prices, POS visibility, and stock thresholds regularly so customers see accurate availability.</p><Link href="/admin/inventory#inventory-help">Learn more <AdminIcon name="arrow" size={13} /></Link></section>
            </aside>
          </div>
      </div>
    </main>
  );
}

function ProductKpi({ label, value, detail, icon, tone, href }: { label: string; value: string; detail: string; icon: AdminIconName; tone: "brown" | "green" | "gray" | "red" | "yellow"; href?: string }) {
  const toneClass = { brown: "is-brown", green: "is-green", gray: "is-gray", red: "is-red", yellow: "is-yellow" }[tone];
  return <article className="products-kpi-card"><div className={`products-kpi-card__icon ${toneClass}`}><AdminIcon name={icon} size={17} /></div><div className="products-kpi-card__copy"><span>{label}</span><strong className={label === "Top selling" ? "is-text-value" : "tnums"}>{value}</strong>{href ? <Link href={href}>{detail} <AdminIcon name="arrow" size={12} /></Link> : <small>{detail}</small>}</div></article>;
}

function ProductEditPanel({ product, branches, categories, suppliers, canWrite }: { product: ProductRecord; branches: BranchRecord[]; categories: CategoryRecord[]; suppliers: SupplierRecord[]; canWrite: boolean }) {
  return <section id="product-edit" className="products-action-panel" aria-labelledby="product-edit-heading"><div className="products-action-panel__header"><div><p className="products-action-panel__eyebrow">Product record · {product.sku || "SKU not set"}</p><h2 id="product-edit-heading">Edit {product.name}</h2><p>Update the product master data used by POS and inventory.</p></div><Link href="/products" className="products-icon-button" aria-label="Close product editor">×</Link></div><form action={updateProduct} className="products-form-grid"><input type="hidden" name="product_id" value={product.id} /><ProductFields product={product} branches={branches} categories={categories} suppliers={suppliers} defaultBranch={product.store_id} canWrite={canWrite} prefix={`edit-product-${product.id}`} /><div className="products-form-actions"><label className="products-checkbox-label"><input type="checkbox" name="track_stock" defaultChecked={product.track_stock} disabled={!canWrite} /> Track stock in inventory</label><label className="products-checkbox-label"><input type="checkbox" name="is_active" defaultChecked={product.is_active} disabled={!canWrite} /> Visible in POS</label><button type="submit" disabled={!canWrite} className="products-primary-button products-form-submit">Save product</button></div></form></section>;
}

function CategoryActionPanel({ branches, categories, defaultBranch, canWrite, branchById }: { branches: BranchRecord[]; categories: CategoryRecord[]; defaultBranch: string; canWrite: boolean; branchById: Map<string, BranchRecord> }) {
  return <section id="category-form" className="products-action-panel" aria-labelledby="category-form-heading"><div className="products-action-panel__header"><div><p className="products-action-panel__eyebrow">Menu organization</p><h2 id="category-form-heading">Add category</h2><p>Categories are shared by the POS product rail and product filters.</p></div><Link href="/products" className="products-icon-button" aria-label="Close category form">×</Link></div><form action={createCategory} className="products-category-create-form"><CatalogField label="Branch" htmlFor="new-category-store"><select id="new-category-store" name="store_id" defaultValue={defaultBranch} required disabled={!canWrite} className="inventory-input"><option value="">Choose branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></CatalogField><CatalogField label="Category name" htmlFor="new-category-name"><input id="new-category-name" name="name" placeholder="e.g. Lechon" required disabled={!canWrite} className="inventory-input" /></CatalogField><CatalogField label="Icon" htmlFor="new-category-icon"><input id="new-category-icon" name="icon" placeholder="Optional emoji" disabled={!canWrite} className="inventory-input" /></CatalogField><CatalogField label="Sort order" htmlFor="new-category-sort"><input id="new-category-sort" name="sort_order" type="number" min="0" step="1" defaultValue="0" disabled={!canWrite} className="inventory-input tnums" /></CatalogField><button type="submit" disabled={!canWrite || branches.length === 0} className="products-primary-button products-form-submit">Create category</button></form><div className="products-existing-categories"><div className="products-action-panel__subhead"><h3>Existing categories</h3><span>{categories.length}</span></div>{categories.length === 0 ? <p className="products-side-empty">Create the first category to organize your menu.</p> : <div className="products-existing-category-list">{categories.map((category) => <CategoryEditor key={category.id} category={category} branchName={branchById.get(category.store_id)?.name ?? "Unknown branch"} canWrite={canWrite} />)}</div>}</div></section>;
}

function CategoryEditor({ category, branchName, canWrite }: { category: CategoryRecord; branchName: string; canWrite: boolean }) {
  return <form action={updateCategory} className="products-existing-category"><input type="hidden" name="category_id" value={category.id} /><input type="hidden" name="store_id" value={category.store_id} /><input type="hidden" name="icon" value={category.icon ?? ""} /><span className="products-category-row__icon">{category.icon || "•"}</span><div className="products-existing-category__copy"><strong>{category.name}</strong><small>{branchName}</small></div><input name="name" aria-label={`Name for ${category.name}`} defaultValue={category.name} disabled={!canWrite} className="inventory-input inventory-input--compact" /><input name="sort_order" aria-label={`Sort order for ${category.name}`} type="number" min="0" step="1" defaultValue={category.sort_order} disabled={!canWrite} className="inventory-input inventory-input--compact w-16 text-center tnums" /><label className="products-checkbox-label"><input type="checkbox" name="is_active" defaultChecked={category.is_active} disabled={!canWrite} /> Visible</label><button type="submit" disabled={!canWrite} className="products-small-primary">Save</button></form>;
}

function ImportPanel({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <section id="import-items" className="products-action-panel" aria-labelledby="import-items-heading"><div className="products-action-panel__header"><div><p className="products-action-panel__eyebrow">Bulk catalog action</p><h2 id="import-items-heading">Import products</h2><p>Paste CSV data with name, price, and unit. Optional columns include SKU, barcode, category, supplier, cost price, and minimum stock. Add photos from the product editor after import.</p></div><Link href="/products" className="products-icon-button" aria-label="Close import form">×</Link></div><form action={importProducts} className="products-import-form"><CatalogField label="Default branch" htmlFor="import-store"><select id="import-store" name="store_id" defaultValue={defaultBranch} required disabled={!canWrite || branches.length === 0} className="inventory-input"><option value="">Choose branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></CatalogField><CatalogField label="CSV data" htmlFor="import-csv" className="products-import-form__csv"><textarea id="import-csv" name="csv" rows={5} disabled={!canWrite} placeholder="name,price,unit,sku,category,supplier,cost_price,min_stock\nWhole Lechon (Medium),6500,kg,LECHON-MED-001,Lechon,Rico's Farm,5400,5" className="inventory-input min-h-28 resize-y font-mono text-[11px]" /></CatalogField><button type="submit" disabled={!canWrite || branches.length === 0} className="products-primary-button products-form-submit">Import products</button></form></section>;
}

function BulkUpdatePanel({ canWrite }: { canWrite: boolean }) {
  return <section id="bulk-update" className="products-action-panel" aria-labelledby="bulk-update-heading"><div className="products-action-panel__header"><div><p className="products-action-panel__eyebrow">Bulk update</p><h2 id="bulk-update-heading">Update selected products</h2><p>Select rows in the table, choose a field change, and apply it to up to 100 product records.</p></div><Link href="/products" className="products-icon-button" aria-label="Close bulk update form">×</Link></div><form id="bulk-update-form" action={bulkUpdateProducts} className="products-bulk-form"><label>POS visibility<select name="is_active" disabled={!canWrite} className="inventory-input inventory-input--compact"><option value="leave">Leave unchanged</option><option value="true">Show in POS</option><option value="false">Hide from POS</option></select></label><label>Stock tracking<select name="track_stock" disabled={!canWrite} className="inventory-input inventory-input--compact"><option value="leave">Leave unchanged</option><option value="true">Track stock</option><option value="false">Do not track</option></select></label><button type="submit" disabled={!canWrite} className="products-primary-button products-form-submit">Apply to selected</button></form><p className="products-bulk-help">Use the selection boxes in the table below. Changes are written directly to the products table and refresh POS and Inventory.</p></section>;
}

function CatalogField({ label, htmlFor, children, className = "" }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return <label htmlFor={htmlFor} className={`products-form-field ${className}`}><span>{label}</span>{children}</label>;
}

function ProductsEmptyState({ hasProducts, href }: { hasProducts: boolean; href: string }) {
  return <div className="products-empty-state"><span><AdminIcon name="box" size={22} /></span><strong>{hasProducts ? "No products match these filters" : "Your product catalog is empty"}</strong><p>{hasProducts ? "Try a wider search, another category, or clear the status filters." : "Add your first product to make it available for POS and inventory."}</p><Link href={href} className="products-primary-button">Add product</Link></div>;
}

function ProductsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
