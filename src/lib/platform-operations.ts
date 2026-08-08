import { formatPeso } from "@/lib/money";

export type BillingIntervalUnit = "month" | "year";
export type PlatformPolicyKey = "billing" | "support";
export type PlatformPolicyStatus = "draft" | "published";

export type BillingVariant = {
  id: string | null;
  label: string;
  intervalUnit: BillingIntervalUnit;
  intervalCount: number;
  discountPercent: number;
  paymongoPlanId: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type BillingCatalog = {
  currency: "PHP";
  monthlyPriceCentavos: number;
  variants: BillingVariant[];
  schemaAvailable: boolean;
};

export type PlatformPolicy = {
  key: PlatformPolicyKey;
  status: PlatformPolicyStatus;
  version: number;
  summary: string;
  settings: Record<string, string | number>;
  publishedAt: string | null;
  updatedAt: string | null;
};

export type PlatformPolicies = {
  billing: PlatformPolicy;
  support: PlatformPolicy;
  schemaAvailable: boolean;
};

export const DEFAULT_MONTHLY_PRICE_CENTAVOS = 79_900;

export const DEFAULT_BILLING_VARIANTS: BillingVariant[] = [
  {
    id: null,
    label: "Monthly",
    intervalUnit: "month",
    intervalCount: 1,
    discountPercent: 0,
    paymongoPlanId: null,
    isActive: true,
    sortOrder: 0,
  },
  {
    id: null,
    label: "1 year",
    intervalUnit: "year",
    intervalCount: 1,
    discountPercent: 10,
    paymongoPlanId: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: null,
    label: "2 years",
    intervalUnit: "year",
    intervalCount: 2,
    discountPercent: 15,
    paymongoPlanId: null,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: null,
    label: "3 years",
    intervalUnit: "year",
    intervalCount: 3,
    discountPercent: 20,
    paymongoPlanId: null,
    isActive: true,
    sortOrder: 3,
  },
];

export const DEFAULT_PLATFORM_POLICIES: Record<PlatformPolicyKey, PlatformPolicy> = {
  billing: {
    key: "billing",
    status: "draft",
    version: 1,
    summary: "Define how trials, renewals, refunds, and price changes work before checkout is enabled.",
    settings: {
      trialDays: 14,
      paymentGraceDays: 7,
      refundWindowDays: 7,
      priceChangeNoticeDays: 30,
      annualRenewal: "auto_renew",
    },
    publishedAt: null,
    updatedAt: null,
  },
  support: {
    key: "support",
    status: "draft",
    version: 1,
    summary: "Define response times, coverage, escalation, and the account-recovery path before support actions are enabled.",
    settings: {
      firstResponseHours: 24,
      supportHours: "Monday to Friday, 9:00 AM to 5:00 PM PHT",
      supportEmail: "",
      escalationPath: "",
    },
    publishedAt: null,
    updatedAt: null,
  },
};

export function calculateBillingVariantPrice(
  monthlyPriceCentavos: number,
  intervalUnit: BillingIntervalUnit,
  intervalCount: number,
  discountPercent: number,
) {
  const months = intervalUnit === "year" ? intervalCount * 12 : intervalCount;
  const discountMultiplier = Math.max(0, 1 - discountPercent / 100);
  return Math.round(monthlyPriceCentavos * months * discountMultiplier);
}

export function billingVariantPriceLabel(catalog: Pick<BillingCatalog, "monthlyPriceCentavos">, variant: Pick<BillingVariant, "intervalUnit" | "intervalCount" | "discountPercent">) {
  return formatPeso(calculateBillingVariantPrice(catalog.monthlyPriceCentavos, variant.intervalUnit, variant.intervalCount, variant.discountPercent));
}

export function formatMonthlyPriceInput(monthlyPriceCentavos: number) {
  return (monthlyPriceCentavos / 100).toFixed(2);
}

export function parsePhpToCentavos(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const pesos = Number(match[1]);
  const centavos = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const result = pesos * 100 + centavos;
  return Number.isSafeInteger(result) ? result : null;
}

export function normalizeDiscount(value: unknown) {
  const discount = Number(value);
  if (!Number.isFinite(discount)) return null;
  if (discount < 0 || discount > 100) return null;
  return Math.round(discount * 100) / 100;
}

export function isPolicyGateOpen(policies: Pick<PlatformPolicies, "billing" | "support">) {
  return policies.billing.status === "published" && policies.support.status === "published";
}

export function policyStatusLabel(status: PlatformPolicyStatus) {
  return status === "published" ? "Published" : "Draft";
}

export function policyStatusTone(status: PlatformPolicyStatus) {
  return status === "published" ? "bg-success/10 text-success" : "bg-warning/15 text-ink";
}

export function readPolicyNumber(policy: PlatformPolicy, key: string, fallback: number) {
  const value = Number(policy.settings[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function readPolicyText(policy: PlatformPolicy, key: string, fallback = "") {
  const value = policy.settings[key];
  return typeof value === "string" ? value : fallback;
}
