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
import { isValidPublicMenuSubdomain, normalizePublicMenuSubdomain, publicMenuSubdomainFromHostname } from "@/lib/public-menu-domain";

type StoreRecord = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  settings: unknown;
  staff_login_slug: string;
  public_menu_subdomain: string | null;
};

const DEMO_STORE_SLUG = "demo";

function demoMenu(): PublicMenuStore {
  const preset = getCatalogPreset("cafe");
  const categories = (preset?.categories ?? []).map((category, index) => ({ id: `demo-category-${index}`, name: category.name }));
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
    .select("id, org_id, name, address, settings, staff_login_slug, public_menu_subdomain, is_active")
    .eq(column, value)
    .eq("is_active", true)
    .maybeSingle();

  if (storeResult.error || !storeResult.data) return demoFallback ? demoMenu() : null;

  const store = storeResult.data as StoreRecord;
  const [categoriesResult, productsResult, organizationResult] = await Promise.all([
    admin.from("categories").select("id, name, sort_order").eq("store_id", store.id).eq("is_active", true).order("sort_order").order("name"),
    admin.from("products").select("id, name, price, pricing_mode, unit, category_id, image_url, sort_order").eq("store_id", store.id).eq("is_active", true).order("sort_order").order("name"),
    admin.from("organizations").select("settings").eq("id", store.org_id).maybeSingle(),
  ]);

  if (categoriesResult.error || productsResult.error) return null;

  const categories = (categoriesResult.data ?? []).map((category) => ({ id: String(category.id), name: String(category.name) }));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const products = (productsResult.data ?? []).map((product) => buildPublicMenuProduct(product as {
    id: string;
    name: string;
    price: number;
    pricing_mode: "fixed" | "per_kg";
    unit: string;
    category_id: string | null;
    image_url?: string | null;
  }, categoryNames));

  const settings = readOnlineOrderingSettings(store.settings);
  const brandDefaults = readOnlineOrderingBrandDefaults(organizationResult.data?.settings, store.name);

  return {
    id: store.id,
    name: store.name,
    address: store.address,
    slug: store.staff_login_slug,
    publicMenuSubdomain: store.public_menu_subdomain,
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
