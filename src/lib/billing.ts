export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "paused";
export type SubscriptionPlanId = "starter" | "growth" | "custom";

export type BillingPlan = {
  id: SubscriptionPlanId;
  name: string;
  summary: string;
  features: string[];
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    summary: "The essentials for one focused store team.",
    features: ["Core POS and checkout", "Owner dashboard", "Branch staff access links", "Sales and inventory records"],
  },
  {
    id: "growth",
    name: "Growth",
    summary: "More visibility for owners running multiple branches.",
    features: ["Everything in Starter", "Multiple branch management", "Manager access", "Cross-branch reporting"],
  },
  {
    id: "custom",
    name: "Custom",
    summary: "A plan shaped around a larger operation.",
    features: ["Custom branch and team needs", "Implementation guidance", "Operational support planning", "Flexible commercial terms"],
  },
];

export function normalizeSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
  if (value === "active" || value === "past_due" || value === "canceled" || value === "incomplete" || value === "paused") return value;
  return "trialing";
}

export function normalizeSubscriptionPlan(value: string | null | undefined): SubscriptionPlanId {
  if (value === "growth" || value === "custom") return value;
  return "starter";
}

export function getBillingPlan(value: string | null | undefined) {
  const planId = normalizeSubscriptionPlan(value);
  return BILLING_PLANS.find((plan) => plan.id === planId) ?? BILLING_PLANS[0];
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
