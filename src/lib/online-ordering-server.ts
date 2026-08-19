import { createAdminClient } from "@/lib/employee-auth";
import {
  buildPublicMenuProduct,
  normalizePublicMenuSlug,
  readOnlineOrderingSettings,
  type PublicMenuStore,
} from "@/lib/online-ordering";
import { getCatalogPreset } from "@/lib/catalog-presets";

type StoreRecord = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  settings: unknown;
  staff_login_slug: string;
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

  return {
    id: "demo-store",
    name: "Morning Ritual Cafe",
    address: "18 Rizal Avenue · 7:00 AM–8:00 PM",
    slug: DEMO_STORE_SLUG,
    settings: readOnlineOrderingSettings({ online_ordering: { enabled: true } }),
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

export async function getPublicMenuStoreBySlug(slug: string): Promise<PublicMenuStore | null> {
  const normalizedSlug = normalizePublicMenuSlug(slug);
  const admin = createAdminClient();
  if (!admin) return normalizedSlug === DEMO_STORE_SLUG ? demoMenu() : null;

  const storeResult = await admin
    .from("stores")
    .select("id, org_id, name, address, settings, staff_login_slug, is_active")
    .eq("staff_login_slug", normalizedSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (storeResult.error || !storeResult.data) return normalizedSlug === DEMO_STORE_SLUG ? demoMenu() : null;

  const store = storeResult.data as StoreRecord;
  const [categoriesResult, productsResult] = await Promise.all([
    admin.from("categories").select("id, name, sort_order").eq("store_id", store.id).eq("is_active", true).order("sort_order").order("name"),
    admin.from("products").select("id, name, price, pricing_mode, unit, category_id, image_url, sort_order").eq("store_id", store.id).eq("is_active", true).order("sort_order").order("name"),
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

  return {
    id: store.id,
    name: store.name,
    address: store.address,
    slug: store.staff_login_slug,
    settings: readOnlineOrderingSettings(store.settings),
    categories,
    products,
  };
}
