import type { createClient } from "@/lib/supabase/server";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";
import { getAdminBranchOptions } from "@/lib/admin/branches";
import { dashboardLowStockThreshold } from "@/lib/admin/inventory-settings";
import { formatStockQuantity, stockMovementDelta, type StockMovementType } from "@/lib/inventory";

const DAY_MS = 24 * 60 * 60 * 1000;
const SINGAPORE_TIME_ZONE = "Asia/Singapore";
const VALID_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type InventoryReportClient = Awaited<ReturnType<typeof createClient>>;

export type InventoryReportParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type InventoryReportFilters = {
  from: string;
  to: string;
  branchId: string;
  categoryId: string;
  productId: string;
  supplierId: string;
};

export type InventoryReportProfile = {
  org_id: string;
  role: "admin" | "manager";
  store_id: string | null;
};

export type InventoryReportBranch = AdminBranchOption;

export type InventoryReportCategory = {
  id: string;
  store_id: string;
  name: string;
};

export type InventoryReportSupplier = {
  id: string;
  store_id: string | null;
  name: string;
  is_active: boolean;
};

export type InventoryReportProduct = {
  id: string;
  store_id: string;
  category_id: string | null;
  supplier_id: string | null;
  name: string;
  sku: string | null;
  unit: string;
  price: number | string;
  cost_price: number | string | null;
  min_stock: number | string | null;
  track_stock: boolean;
  is_active: boolean;
};

export type InventoryReportItem = {
  id: string;
  store_id: string;
  linked_product_id: string | null;
  name: string;
  item_type: string;
  unit: string;
  cost_per_unit: number | string | null;
  min_stock: number | string | null;
  supplier_id: string | null;
  is_active: boolean;
};

export type QuantityTotal = {
  unit: string;
  value: number;
};

export type InventoryStatus = "out" | "low" | "ok";

export type InventoryReportInventoryRow = {
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  productId: string;
  linkedProductId: string | null;
  itemType: string;
  productName: string;
  categoryName: string;
  supplierName: string;
  unit: string;
  onHand: number;
  minimum: number;
  status: InventoryStatus;
  inventoryValue: number;
};

export type InventoryReportMovementRow = {
  id: string;
  branchId: string;
  branchName: string;
  productId: string;
  inventoryItemId: string | null;
  productName: string;
  categoryName: string;
  supplierName: string;
  type: StockMovementType;
  typeLabel: string;
  quantity: number;
  unit: string;
  netChange: number;
  reason: string;
  createdAt: string;
};

export type InventoryReportMovementSummary = {
  type: StockMovementType;
  label: string;
  events: number;
  quantity: QuantityTotal[];
  netChange: QuantityTotal[];
};

export type InventoryReportVarianceRow = {
  id: string;
  branchId: string;
  branchName: string;
  productId: string;
  inventoryItemId: string | null;
  productName: string;
  categoryName: string;
  supplierName: string;
  countDate: string;
  expected: number;
  counted: number;
  variance: number;
  unit: string;
  status: "balanced" | "short" | "over";
  updatedAt: string;
};

export type InventoryReportData = {
  filters: InventoryReportFilters;
  branchFilterLocked: boolean;
  branches: InventoryReportBranch[];
  categories: InventoryReportCategory[];
  suppliers: InventoryReportSupplier[];
  products: InventoryReportProduct[];
  inventoryRows: InventoryReportInventoryRow[];
  movementRows: InventoryReportMovementRow[];
  movementSummary: InventoryReportMovementSummary[];
  varianceRows: InventoryReportVarianceRow[];
  yieldSummary: {
    entryCount: number;
    sourceUsage: QuantityTotal[];
    totalYield: QuantityTotal[];
    waste: QuantityTotal[];
    usableYield: QuantityTotal[];
  };
  summary: {
    trackedProducts: number;
    lowStock: number;
    outOfStock: number;
    inventoryValue: number;
    movementCount: number;
    varianceLines: number;
    shortLines: number;
    overLines: number;
    balancedLines: number;
  };
  queryWarning: boolean;
  stockWarning: boolean;
};

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  receive: "Stock received",
  yield_in: "Yield output",
  yield_out: "Yield source used",
  sale: "POS sale",
  waste: "Waste recorded",
  adjust: "Manual adjustment",
};

const MOVEMENT_TYPES: StockMovementType[] = ["receive", "yield_in", "yield_out", "sale", "waste", "adjust"];

function readParam(source: InventoryReportParamSource, key: string) {
  if (source instanceof URLSearchParams) return source.get(key) ?? "";
  const value = source[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function singaporeDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: SINGAPORE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(value);
  const values = new Map(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function shiftSingaporeDate(value: string, days: number) {
  const start = new Date(`${value}T00:00:00+08:00`);
  return singaporeDate(new Date(start.getTime() + days * DAY_MS));
}

function isValidDate(value: string) {
  if (!VALID_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function reportDateStart(value: string) {
  return new Date(`${value}T00:00:00+08:00`);
}

export function reportDateEnd(value: string) {
  return new Date(reportDateStart(value).getTime() + DAY_MS);
}

export function readInventoryReportFilters(source: InventoryReportParamSource, now = new Date()): InventoryReportFilters {
  const toDefault = singaporeDate(now);
  const fromDefault = shiftSingaporeDate(toDefault, -29);
  const fromParam = readParam(source, "from");
  const toParam = readParam(source, "to");
  const rawFrom = isValidDate(fromParam) ? fromParam : fromDefault;
  const rawTo = isValidDate(toParam) ? toParam : toDefault;
  const from = rawFrom <= rawTo ? rawFrom : rawTo;
  const to = rawFrom <= rawTo ? rawTo : rawFrom;

  return {
    from,
    to,
    branchId: readParam(source, "branch"),
    categoryId: readParam(source, "category"),
    productId: readParam(source, "product"),
    supplierId: readParam(source, "supplier"),
  };
}

export function inventoryReportQuery(filters: InventoryReportFilters, kind?: "inventory" | "movements" | "variance") {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.branchId) params.set("branch", filters.branchId);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.productId) params.set("product", filters.productId);
  if (filters.supplierId) params.set("supplier", filters.supplierId);
  if (kind) params.set("kind", kind);
  return params.toString();
}

function resolveBranchFilter(
  requestedBranchId: string,
  workspaceBranchId: string | null,
  profile: InventoryReportProfile,
  branches: InventoryReportBranch[],
) {
  if (profile.role === "manager") return profile.store_id ?? "";
  if (workspaceBranchId) return workspaceBranchId;
  return branches.some((branch) => branch.id === requestedBranchId) ? requestedBranchId : "";
}

function productMatches(
  product: InventoryReportProduct,
  filters: InventoryReportFilters,
) {
  if (filters.branchId && product.store_id !== filters.branchId) return false;
  if (filters.productId && product.id !== filters.productId) return false;
  if (filters.categoryId === "uncategorized" && product.category_id) return false;
  if (filters.categoryId && filters.categoryId !== "uncategorized" && product.category_id !== filters.categoryId) return false;
  if (filters.supplierId === "unassigned" && product.supplier_id) return false;
  if (filters.supplierId && filters.supplierId !== "unassigned" && product.supplier_id !== filters.supplierId) return false;
  return true;
}

function inventoryItemMatches(
  item: InventoryReportItem,
  filters: InventoryReportFilters,
  productById: Map<string, InventoryReportProduct>,
) {
  if (filters.branchId && item.store_id !== filters.branchId) return false;
  if (filters.supplierId === "unassigned" && item.supplier_id) return false;
  if (filters.supplierId && filters.supplierId !== "unassigned" && item.supplier_id !== filters.supplierId) return false;

  const linkedProduct = item.linked_product_id ? productById.get(item.linked_product_id) : undefined;
  if (filters.productId && item.linked_product_id !== filters.productId) return false;
  if (filters.categoryId || filters.productId) {
    return Boolean(linkedProduct && productMatches(linkedProduct, filters));
  }
  return true;
}

function totalsByUnit(entries: Array<{ value: number; unit: string }>) {
  const totals = new Map<string, number>();
  for (const entry of entries) totals.set(entry.unit, (totals.get(entry.unit) ?? 0) + entry.value);
  return Array.from(totals.entries())
    .map(([unit, value]) => ({ unit, value }))
    .sort((a, b) => a.unit.localeCompare(b.unit));
}

function subtractTotals(positive: QuantityTotal[], negative: QuantityTotal[]) {
  const entries = [
    ...positive.map((item) => ({ value: item.value, unit: item.unit })),
    ...negative.map((item) => ({ value: -item.value, unit: item.unit })),
  ];
  return totalsByUnit(entries).filter((item) => Math.abs(item.value) > 0.0005);
}

export function formatQuantityTotals(totals: QuantityTotal[], signed = false) {
  if (totals.length === 0) return "—";
  return totals.map((item) => {
    const sign = item.value < 0 ? "−" : signed && item.value > 0 ? "+" : "";
    return `${sign}${formatStockQuantity(Math.abs(item.value))} ${item.unit}`;
  }).join(" · ");
}

type MovementRecord = {
  id: string;
  store_id: string;
  product_id: string | null;
  inventory_item_id: string | null;
  type: StockMovementType;
  qty: number | string;
  unit: string;
  reason: string | null;
  created_at: string;
};

type CurrentStockRecord = {
  store_id: string;
  product_id: string;
  qty: number | string;
};

type CurrentInventoryStockRecord = {
  store_id: string;
  inventory_item_id: string;
  qty: number | string;
};

type CountRecord = {
  id: string;
  store_id: string;
  product_id: string | null;
  inventory_item_id: string | null;
  count_date: string;
  expected_qty: number | string;
  counted_qty: number | string;
  variance_qty: number | string;
  unit: string;
  updated_at: string;
};

export async function loadInventoryReport(
  supabase: InventoryReportClient,
  profile: InventoryReportProfile,
  requestedFilters: InventoryReportFilters,
  defaultLowStockThreshold: number,
): Promise<InventoryReportData> {
  const branchesResult = await getAdminBranchOptions(profile.org_id);
  const branches = branchesResult.data as InventoryReportBranch[];
  const workspaceBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(branches, profile.store_id)
    : profile.store_id;
  const branchId = resolveBranchFilter(requestedFilters.branchId, workspaceBranchId, profile, branches);
  const initialFilters = { ...requestedFilters, branchId };

  let categoriesQuery = supabase
    .from("categories")
    .select("id, store_id, name")
    .eq("org_id", profile.org_id)
    .order("name");
  let productsQuery = supabase
    .from("products")
    .select("id, store_id, category_id, supplier_id, name, sku, unit, price, cost_price, min_stock, track_stock, is_active")
    .eq("org_id", profile.org_id)
    .order("name")
    .limit(3000);
  let inventoryItemsQuery = supabase
    .from("inventory_items")
    .select("id, store_id, linked_product_id, name, item_type, unit, cost_per_unit, min_stock, supplier_id, is_active")
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .order("name")
    .limit(5000);
  let movementsQuery = supabase
    .from("stock_movements")
    .select("id, store_id, product_id, inventory_item_id, type, qty, unit, reason, created_at")
    .eq("org_id", profile.org_id)
    .gte("created_at", reportDateStart(initialFilters.from).toISOString())
    .lt("created_at", reportDateEnd(initialFilters.to).toISOString())
    .order("created_at", { ascending: false })
    .limit(10000);
  let countsQuery = supabase
    .from("inventory_counts")
    .select("id, store_id, product_id, inventory_item_id, count_date, expected_qty, counted_qty, variance_qty, unit, updated_at")
    .eq("org_id", profile.org_id)
    .gte("count_date", initialFilters.from)
    .lte("count_date", initialFilters.to)
    .order("count_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(10000);

  if (branchId) {
    categoriesQuery = categoriesQuery.eq("store_id", branchId);
    productsQuery = productsQuery.eq("store_id", branchId);
    inventoryItemsQuery = inventoryItemsQuery.eq("store_id", branchId);
    movementsQuery = movementsQuery.eq("store_id", branchId);
    countsQuery = countsQuery.eq("store_id", branchId);
  }

  const [categoriesResult, suppliersResult, productsResult, inventoryItemsResult, movementsResult, countsResult, stockResult, inventoryStockResult] = await Promise.all([
    categoriesQuery,
    supabase.from("suppliers").select("id, store_id, name, is_active").eq("org_id", profile.org_id).order("name").limit(1000),
    productsQuery,
    inventoryItemsQuery,
    movementsQuery,
    countsQuery,
    supabase.rpc("current_stock", { p_org_id: profile.org_id }),
    supabase.rpc("current_inventory_stock", { p_org_id: profile.org_id }),
  ]);

  const categories = (categoriesResult.data ?? []) as InventoryReportCategory[];
  const suppliers = (suppliersResult.data ?? []) as InventoryReportSupplier[];
  const products = (productsResult.data ?? []) as InventoryReportProduct[];
  const inventoryItems = (inventoryItemsResult.data ?? []) as InventoryReportItem[];
  const movements = (movementsResult.data ?? []) as MovementRecord[];
  const counts = (countsResult.data ?? []) as CountRecord[];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const inventoryItemById = new Map(inventoryItems.map((item) => [item.id, item]));
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));

  const effectiveFilters: InventoryReportFilters = {
    ...initialFilters,
    categoryId: initialFilters.categoryId === "uncategorized" || categoryById.has(initialFilters.categoryId) ? initialFilters.categoryId : "",
    productId: productById.has(initialFilters.productId) ? initialFilters.productId : "",
    supplierId: initialFilters.supplierId === "unassigned" || supplierById.has(initialFilters.supplierId) ? initialFilters.supplierId : "",
  };

  const usingInventoryItems = !inventoryItemsResult.error;
  const stockQueryResult = usingInventoryItems ? inventoryStockResult : stockResult;
  const stockByKey = new Map<string, number>();
  let stockWarning = Boolean(stockQueryResult.error);
  if (!stockQueryResult.error) {
    if (usingInventoryItems) {
      for (const row of (stockQueryResult.data ?? []) as CurrentInventoryStockRecord[]) {
        if (!effectiveFilters.branchId || row.store_id === effectiveFilters.branchId) {
          stockByKey.set(`${row.store_id}:${row.inventory_item_id}`, Number(row.qty));
        }
      }
    } else {
      for (const row of (stockQueryResult.data ?? []) as CurrentStockRecord[]) {
        if (!effectiveFilters.branchId || row.store_id === effectiveFilters.branchId) {
          stockByKey.set(`${row.store_id}:${row.product_id}`, Number(row.qty));
        }
      }
    }
  } else {
    let fallbackStockQuery = supabase
      .from("stock_movements")
      .select("store_id, product_id, inventory_item_id, type, qty")
      .eq("org_id", profile.org_id)
      .limit(20000);
    if (effectiveFilters.branchId) fallbackStockQuery = fallbackStockQuery.eq("store_id", effectiveFilters.branchId);
    const fallbackStockResult = await fallbackStockQuery;
    stockWarning = Boolean(fallbackStockResult.error);
    for (const movement of (fallbackStockResult.data ?? []) as Array<{ store_id: string; product_id: string | null; inventory_item_id: string | null; type: StockMovementType; qty: number | string }>) {
      const keyId = usingInventoryItems ? movement.inventory_item_id : movement.product_id;
      if (!keyId) continue;
      const key = `${movement.store_id}:${keyId}`;
      stockByKey.set(key, (stockByKey.get(key) ?? 0) + stockMovementDelta(movement.type, Number(movement.qty)));
    }
  }

  const categoryName = (product: InventoryReportProduct) => product.category_id ? categoryById.get(product.category_id)?.name ?? "Uncategorized" : "Uncategorized";
  const supplierName = (product: InventoryReportProduct) => product.supplier_id ? supplierById.get(product.supplier_id)?.name ?? "Unassigned" : "Unassigned";
  const productMatchesFilters = (product: InventoryReportProduct) => productMatches(product, effectiveFilters);

  const inventoryRows = (usingInventoryItems
    ? inventoryItems
      .filter((item) => item.is_active && inventoryItemMatches(item, effectiveFilters, productById))
      .flatMap((item) => {
        const branch = branchById.get(item.store_id);
        if (!branch) return [];
        const linkedProduct = item.linked_product_id ? productById.get(item.linked_product_id) : undefined;
        const onHand = stockByKey.get(`${item.store_id}:${item.id}`) ?? 0;
        const minimum = dashboardLowStockThreshold(item.min_stock, defaultLowStockThreshold);
        const status: InventoryStatus = onHand <= 0 ? "out" : onHand <= minimum ? "low" : "ok";
        return [{
          branchId: branch.id,
          branchName: branch.name,
          inventoryItemId: item.id,
          productId: item.id,
          linkedProductId: item.linked_product_id,
          itemType: item.item_type,
          productName: item.name,
          categoryName: linkedProduct ? categoryName(linkedProduct) : "Unassigned",
          supplierName: item.supplier_id ? supplierById.get(item.supplier_id)?.name ?? "Unassigned" : "Unassigned",
          unit: item.unit,
          onHand,
          minimum,
          status,
          inventoryValue: Math.max(0, onHand) * Number(item.cost_per_unit ?? 0),
        } satisfies InventoryReportInventoryRow];
      })
    : products
      .filter((product) => product.track_stock && product.is_active && productMatchesFilters(product))
      .flatMap((product) => {
        const branch = branchById.get(product.store_id);
        if (!branch) return [];
        const onHand = stockByKey.get(`${product.store_id}:${product.id}`) ?? 0;
        const minimum = dashboardLowStockThreshold(product.min_stock, defaultLowStockThreshold);
        const status: InventoryStatus = onHand <= 0 ? "out" : onHand <= minimum ? "low" : "ok";
        return [{
          branchId: branch.id,
          branchName: branch.name,
          inventoryItemId: product.id,
          productId: product.id,
          linkedProductId: product.id,
          itemType: "finished_good",
          productName: product.name,
          categoryName: categoryName(product),
          supplierName: supplierName(product),
          unit: product.unit,
          onHand,
          minimum,
          status,
          inventoryValue: Math.max(0, onHand) * Number(product.cost_price ?? product.price),
        } satisfies InventoryReportInventoryRow];
      }))
    .sort((a, b) => {
      const statusOrder: Record<InventoryStatus, number> = { out: 0, low: 1, ok: 2 };
      return statusOrder[a.status] - statusOrder[b.status] || a.productName.localeCompare(b.productName);
    });

  const movementRows = movements
    .filter((movement) => {
      const item = movement.inventory_item_id ? inventoryItemById.get(movement.inventory_item_id) : undefined;
      const product = movement.product_id ? productById.get(movement.product_id) : undefined;
      return item
        ? inventoryItemMatches(item, effectiveFilters, productById)
        : Boolean(product && productMatchesFilters(product));
    })
    .map((movement) => {
      const item = movement.inventory_item_id ? inventoryItemById.get(movement.inventory_item_id) : undefined;
      const product = movement.product_id ? productById.get(movement.product_id) : undefined;
      const branch = branchById.get(movement.store_id);
      const type = movement.type;
      return {
        id: movement.id,
        branchId: movement.store_id,
        branchName: branch?.name ?? "Unknown branch",
        productId: movement.inventory_item_id ?? movement.product_id ?? "",
        inventoryItemId: movement.inventory_item_id,
        productName: item?.name ?? product?.name ?? "Unknown inventory item",
        categoryName: product ? categoryName(product) : "Uncategorized",
        supplierName: item?.supplier_id ? supplierById.get(item.supplier_id)?.name ?? "Unassigned" : product ? supplierName(product) : "Unassigned",
        type,
        typeLabel: MOVEMENT_LABELS[type],
        quantity: Number(movement.qty),
        unit: movement.unit,
        netChange: stockMovementDelta(type, Number(movement.qty)),
        reason: movement.reason ?? "—",
        createdAt: movement.created_at,
      } satisfies InventoryReportMovementRow;
    });

  const movementSummary = MOVEMENT_TYPES.map((type) => {
    const rows = movementRows.filter((row) => row.type === type);
    return {
      type,
      label: MOVEMENT_LABELS[type],
      events: rows.length,
      quantity: totalsByUnit(rows.map((row) => ({ value: row.quantity, unit: row.unit }))),
      netChange: totalsByUnit(rows.map((row) => ({ value: row.netChange, unit: row.unit }))),
    } satisfies InventoryReportMovementSummary;
  });

  const yieldRows = movementRows.filter((row) => row.type === "yield_in");
  const wasteRows = movementRows.filter((row) => row.type === "waste");
  const sourceRows = movementRows.filter((row) => row.type === "yield_out");
  const totalYield = totalsByUnit(yieldRows.map((row) => ({ value: row.quantity, unit: row.unit })));
  const waste = totalsByUnit(wasteRows.map((row) => ({ value: row.quantity, unit: row.unit })));

  const varianceRows = counts
    .filter((count) => {
      const item = count.inventory_item_id ? inventoryItemById.get(count.inventory_item_id) : undefined;
      const product = count.product_id ? productById.get(count.product_id) : undefined;
      return item
        ? inventoryItemMatches(item, effectiveFilters, productById)
        : Boolean(product && productMatchesFilters(product));
    })
    .map((count) => {
      const item = count.inventory_item_id ? inventoryItemById.get(count.inventory_item_id) : undefined;
      const product = count.product_id ? productById.get(count.product_id) : undefined;
      const branch = branchById.get(count.store_id);
      const variance = Number(count.variance_qty);
      return {
        id: count.id,
        branchId: count.store_id,
        branchName: branch?.name ?? "Unknown branch",
        productId: count.inventory_item_id ?? count.product_id ?? "",
        inventoryItemId: count.inventory_item_id,
        productName: item?.name ?? product?.name ?? "Unknown inventory item",
        categoryName: product ? categoryName(product) : "Uncategorized",
        supplierName: item?.supplier_id ? supplierById.get(item.supplier_id)?.name ?? "Unassigned" : product ? supplierName(product) : "Unassigned",
        countDate: count.count_date,
        expected: Number(count.expected_qty),
        counted: Number(count.counted_qty),
        variance,
        unit: count.unit,
        status: Math.abs(variance) < 0.0005 ? "balanced" : variance < 0 ? "short" : "over",
        updatedAt: count.updated_at,
      } satisfies InventoryReportVarianceRow;
    })
    .sort((a, b) => b.countDate.localeCompare(a.countDate) || a.productName.localeCompare(b.productName));

  const lowStock = inventoryRows.filter((row) => row.status === "low").length;
  const outOfStock = inventoryRows.filter((row) => row.status === "out").length;
  const shortLines = varianceRows.filter((row) => row.status === "short").length;
  const overLines = varianceRows.filter((row) => row.status === "over").length;
  const balancedLines = varianceRows.filter((row) => row.status === "balanced").length;

  return {
    filters: effectiveFilters,
    branchFilterLocked: profile.role !== "admin" || Boolean(workspaceBranchId),
    branches,
    categories,
    suppliers,
    products,
    inventoryRows,
    movementRows,
    movementSummary,
    varianceRows,
    yieldSummary: {
      entryCount: yieldRows.length,
      sourceUsage: totalsByUnit(sourceRows.map((row) => ({ value: row.quantity, unit: row.unit }))),
      totalYield,
      waste,
      usableYield: subtractTotals(totalYield, waste),
    },
    summary: {
      trackedProducts: inventoryRows.length,
      lowStock,
      outOfStock,
      inventoryValue: inventoryRows.reduce((total, row) => total + row.inventoryValue, 0),
      movementCount: movementRows.length,
      varianceLines: varianceRows.length,
      shortLines,
      overLines,
      balancedLines,
    },
    queryWarning: Boolean(branchesResult.error || categoriesResult.error || suppliersResult.error || productsResult.error || movementsResult.error || countsResult.error),
    stockWarning,
  };
}
