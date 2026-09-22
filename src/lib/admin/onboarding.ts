export type OwnerOnboardingStepId =
  | "business"
  | "branch"
  | "pos"
  | "catalog"
  | "inventory"
  | "staff"
  | "dashboard";

export type OwnerOnboardingStep = {
  id: OwnerOnboardingStepId;
  title: string;
  description: string;
  suggestion: string;
  href: string;
  actionLabel: string;
  complete: boolean;
};

export type OwnerOnboardingState = {
  steps: OwnerOnboardingStep[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  isComplete: boolean;
};

export type OwnerOnboardingInput = {
  hasBusinessProfile: boolean;
  hasBranch: boolean;
  hasPosDevice: boolean;
  hasCatalog: boolean;
  hasOpeningInventory: boolean;
  hasStaff: boolean;
  hasDashboardSettings: boolean;
};

export type OwnerOnboardingPhase = {
  title: string;
  description: string;
  stepIds: OwnerOnboardingStepId[];
};

export const OWNER_ONBOARDING_PHASES: OwnerOnboardingPhase[] = [
  {
    title: "Create your workspace",
    description: "Start with the business identity, location, and counter that will own your first sale.",
    stepIds: ["business", "branch", "pos"],
  },
  {
    title: "Build what you sell",
    description: "Add the menu first, then record the stock that is already on hand.",
    stepIds: ["catalog", "inventory"],
  },
  {
    title: "Prepare daily operations",
    description: "Give the team access and set the alerts that help you act before stock runs out.",
    stepIds: ["staff", "dashboard"],
  },
];

export type OwnerMonitoringGuide = {
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

/**
 * The habits that decide whether the numbers are trustworthy in week two.
 *
 * Deliberately separate from {@link OWNER_ONBOARDING_PHASES}: those steps are
 * checked against the database and tick themselves off, while these are
 * judgement calls nothing can detect. Showing them as a checklist the owner
 * ticks in their head — not in the app — is why they carry a cadence instead
 * of a completion state.
 */
export type OwnerLaunchHabit = {
  cadence: string;
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

export const OWNER_LAUNCH_CHECKLIST: OwnerLaunchHabit[] = [
  {
    cadence: "Before the first sale",
    title: "Run one test sale, then void it",
    body: "A single sale exercises the shift, price, stock, receipt, and report path at once. Voiding it afterwards leaves the real day clean.",
    href: "/pos",
    actionLabel: "Open POS",
  },
  {
    cadence: "Every shift",
    title: "Open and close the shift on purpose",
    body: "A shift that is never closed has no counted cash to compare against, so the first real cash question has no answer.",
    href: "/admin/shifts",
    actionLabel: "Review shifts",
  },
  {
    cadence: "Every delivery",
    title: "Record stock the day it arrives",
    body: "Sales reduce stock on their own; deliveries, prep, and waste do not. A ledger updated from memory a week later is a guess.",
    href: "/admin/inventory?movement=receive#stock-movement",
    actionLabel: "Record a movement",
  },
  {
    cadence: "Every week",
    title: "Read the week, not just the day",
    body: "Compare this week with last week and check the discount rate and reversal count. Single days are noise; the direction is the signal.",
    href: "/admin/reports",
    actionLabel: "Open reports",
  },
];

export const OWNER_MONITORING_GUIDE: OwnerMonitoringGuide[] = [
  {
    title: "Open the dashboard first",
    body: "Use sales, orders, and average ticket to understand the day. Check low-stock and out-of-stock cards for the next action.",
    href: "/admin",
    actionLabel: "Open dashboard",
  },
  {
    title: "Record preparation honestly",
    body: "For whole lechon, enter the source usage, usable yield, and waste so the inventory ledger explains what can be sold.",
    href: "/admin/inventory#yield-entry",
    actionLabel: "Review yield",
  },
  {
    title: "Reorder before the floor",
    body: "Review low-stock alerts, then open supplier details for contact notes, delivery days, and ordering cut-offs.",
    href: "/admin/suppliers",
    actionLabel: "Review suppliers",
  },
  {
    title: "Close with a physical count",
    body: "Compare expected stock with the counted quantity at day-end. Save the difference and revise it if the count changes.",
    href: "/admin/inventory/variance",
    actionLabel: "Open count",
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function hasConfiguredOwnerDashboardSettings(settings: unknown) {
  const dashboard = asRecord(asRecord(settings).admin_dashboard);
  return typeof dashboard.theme === "string"
    && typeof dashboard.low_stock_alerts_enabled === "boolean"
    && Number.isFinite(Number(dashboard.default_low_stock_threshold));
}

export function hasConfiguredOwnerBusinessProfile(settings: unknown, organizationName: string | null | undefined) {
  const dashboard = asRecord(asRecord(settings).admin_dashboard);
  return Boolean(organizationName?.trim() && typeof dashboard.brand_name === "string" && dashboard.brand_name.trim());
}

export type OwnerGuidanceTopic = "dashboard" | "yield" | "low-stock" | "suppliers" | "variance";

export type OwnerGuidanceContent = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  href: string;
  actionLabel: string;
};

export const OWNER_GUIDANCE: Record<OwnerGuidanceTopic, OwnerGuidanceContent> = {
  dashboard: {
    eyebrow: "Owner guide",
    title: "Read the dashboard in a minute",
    body: "The cards at the top summarize today, while the panels below explain what needs your attention next.",
    bullets: [
      "Sales, orders, and average ticket are based on completed POS orders today.",
      "Low-stock and out-of-stock counts come from tracked inventory, not menu items that skip stock tracking.",
    ],
    href: "/admin/settings#dashboard-settings",
    actionLabel: "Review dashboard settings",
  },
  yield: {
    eyebrow: "Inventory guide",
    title: "Turn a whole lechon into saleable stock",
    body: "Use guided yield when preparation changes one tracked product into another. One save links the source usage, usable output, and waste in the stock ledger.",
    bullets: [
      "Total yield is everything produced before waste is removed.",
      "Usable output is total yield less waste, so the ledger stays explainable.",
    ],
    href: "/admin/inventory#yield-entry",
    actionLabel: "Open yield workflow",
  },
  "low-stock": {
    eyebrow: "Dashboard guide",
    title: "Low-stock alerts are an early warning",
    body: "The alert floor is shared across the organization. A product-specific minimum can still raise that floor for one item.",
    bullets: [
      "Out of stock means the ledger balance is zero or below.",
      "Raise the shared floor when you need more time to reorder, then review the alert list daily.",
    ],
    href: "/admin/settings#dashboard-settings",
    actionLabel: "Set the alert floor",
  },
  suppliers: {
    eyebrow: "Purchasing guide",
    title: "Keep supplier details close to your catalog",
    body: "A supplier record gives the team a reliable contact and makes product replenishment easier to follow up.",
    bullets: [
      "Add one supplier before linking products to it.",
      "Use notes for delivery days, payment terms, or the cut-off time for the next order.",
    ],
    href: "/admin/suppliers",
    actionLabel: "Manage suppliers",
  },
  variance: {
    eyebrow: "Closing guide",
    title: "Expected versus counted explains the gap",
    body: "At the end of the day, compare the ledger with the physical count. Saving a correction records only the difference and keeps the reconciliation auditable.",
    bullets: [
      "A short count creates a negative adjustment; an over-count creates a positive adjustment.",
      "If you revise a count later, only the new difference is added—stock is not double-counted.",
    ],
    href: "/admin/inventory/variance",
    actionLabel: "Open end-of-day count",
  },
};

function buildStep(
  id: OwnerOnboardingStepId,
  complete: boolean,
  title: string,
  description: string,
  suggestion: string,
  href: string,
  actionLabel: string,
): OwnerOnboardingStep {
  return { id, complete, title, description, suggestion, href, actionLabel };
}

export function buildOwnerOnboardingState(input: OwnerOnboardingInput): OwnerOnboardingState {
  const steps = [
    buildStep(
      "business",
      input.hasBusinessProfile,
      "Tell us about your business",
      "Set the organization name, brand, and currency your team will see.",
      "A clear identity keeps receipts, navigation, and reports recognizable.",
      "/admin/settings#dashboard-settings",
      "Set business profile",
    ),
    buildStep(
      "branch",
      input.hasBranch,
      "Create your first branch",
      "Give your menu, stock, sales, and receipts a physical home.",
      "Start with the location where you will sell first; you can add more branches later.",
      "/admin/branches#branch-editor",
      "Add a branch",
    ),
    buildStep(
      "pos",
      input.hasPosDevice,
      "Connect a POS counter",
      "Bind a tablet to this branch and choose its printer settings.",
      "Then send the cashier the branch sign-in link, install the app on the tablet, and have them sign in with their own Employee ID.",
      "/setup",
      "Set up a counter",
    ),
    buildStep(
      "catalog",
      input.hasCatalog,
      "Build your menu",
      "Create categories and products that can appear in POS.",
      "Add the products you sell most often first, then turn on stock tracking for items you want to count.",
      "/products",
      "Add products",
    ),
    buildStep(
      "inventory",
      input.hasOpeningInventory,
      "Add opening inventory",
      "Record the stock you have before the first sale.",
      "Start with whole lechon and other tracked ingredients so the dashboard can show useful stock alerts.",
      "/admin/inventory#movement-entry",
      "Enter opening stock",
    ),
    buildStep(
      "staff",
      input.hasStaff,
      "Add your team",
      "Create staff records and choose who can use POS or review the backoffice.",
      "Give each person only the access they need, then assign a home branch when their work is location-specific.",
      "/admin/employees?tab=list&create=employee",
      "Add staff",
    ),
    buildStep(
      "dashboard",
      input.hasDashboardSettings,
      "Tune dashboard alerts",
      "Choose your theme and the shared low-stock floor for daily decisions.",
      "A small setup decision here prevents surprise stock-outs later in the week.",
      "/admin/settings#dashboard-settings",
      "Tune alerts",
    ),
  ];
  const completedCount = steps.filter((step) => step.complete).length;
  const totalCount = steps.length;

  return {
    steps,
    completedCount,
    totalCount,
    progressPercent: Math.round((completedCount / totalCount) * 100),
    isComplete: completedCount === totalCount,
  };
}
