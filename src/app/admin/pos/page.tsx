import { redirect } from "next/navigation";
import { getAdminProfile } from "@/lib/admin/profile";
import { readAdminBranding } from "@/lib/admin/branding";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { POS_PALETTE_IDS } from "@/lib/pos-palette";
import { POS_THEME_IDS } from "@/lib/pos-theme";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";
import { readBusinessPresetId } from "@/lib/admin/business";
import { isProductImageUrl } from "@/lib/product-images";
import { normalizePaperWidth, toPaperWidthValue } from "@/lib/paper-width";
import { normalizeDisplayPairingToken } from "@/lib/display";
import { normalizeDisplayPromotionRecord, normalizeDisplaySettings, type DisplayPromotionRecord } from "@/lib/display-config";
import PosSettingsScreen, {
  type AdminPosCategory,
  type AdminPosDevice,
  type AdminPosProduct,
  type PosConfig,
} from "@/components/admin/PosSettingsScreen";

type JsonRecord = Record<string, unknown>;
type AdminRole = "admin" | "manager" | "cashier";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: { name?: string; settings?: unknown } | null;
  stores: { name?: string } | null;
};

type StoreRecord = {
  id: string;
  name: string;
  address: string | null;
  tin: string | null;
  vat_registered: boolean;
  vat_rate: number;
  settings: JsonRecord;
};

const DEFAULT_ORGANIZATION_NAME = "Your Business";
const DEFAULT_STORE_NAME = "Main Branch";

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortName(value: string | null, fallback: string) {
  return value?.trim().split(/\s+/)[0] || fallback;
}

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max ? numberValue : fallback;
}

function readEnum<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]) {
  return typeof value === "string" && values.includes(value) ? value as T[number] : fallback;
}

function readTab(value: unknown) {
  return value === "receipts" || value === "hardware" || value === "settings" || value === "payments" || value === "display" ? value : "preview";
}

function readPosConfig(store: StoreRecord): PosConfig {
  const source = isRecord(store.settings?.pos_config) ? store.settings.pos_config : {};
  const paymentSource = isRecord(source.paymentMethods) ? source.paymentMethods : {};
  const orderTypes = Array.isArray(source.orderTypes)
    ? source.orderTypes.filter((item): item is string => typeof item === "string" && ["Dine In", "Takeout", "Delivery"].includes(item)).slice(0, 3)
    : [];
  const enabledOrderTypes = orderTypes.length ? orderTypes : ["Dine In", "Takeout"];
  const configuredDefault = readEnum(source.defaultOrderType, ["Dine In", "Takeout", "Delivery"] as const, "Dine In");

  return {
    palette: readEnum(source.palette, POS_PALETTE_IDS, "green"),
    customColor: typeof source.customColor === "string" && /^#[0-9a-f]{6}$/i.test(source.customColor) ? source.customColor : "#173a2b",
    uiStyle: readEnum(source.uiStyle, POS_THEME_IDS, "modern"),
    defaultOrderType: enabledOrderTypes.includes(configuredDefault) ? configuredDefault : enabledOrderTypes[0],
    orderTypes: enabledOrderTypes,
    paymentMethods: {
      cash: readBoolean(paymentSource.cash, true),
      card: readBoolean(paymentSource.card, true),
      gcash: readBoolean(paymentSource.gcash, true),
      maya: readBoolean(paymentSource.maya, false),
      more: readBoolean(paymentSource.more, true),
    },
    vatRate: readNumber(source.vatRate, Number(store.vat_rate) || 0.12, 0, 1),
    showVat: readBoolean(source.showVat, store.vat_registered),
    showStockStatus: readBoolean(source.showStockStatus, false),
    enableOrderNotes: readBoolean(source.enableOrderNotes, true),
    receiptHeader: readText(source.receiptHeader) || readText(store.settings?.receipt_header),
    receiptFooter: readText(source.receiptFooter) || readText(store.settings?.receipt_footer),
    showCashier: readBoolean(source.showCashier, true),
    paperWidth: toPaperWidthValue(normalizePaperWidth(source.paperWidth ?? store.settings?.paper_width)),
  };
}

function catalogImage(name: string, imageUrl: string | null) {
  if (isProductImageUrl(imageUrl)) return imageUrl;
  const normalized = name.trim().toLowerCase();
  const imageMap: Record<string, string> = {
    "whole lechon": "/food/whole-lechon-medium.png",
    "whole lechon (small)": "/food/whole-lechon-small.png",
    "whole lechon (medium)": "/food/whole-lechon-medium.png",
    "lechon per kilo": "/food/whole-lechon-small.png",
    "lechon regular": "/food/whole-lechon-small.png",
    "lechon belly": "/food/lechon-belly-one.png",
    "lechon belly (1/2kg)": "/food/lechon-belly-half.png",
    "lechon belly (1kg)": "/food/lechon-belly-one.png",
    "lechon paksiw": "/food/lechon-paksiw.png",
    "lechon kawali": "/food/lechon-kawali.png",
    rice: "/food/java-rice.png",
    "java rice": "/food/java-rice.png",
    "mang tomas": "/food/mang-tomas.png",
    "mang tomas (small)": "/food/mang-tomas.png",
  };
  return imageMap[normalized] ?? null;
}

export default async function AdminPosPage({ searchParams }: { searchParams: Promise<{ store?: string | string[]; tab?: string | string[]; error?: string | string[]; saved?: string | string[] }> }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <PosProfileMissing />;
  const params = await searchParams;
  const requestedStoreId = readParam(params.store);
  const initialTab = readTab(readParam(params.tab));
  const errorMessage = readParam(params.error);
  const saved = readParam(params.saved);

  const supabase = await createClient();
  const [organizationResult, storesResult] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", profile.org_id).maybeSingle(),
    supabase.from("stores").select("id, name, address, tin, vat_registered, vat_rate, settings").eq("org_id", profile.org_id).eq("is_active", true).order("name"),
  ]);

  const stores = (storesResult.data ?? []) as StoreRecord[];
  const branchOptions = stores.map((candidate) => ({ id: candidate.id, name: candidate.name }));
  const selectedBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(stores.map((store) => ({ id: store.id, name: store.name, is_active: true })) as AdminBranchOption[], profile.store_id)
    : profile.store_id;
  const requestedStore = stores.find((candidate) => candidate.id === requestedStoreId);
  const editingStoreId = selectedBranchId ?? requestedStore?.id ?? (profile.store_id && stores.some((candidate) => candidate.id === profile.store_id) ? profile.store_id : stores[0]?.id) ?? "";
  const store = stores.find((candidate) => candidate.id === editingStoreId) ?? null;
  const storeId = store?.id ?? "";
  const deviceScopeId = selectedBranchId ?? (requestedStore ? requestedStore.id : null);

  let devicesQuery = supabase.from("devices").select("id, store_id, name, device_prefix, printer_transport, printer_config, paired_display_id, is_active, last_seen_at").eq("org_id", profile.org_id).order("name");
  if (deviceScopeId) devicesQuery = devicesQuery.eq("store_id", deviceScopeId);
  const [categoriesResult, productsResult, devicesResult, displayPromotionsResult] = storeId
    ? await Promise.all([
        supabase.from("categories").select("id, name, icon").eq("store_id", storeId).eq("is_active", true).order("sort_order"),
        supabase.from("products").select("id, name, pricing_mode, price, unit, category_id, image_url, track_stock, min_stock").eq("store_id", storeId).eq("is_active", true).order("sort_order"),
        devicesQuery,
        supabase.from("display_promotions").select("id, store_id, eyebrow, title, detail, tagline, image_url, is_active, sort_order, starts_at, ends_at").eq("store_id", storeId).order("sort_order").order("created_at"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, await devicesQuery, { data: [], error: null }];

  const stockResult = storeId
    ? await supabase.rpc("current_stock", { p_org_id: profile.org_id })
    : { data: [], error: null };
  const stockByProductId = new Map<string, number>();
  for (const row of (stockResult.data ?? []) as Array<{ store_id: string; product_id: string; qty: number | string }>) {
    if (row.store_id === storeId) stockByProductId.set(row.product_id, Number(row.qty));
  }

  const categories = (categoriesResult.data ?? []) as AdminPosCategory[];
  const products = (productsResult.data ?? []).map((product) => ({
    ...(product as AdminPosProduct),
    price: Number(product.price),
    image_url: catalogImage(product.name, product.image_url),
    min_stock: product.min_stock == null ? null : Number(product.min_stock),
    stock_quantity: stockByProductId.get(product.id) ?? null,
  })) as AdminPosProduct[];
  const devices = (devicesResult.data ?? []) as AdminPosDevice[];
  const displayPairingToken = normalizeDisplayPairingToken(
    devices.find((device) => device.store_id === storeId && device.is_active)?.paired_display_id ??
      devices.find((device) => device.store_id === storeId)?.paired_display_id,
  );
  const displayPromotions = (displayPromotionsResult.data ?? [])
    .map(normalizeDisplayPromotionRecord)
    .filter((promotion): promotion is DisplayPromotionRecord => Boolean(promotion));
  const queryWarning = Boolean(!store || organizationResult.error || storesResult.error || categoriesResult.error || productsResult.error || devicesResult.error || stockResult.error);
  const organizationName = organizationResult.data?.name || profile.organizations?.name || DEFAULT_ORGANIZATION_NAME;
  const logoUrl = readAdminBranding(profile.organizations?.settings).logoUrl;
  const branchName = store?.name || profile.stores?.name || DEFAULT_STORE_NAME;
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const savedMessage = saved === "settings" ? "POS settings saved." : saved === "branch" ? "Receipt and tax details saved." : saved === "device" ? "Terminal settings saved." : saved === "display" ? "Customer display settings saved." : "";
  const deviceBranchOptions = selectedBranchId
    ? store ? [{ id: store.id, name: store.name }] : []
    : branchOptions;

  return (
    <PosSettingsScreen
      organizationName={organizationName}
      logoUrl={logoUrl}
      branchName={branchName}
      address={store?.address ?? ""}
      tin={store?.tin ?? ""}
      storeId={storeId}
      cashierName={firstName}
      canWrite={profile.role === "admin"}
      branchOptions={selectedBranchId ? [] : branchOptions}
      deviceBranchOptions={deviceBranchOptions}
      queryWarning={queryWarning}
      initialTab={initialTab}
      savedMessage={savedMessage}
      errorMessage={errorMessage}
      initialNow={new Date().toISOString()}
      products={products}
      categories={categories}
      devices={devices}
      displayPairingToken={displayPairingToken}
      displayPromotions={displayPromotions}
      displayPromotionsUnavailable={Boolean(displayPromotionsResult.error)}
      initialDisplaySettings={normalizeDisplaySettings(store?.settings?.customer_display)}
      initialSettings={store ? readPosConfig(store) : readPosConfig({ id: "", name: DEFAULT_STORE_NAME, address: null, tin: null, vat_registered: true, vat_rate: 0.12, settings: {} })}
      initialBusinessPresetId={readBusinessPresetId(profile.organizations?.settings)}
    />
  );
}

function PosProfileMissing() {
  return (
    <main className="pos-settings-empty-page">
      <div>
        <p className="pos-settings-eyebrow">Admin backoffice</p>
        <h1>Your admin profile is not ready.</h1>
        <p>Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
      </div>
    </main>
  );
}
