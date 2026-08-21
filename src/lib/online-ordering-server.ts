import { createAdminClient } from "@/lib/employee-auth";
import {
  buildPublicMenuProduct,
  normalizePublicMenuSlug,
  readOnlineOrderingBrandDefaults,
  readOnlineOrderingSettings,
  resolveOnlineOrderingBranding,
  type PublicMenuStore,
} from "@/lib/online-ordering";
import { getCatalogPreset } from "@/lib/catalog-presets";
import { stockMovementDelta } from "@/lib/inventory";
import { isValidPublicMenuSubdomain, normalizePublicMenuSubdomain, publicMenuSubdomainFromHostname } from "@/lib/public-menu-domain";

type StoreRecord = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  settings: unknown;
  vat_registered: boolean;
  vat_rate: number;
  staff_login_slug: string;
  public_menu_subdomain: string | null;
};

const DEMO_STORE_SLUG = "demo";

function demoMenu(): PublicMenuStore {
  const preset = getCatalogPreset("cafe");
  const categories = (preset?.categories ?? []).map((category, index) => ({ id: `demo-category-${index}`, name: category.name, isAvailable: true }));
  const categoryIds = new Map(categories.map((category) => [category.name, category.id]));
  const products = (preset?.products ?? []).map((product) => buildPublicMenuProduct({
    id: `demo-${product.id}`,
    name: product.name,
    price: product.price * 100,
    pricing_mode: product.pricingMode,
    unit: product.unit,
    category_id: categoryIds.get(product.category) ?? null,
    image_url: product.imageUrl,
  }, new Map(categories.map((category) => [category.id, category.name]))));

  const settings = readOnlineOrderingSettings({ online_ordering: {
    enabled: true,
    delivery: {
      enabled: true,
      fee_centavos: 500,
      eta_minutes: 45,
      note: "Delivery is available within our service area. We’ll confirm the address and total by phone.",
    },
  } });
  return {
    id: "demo-store",
    name: "Morning Ritual Cafe",
    address: "18 Rizal Avenue · 7:00 AM–8:00 PM",
    slug: DEMO_STORE_SLUG,
    publicMenuSubdomain: null,
    vatRegistered: true,
    vatRate: 0.12,
    settings: {
      ...settings,
      branding: resolveOnlineOrderingBranding(settings.branding, {
        brandName: "Morning Ritual Cafe",
        brandTagline: "Order ahead · pickup at the counter",
      }),
    },
    categories,
    products,
  };
}

const ONLINE_RESERVATION_STATUSES = ["new", "confirmed", "preparing", "ready"] as const;

async function readOnlineStockAvailability(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  orgId: string,
  storeId: string,
  products: Array<{ id: string; track_stock?: boolean }>,
) {
  const trackedIds = new Set(products.filter((product) => product.track_stock).map((product) => product.id));
  const stock = new Map<string, number>();
  const reserved = new Map<string, number>();
  if (trackedIds.size === 0) return { stock, reserved };

  const stockResult = await admin.rpc("current_stock", { p_org_id: orgId });
  if (!stockResult.error && Array.isArray(stockResult.data)) {
    for (const row of stockResult.data as Array<{ store_id?: string; product_id?: string; qty?: number | string }>) {
      if (row.store_id !== storeId || !row.product_id || !trackedIds.has(row.product_id)) continue;
      const quantity = Number(row.qty);
      if (Number.isFinite(quantity)) stock.set(row.product_id, quantity);
    }
  } else {
    const movementsResult = await admin
      .from("stock_movements")
      .select("product_id, type, qty")
      .eq("store_id", storeId)
      .in("product_id", [...trackedIds]);
    for (const row of (movementsResult.data ?? []) as Array<{ product_id: string; type: string; qty: number | string }>) {
      stock.set(row.product_id, (stock.get(row.product_id) ?? 0) + stockMovementDelta(row.type, Number(row.qty)));
    }
  }

  const activeOrdersResult = await admin
    .from("online_orders")
    .select("id")
    .eq("store_id", storeId)
    .in("status", [...ONLINE_RESERVATION_STATUSES]);
  const activeOrderIds = (activeOrdersResult.data ?? []).map((row) => String((row as { id: string }).id));
  if (activeOrderIds.length === 0) return { stock, reserved };

  const itemsResult = await admin
    .from("online_order_items")
    .select("product_id, qty")
    .in("order_id", activeOrderIds)
    .in("product_id", [...trackedIds]);
  for (const row of (itemsResult.data ?? []) as Array<{ product_id: string | null; qty: number | string }>) {
    if (!row.product_id) continue;
    reserved.set(row.product_id, (reserved.get(row.product_id) ?? 0) + Number(row.qty));
  }
  return { stock, reserved };
}

export async function getPublicStoreBySlug(slug: string) {
  const normalizedSlug = normalizePublicMenuSlug(slug);
  const admin = createAdminClient();
  if (!admin) return normalizedSlug === DEMO_STORE_SLUG ? { id: "demo-store", orgId: "demo-org", name: "Morning Ritual Cafe", slug: DEMO_STORE_SLUG } : null;

  const result = await admin
    .from("stores")
    .select("id, org_id, name, is_active, staff_login_slug")
    .eq("staff_login_slug", normalizedSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (result.error || !result.data) return normalizedSlug === DEMO_STORE_SLUG ? { id: "demo-store", orgId: "demo-org", name: "Morning Ritual Cafe", slug: DEMO_STORE_SLUG } : null;
  return {
    id: String(result.data.id),
    orgId: String(result.data.org_id),
    name: String(result.data.name),
    slug: String(result.data.staff_login_slug),
  };
}

export async function getPublicStoreBySubdomain(subdomain: string) {
  const normalizedSubdomain = normalizePublicMenuSubdomain(subdomain);
  if (!isValidPublicMenuSubdomain(normalizedSubdomain)) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const result = await admin
    .from("stores")
    .select("id, org_id, name, is_active, staff_login_slug, public_menu_subdomain")
    .eq("public_menu_subdomain", normalizedSubdomain)
    .eq("is_active", true)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return {
    id: String(result.data.id),
    orgId: String(result.data.org_id),
    name: String(result.data.name),
    slug: String(result.data.staff_login_slug),
  };
}

async function getPublicMenuStoreByLookup(
  column: "staff_login_slug" | "public_menu_subdomain",
  value: string,
  demoFallback: boolean,
): Promise<PublicMenuStore | null> {
  const admin = createAdminClient();
  if (!admin) return demoFallback ? demoMenu() : null;

  const storeResult = await admin
    .from("stores")
    .select("id, org_id, name, address, settings, vat_registered, vat_rate, staff_login_slug, public_menu_subdomain, is_active")
    .eq(column, value)
    .eq("is_active", true)
    .maybeSingle();

  if (storeResult.error || !storeResult.data) return demoFallback ? demoMenu() : null;

  const store = storeResult.data as StoreRecord;
  const [categoriesResult, productsResult, organizationResult] = await Promise.all([
    admin.from("categories").select("id, name, sort_order, online_available").eq("store_id", store.id).eq("is_active", true).order("sort_order").order("name"),
    admin.from("products").select("id, name, price, pricing_mode, unit, category_id, image_url, track_stock, online_available, sort_order").eq("store_id", store.id).eq("is_active", true).order("sort_order").order("name"),
    admin.from("organizations").select("settings").eq("id", store.org_id).maybeSingle(),
  ]);

  if (categoriesResult.error || productsResult.error) return null;

  const categories = (categoriesResult.data ?? []).map((category) => ({ id: String(category.id), name: String(category.name), isAvailable: category.online_available !== false }));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const categoryAvailability = new Map((categoriesResult.data ?? []).map((category) => [String(category.id), category.online_available !== false]));
  const availability = await readOnlineStockAvailability(admin, store.org_id, store.id, (productsResult.data ?? []) as Array<{ id: string; track_stock?: boolean }>);
  const products = (productsResult.data ?? []).map((product) => buildPublicMenuProduct(product as {
    id: string;
    name: string;
    price: number;
    pricing_mode: "fixed" | "per_kg";
    unit: string;
    category_id: string | null;
    image_url?: string | null;
    track_stock?: boolean;
    online_available?: boolean;
    category_available?: boolean;
    available_qty?: number | null;
  }, categoryNames));

  for (const [index, product] of products.entries()) {
    const source = productsResult.data?.[index];
    if (!source) continue;
    const categoryAvailable = source.category_id ? categoryAvailability.get(String(source.category_id)) === true : true;
    const availableQty = source.track_stock === true
      ? (availability.stock.has(String(source.id)) ? (availability.stock.get(String(source.id)) ?? 0) - (availability.reserved.get(String(source.id)) ?? 0) : 0)
      : null;
    const stockAvailable = source.track_stock !== true || (availableQty !== null && availableQty > 0);
    product.isAvailable = source.online_available !== false && categoryAvailable && stockAvailable;
    // Avoid exposing full inventory counts publicly; only low-stock quantities
    // are useful to customers, while placement remains server-authoritative.
    product.availableQty = availableQty !== null && availableQty <= 5 ? Math.max(0, Math.floor(availableQty)) : null;
    product.availabilityReason = source.online_available === false
      ? "product_paused"
      : !categoryAvailable
        ? "category_paused"
        : !stockAvailable
          ? "sold_out"
          : "available";
  }

  const settings = readOnlineOrderingSettings(store.settings);
  const brandDefaults = readOnlineOrderingBrandDefaults(organizationResult.data?.settings, store.name);

  return {
    id: store.id,
    name: store.name,
    address: store.address,
    slug: store.staff_login_slug,
    publicMenuSubdomain: store.public_menu_subdomain,
    vatRegistered: Boolean(store.vat_registered),
    vatRate: Number(store.vat_rate) || 0,
    settings: {
      ...settings,
      branding: resolveOnlineOrderingBranding(settings.branding, brandDefaults),
    },
    categories,
    products,
  };
}

export async function getPublicMenuStoreBySlug(slug: string): Promise<PublicMenuStore | null> {
  const normalizedSlug = normalizePublicMenuSlug(slug);
  return getPublicMenuStoreByLookup("staff_login_slug", normalizedSlug, normalizedSlug === DEMO_STORE_SLUG);
}

export async function getPublicMenuStoreBySubdomain(subdomain: string): Promise<PublicMenuStore | null> {
  const normalizedSubdomain = normalizePublicMenuSubdomain(subdomain);
  if (!isValidPublicMenuSubdomain(normalizedSubdomain)) return null;
  return getPublicMenuStoreByLookup("public_menu_subdomain", normalizedSubdomain, false);
}

/**
 * Custom-host requests must resolve the hostname and the submitted slug to
 * the same branch. Legacy `/menu/{slug}` links continue to resolve by slug
 * when the request is made on the main domain.
 */
export async function getPublicMenuStoreForHostname(slug: string, hostname: string | null | undefined) {
  const subdomain = publicMenuSubdomainFromHostname(hostname);
  if (!subdomain) return getPublicMenuStoreBySlug(slug);

  const menu = await getPublicMenuStoreBySubdomain(subdomain);
  return menu && menu.slug === normalizePublicMenuSlug(slug) ? menu : null;
}

export async function getPublicStoreForRequest(request: Request, slug: string) {
  let hostname = "";
  try {
    hostname = new URL(request.url).hostname;
  } catch {
    return null;
  }

  const subdomain = publicMenuSubdomainFromHostname(hostname);
  if (!subdomain) return getPublicStoreBySlug(slug);

  const store = await getPublicStoreBySubdomain(subdomain);
  return store && store.slug === normalizePublicMenuSlug(slug) ? store : null;
}
