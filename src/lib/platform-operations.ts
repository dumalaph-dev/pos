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

export type PayMongoReadinessSignals = {
  secretKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  keyModeConsistent: boolean;
  webhookSecretConfigured: boolean;
  subscriptionsEnabled: boolean;
  subscriptionApiAvailable: boolean | null;
  subscriptionPaymentMethods: string[] | null;
};

export type CheckoutReadinessItem = {
  id: "plans" | "billing-policy" | "support-policy" | "secret-key" | "public-key" | "key-mode" | "webhook-secret" | "subscriptions" | "subscription-payment-methods";
  label: string;
  ready: boolean;
  detail: string;
  action: string;
  href?: string;
  linkLabel?: string;
};

export type CheckoutReadiness = {
  ready: boolean;
  items: CheckoutReadinessItem[];
  remainingActions: CheckoutReadinessItem[];
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

export function billingVariantMonthlyEquivalent(
  catalog: Pick<BillingCatalog, "monthlyPriceCentavos">,
  variant: Pick<BillingVariant, "intervalUnit" | "intervalCount" | "discountPercent">,
) {
  const months = variant.intervalUnit === "year" ? variant.intervalCount * 12 : variant.intervalCount;
  return Math.round(calculateBillingVariantPrice(catalog.monthlyPriceCentavos, variant.intervalUnit, variant.intervalCount, variant.discountPercent) / Math.max(months, 1));
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

export function getCheckoutReadiness({
  catalog,
  policies,
  paymongo,
}: {
  catalog: BillingCatalog;
  policies: PlatformPolicies;
  paymongo: PayMongoReadinessSignals;
}): CheckoutReadiness {
  const activeOffers = catalog.variants.filter((variant) => variant.isActive && Boolean(variant.id)).length;
  const billingPolicyPublished = policies.schemaAvailable && policies.billing.status === "published";
  const supportPolicyPublished = policies.schemaAvailable && policies.support.status === "published";
  const keyPairConfigured = paymongo.secretKeyConfigured && paymongo.publicKeyConfigured;
  const subscriptionPaymentMethodsReady = hasSubscriptionPaymentMethod(paymongo.subscriptionPaymentMethods);
  const configuredPaymentMethods = paymongo.subscriptionPaymentMethods?.join(", ") || "none";

  const items: CheckoutReadinessItem[] = [
    {
      id: "plans",
      label: "Plans & pricing",
      ready: catalog.schemaAvailable && activeOffers > 0,
      detail: catalog.schemaAvailable
        ? (activeOffers > 0 ? `${activeOffers} active offer${activeOffers === 1 ? "" : "s"} ready for checkout` : "No active offers")
        : "Pricing catalog storage is unavailable",
      action: catalog.schemaAvailable
        ? "Activate at least one checkout offer in Plans & Pricing."
        : "Apply 0027_platform_operations.sql, then save an offer in Plans & Pricing.",
      href: "/platform/plans#pricing-settings",
      linkLabel: "Open Plans & Pricing",
    },
    {
      id: "billing-policy",
      label: "Billing policy",
      ready: billingPolicyPublished,
      detail: !policies.schemaAvailable ? "Policy storage is unavailable" : policies.billing.status === "published" ? "Published" : "Draft",
      action: !policies.schemaAvailable
        ? "Apply 0027_platform_operations.sql, then publish the billing policy in Policies."
        : "Publish the billing policy in Policies.",
      href: "/platform/policies#billing-policy",
      linkLabel: "Open billing policy",
    },
    {
      id: "support-policy",
      label: "Support policy",
      ready: supportPolicyPublished,
      detail: !policies.schemaAvailable ? "Policy storage is unavailable" : policies.support.status === "published" ? "Published" : "Draft",
      action: !policies.schemaAvailable
        ? "Apply 0027_platform_operations.sql, then publish the support policy in Policies."
        : "Publish the support policy in Policies.",
      href: "/platform/policies#support-policy",
      linkLabel: "Open support policy",
    },
    {
      id: "secret-key",
      label: "PayMongo server key",
      ready: paymongo.secretKeyConfigured,
      detail: paymongo.secretKeyConfigured ? "Configured on the server · value hidden" : "Missing from the server environment",
      action: "Add PAYMONGO_SECRET_KEY to the server environment; keep its value out of the console.",
    },
    {
      id: "public-key",
      label: "PayMongo public key",
      ready: paymongo.publicKeyConfigured,
      detail: paymongo.publicKeyConfigured ? "Configured for tokenization · value not shown" : "Missing from the client environment",
      action: "Add NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY to the client environment; keep the key value out of the console.",
    },
    {
      id: "key-mode",
      label: "PayMongo key mode",
      ready: paymongo.keyModeConsistent,
      detail: paymongo.keyModeConsistent ? "Public and server keys use the same mode" : keyPairConfigured ? "Key prefixes or modes are invalid" : "Waiting for both keys",
     action: keyPairConfigured
        ? "Use pk_test_/pk_live_ for the public key and sk_test_/sk_live_ for the server key, with both in the same mode."
        : "Configure both PayMongo keys, then use pk_ for public and sk_ for server in the same test or live mode.",
    },
    {
      id: "webhook-secret",
      label: "PayMongo webhook signing",
      ready: paymongo.webhookSecretConfigured,
      detail: paymongo.webhookSecretConfigured ? "Signing secret configured · value hidden" : "Signing secret is missing",
      action: "Add PAYMONGO_WEBHOOK_SECRET to the server environment and configure signed webhook delivery.",
    },
    {
      id: "subscriptions",
      label: "PayMongo subscriptions",
      ready: paymongo.subscriptionsEnabled && paymongo.subscriptionApiAvailable === true,
      detail: !paymongo.subscriptionsEnabled
        ? "Local activation flag is off"
        : paymongo.subscriptionApiAvailable === true
          ? "PayMongo Subscriptions API is available"
          : paymongo.subscriptionApiAvailable === false
            ? "PayMongo rejected Subscriptions access for this organization"
            : "PayMongo Subscriptions access has not been verified",
      action: !paymongo.subscriptionsEnabled
        ? "Request recurring-billing activation from PayMongo, then set PAYMONGO_SUBSCRIPTIONS_ENABLED=true."
        : paymongo.subscriptionApiAvailable === false
          ? "Request PayMongo Subscriptions access for this organization, then rerun the checkout preflight."
          : "Run the PayMongo checkout preflight and confirm that the Subscriptions API is available before enabling checkout.",
    },
    {
      id: "subscription-payment-methods",
      label: "Subscription payment method",
      ready: subscriptionPaymentMethodsReady,
      detail: paymongo.subscriptionPaymentMethods === null
        ? "PayMongo payment-method capabilities could not be verified"
        : subscriptionPaymentMethodsReady
          ? `Configured: ${configuredPaymentMethods}`
          : `Configured: ${configuredPaymentMethods}; card or Maya is required for subscriptions`,
      action: paymongo.subscriptionPaymentMethods === null
        ? "Verify the PayMongo server key and run the checkout preflight to read the organization capabilities."
        : "Enable Visa/Mastercard cards or Maya for this PayMongo organization, then request Subscriptions activation for that payment method.",
    },
  ];

  const remainingActions = items.filter((item) => !item.ready);
  return { ready: remainingActions.length === 0, items, remainingActions };
}

export function hasSubscriptionPaymentMethod(methods: string[] | null) {
  return Boolean(methods?.some((method) => ["card", "cards", "maya"].includes(method.toLowerCase())));
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
