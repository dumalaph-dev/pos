import { createAdminClient } from "@/lib/employee-auth";
import {
  DEFAULT_BILLING_VARIANTS,
  DEFAULT_MONTHLY_PRICE_CENTAVOS,
  DEFAULT_PLATFORM_POLICIES,
  type BillingCatalog,
  type BillingVariant,
  type PlatformPolicies,
  type PlatformPolicy,
  type PlatformPolicyKey,
} from "@/lib/platform-operations";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export async function readPlatformBillingCatalog(admin: PlatformAdminClient): Promise<BillingCatalog> {
  const [settingsResult, variantsResult] = await Promise.all([
    admin.from("platform_billing_settings").select("currency, monthly_price_centavos").eq("id", "default").maybeSingle(),
    admin.from("platform_billing_variants").select("id, label, billing_unit, interval_count, discount_percent, paymongo_plan_id, is_active, sort_order").order("sort_order", { ascending: true }),
  ]);

  const schemaAvailable = !settingsResult.error && !variantsResult.error;
  const monthlyPriceCentavos = readInteger(settingsResult.data?.monthly_price_centavos, DEFAULT_MONTHLY_PRICE_CENTAVOS);
  const rows = (variantsResult.data ?? []) as Array<{
    id: string;
    label: string;
    billing_unit: string;
    interval_count: number;
    discount_percent: number;
    paymongo_plan_id: string | null;
    is_active: boolean;
    sort_order: number;
  }>;

  const variants = rows
    .filter((row) => row.billing_unit === "month" || row.billing_unit === "year")
    .map<BillingVariant>((row) => ({
      id: row.id,
      label: row.label,
      intervalUnit: row.billing_unit as BillingVariant["intervalUnit"],
      intervalCount: readInteger(row.interval_count, 1),
      discountPercent: Number(row.discount_percent) || 0,
      paymongoPlanId: row.paymongo_plan_id,
      isActive: Boolean(row.is_active),
      sortOrder: readInteger(row.sort_order, 0),
    }));

  return {
    currency: "PHP",
    monthlyPriceCentavos,
    variants: variants.length > 0 ? variants : DEFAULT_BILLING_VARIANTS,
    schemaAvailable,
  };
}

export async function readPlatformPolicies(admin: PlatformAdminClient): Promise<PlatformPolicies> {
  const result = await admin
    .from("platform_policies")
    .select("policy_key, status, version, summary, settings, published_at, updated_at");

  if (result.error) {
    return { ...DEFAULT_PLATFORM_POLICIES, schemaAvailable: false };
  }

  const rows = (result.data ?? []) as Array<{
    policy_key: string;
    status: string;
    version: number;
    summary: string;
    settings: Record<string, string | number> | null;
    published_at: string | null;
    updated_at: string | null;
  }>;

  const byKey = new Map(rows.map((row) => [row.policy_key, row]));
  return {
    billing: normalizePolicy("billing", byKey.get("billing")),
    support: normalizePolicy("support", byKey.get("support")),
    schemaAvailable: true,
  };
}

export async function readPlatformOperations(admin: PlatformAdminClient) {
  const [catalog, policies] = await Promise.all([
    readPlatformBillingCatalog(admin),
    readPlatformPolicies(admin),
  ]);
  return { catalog, policies };
}

export async function supportCasesSchemaAvailable(admin: PlatformAdminClient) {
  const result = await admin.from("support_cases").select("id").limit(1);
  return !result.error;
}

export function payMongoConfiguration() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim() || "";
  const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY?.trim() || null;
  const secretMode = payMongoKeyMode(secretKey, "sk");
  const publicMode = payMongoKeyMode(publicKey, "pk");
  return {
    secretKeyConfigured: Boolean(secretKey),
    publicKeyConfigured: Boolean(publicKey),
    keyModeConsistent: Boolean(secretMode && publicMode && secretMode === publicMode),
    publicKey,
    webhookSecretConfigured: Boolean(process.env.PAYMONGO_WEBHOOK_SECRET?.trim()),
    subscriptionsEnabled: process.env.PAYMONGO_SUBSCRIPTIONS_ENABLED === "true",
    apiBaseUrl: process.env.PAYMONGO_API_BASE_URL?.trim() || "https://api.paymongo.com",
  };
}

export async function readPayMongoSubscriptionReadiness() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim() || "";
  const baseUrl = (process.env.PAYMONGO_API_BASE_URL?.trim() || "https://api.paymongo.com").replace(/\/+$/, "");
  if (!/^sk_(test|live)_/.test(secretKey)) {
    return { subscriptionsApiAvailable: null, subscriptionPaymentMethods: null };
  }

  const headers = {
    Accept: "application/json",
    Authorization: "Basic " + Buffer.from(secretKey + ":", "utf8").toString("base64"),
  };
  const [plans, capabilities] = await Promise.all([
    readPayMongoEndpoint(`${baseUrl}/v1/subscriptions/plans?limit=1`, headers),
    readPayMongoEndpoint(`${baseUrl}/v1/merchants/capabilities/payment_methods`, headers),
  ]);

  return {
    subscriptionsApiAvailable: plans === null ? null : plans.ok,
    subscriptionPaymentMethods: capabilities === null ? null : capabilities.ok ? readPaymentMethodIds(capabilities.payload) : null,
  };
}

function payMongoKeyMode(value: string | null, prefix: "pk" | "sk") {
  if (value?.startsWith(`${prefix}_test_`)) return "test";
  if (value?.startsWith(`${prefix}_live_`)) return "live";
  return null;
}

async function readPayMongoEndpoint(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
    const body = await response.text();
    let payload: unknown = null;
    if (body) {
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        payload = null;
      }
    }
    return { ok: response.ok, payload };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function readPaymentMethodIds(payload: unknown) {
  const values = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      if (!isRecord(value)) return null;
      if (typeof value.id === "string") return value.id;
      return isRecord(value.attributes) && typeof value.attributes.id === "string" ? value.attributes.id : null;
    })
    .filter((value): value is string => typeof value === "string");
}

function normalizePolicy(key: PlatformPolicyKey, row: {
  policy_key: string;
  status: string;
  version: number;
  summary: string;
  settings: Record<string, string | number> | null;
  published_at: string | null;
  updated_at: string | null;
} | undefined): PlatformPolicy {
  const fallback = DEFAULT_PLATFORM_POLICIES[key];
  if (!row) return fallback;
  return {
    key,
    status: row.status === "published" ? "published" : "draft",
    version: readInteger(row.version, 1),
    summary: row.summary || fallback.summary,
    settings: row.settings ?? fallback.settings,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function readInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
