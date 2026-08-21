export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "paused";

export const PREMIUM_PLAN_ID = "premium" as const;
export const PREMIUM_PRICE_PHP = 599;
export const PREMIUM_PRICE_LABEL = "₱599";

export type SubscriptionPlanId = typeof PREMIUM_PLAN_ID;

export type BillingPlan = {
  id: SubscriptionPlanId;
  name: string;
  summary: string;
  priceMonthlyPhp: number;
  priceLabel: string;
  features: string[];
};

export const PREMIUM_PLAN: BillingPlan = {
  id: PREMIUM_PLAN_ID,
  name: "Premium",
  summary: "The complete POS workspace for every branch and staff member.",
  priceMonthlyPhp: PREMIUM_PRICE_PHP,
  priceLabel: PREMIUM_PRICE_LABEL,
  features: [
    "Tablet POS and owner dashboard",
    "Branch-ready POS with staff and product management",
    "Offline-first selling with automatic sync",
    "Inventory, suppliers, expenses, and reports",
    "Shifts, cash counts, and audit history",
  ],
};

export const BILLING_PLANS: BillingPlan[] = [PREMIUM_PLAN];

export function normalizeSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
  if (value === "active" || value === "past_due" || value === "canceled" || value === "incomplete" || value === "paused") return value;
  return "trialing";
}

/**
 * Historical plan rows are intentionally treated as Premium at read time so a
 * rolling deploy stays consistent while the database migration backfills
 * existing organizations.
 */
export function normalizeSubscriptionPlan(value: string | null | undefined): SubscriptionPlanId {
  return value === PREMIUM_PLAN_ID ? value : PREMIUM_PLAN_ID;
}

export function getBillingPlan(value: string | null | undefined) {
  const planId = normalizeSubscriptionPlan(value);
  return BILLING_PLANS.find((plan) => plan.id === planId) ?? PREMIUM_PLAN;
}

export function subscriptionStatusLabel(value: SubscriptionStatus) {
  switch (value) {
    case "active": return "Active";
    case "past_due": return "Payment due";
    case "canceled": return "Canceled";
    case "incomplete": return "Setup incomplete";
    case "paused": return "Paused";
    default: return "Trial";
  }
}

export function subscriptionTone(value: SubscriptionStatus) {
  switch (value) {
    case "active": return "bg-success/10 text-success";
    case "past_due":
    case "incomplete": return "bg-warning/15 text-ink";
    case "canceled": return "bg-danger-soft text-danger";
    case "paused": return "bg-raised text-ink-muted";
    default: return "bg-primary-soft text-primary";
  }
}

export function formatBillingDate(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Singapore" }).format(date);
}

export function isBillingPeriodCurrent(value: string | null | undefined) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.now();
}
