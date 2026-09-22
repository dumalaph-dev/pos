import { getCheckoutReadiness, readPolicyNumber } from "@/lib/platform-operations";
import { readPayMongoSubscriptionReadiness, readPlatformOperations, payMongoConfiguration } from "@/lib/platform-operations-server";
import { derivePlatformEntitlementSummary } from "@/lib/platform-entitlements";
import { syncHealthFreshnessLabel, syncHealthStatusLabel } from "@/lib/platform-sync-health";
import {
  countByOrg,
  readPlatformDirectory,
  readPlatformEntitlementRecords,
  readPlatformSupportCases,
  readPlatformSyncHealth,
  type OrganizationRecord,
  type PlatformAdminClient,
  type PlatformSupportCaseResult,
  type PlatformSyncHealthResult,
} from "@/app/platform/_lib/platform-data";
import type { PlatformAttentionItem } from "./platform-attention";

export type PlatformAttentionBuildInput = {
  organizations: OrganizationRecord[];
  entitlementSummaries: Array<ReturnType<typeof derivePlatformEntitlementSummary>>;
  policies: Awaited<ReturnType<typeof readPlatformOperations>>["policies"];
  checkoutReady: boolean;
  syncHealth: PlatformSyncHealthResult;
  supportCases: PlatformSupportCaseResult["records"];
  canViewSupport: boolean;
};

export type PlatformAttentionSignalRead = {
  items: PlatformAttentionItem[];
  asOf: string;
  resolveSources: Array<PlatformAttentionItem["category"]>;
  sourceAvailability: Record<PlatformAttentionItem["category"], boolean>;
};

/**
 * Evaluate the existing bounded platform readers into source signals for D2.
 * This function does not write occurrences; the explicit refresh action owns
 * that side effect so page renders remain read-only and retryable.
 */
export async function readPlatformAttentionSignals(admin: PlatformAdminClient, canViewSupport: boolean): Promise<PlatformAttentionSignalRead> {
  const [directory, operations, paymongoSubscriptionReadiness, syncHealth, supportCases] = await Promise.all([
    readPlatformDirectory(admin),
    readPlatformOperations(admin),
    readPayMongoSubscriptionReadiness(),
    readPlatformSyncHealth(admin),
    canViewSupport
      ? readPlatformSupportCases(admin)
      : Promise.resolve({ records: [], schemaAvailable: false, organizationsAvailable: true, hasMore: false, total: null, asOf: new Date().toISOString() }),
  ]);

  const { organizations, stores, organizationsResult } = directory;
  const { catalog, policies } = operations;
  const entitlementRecords = await readPlatformEntitlementRecords(admin);
  const activeStoresByOrg = countByOrg(stores.filter((store) => store.is_active));
  const trialDays = readPolicyNumber(policies.billing, "trialDays", 14);
  const entitlementSummaries = organizations.map((organization) => derivePlatformEntitlementSummary({
    organization,
    grants: entitlementRecords.accessGrantsByOrg.get(organization.id),
    trialExtensions: entitlementRecords.trialExtensionsByOrg.get(organization.id),
    activeBranchCount: activeStoresByOrg.get(organization.id) ?? 0,
    includedBranchCount: catalog.includedBranchCount,
    trialDays,
  }));
  const paymongo = payMongoConfiguration();
  const paymongoReadiness = getCheckoutReadiness({
    catalog,
    policies,
    paymongo: {
      secretKeyConfigured: paymongo.secretKeyConfigured,
      publicKeyConfigured: paymongo.publicKeyConfigured,
      keyModeConsistent: paymongo.keyModeConsistent,
      webhookSecretConfigured: paymongo.webhookSecretConfigured,
      subscriptionsEnabled: paymongo.subscriptionsEnabled,
      subscriptionApiAvailable: paymongoSubscriptionReadiness.subscriptionsApiAvailable,
      subscriptionPaymentMethods: paymongoSubscriptionReadiness.subscriptionPaymentMethods,
    },
  });

  const sourceAvailability = {
    billing: organizationsResult.subscriptionFieldsAvailable,
    support: canViewSupport && supportCases.schemaAvailable,
    sync: syncHealth.schemaAvailable && syncHealth.organizationsAvailable && syncHealth.storesAvailable,
    access: organizationsResult.subscriptionFieldsAvailable && organizationsResult.accountFieldsAvailable && entitlementRecords.accessGrantsSchemaAvailable && entitlementRecords.trialExtensionsSchemaAvailable,
    readiness: policies.schemaAvailable && catalog.schemaAvailable,
  } satisfies Record<PlatformAttentionItem["category"], boolean>;

  return {
    items: buildPlatformAttentionItems({
      organizations,
      entitlementSummaries,
      policies,
      checkoutReady: paymongoReadiness.ready,
      syncHealth,
      supportCases: supportCases.records,
      canViewSupport,
    }),
    asOf: new Date().toISOString(),
    resolveSources: (Object.entries(sourceAvailability) as Array<[PlatformAttentionItem["category"], boolean]>)
      .filter(([, available]) => available)
      .map(([source]) => source),
    sourceAvailability,
  };
}

export function buildPlatformAttentionItems({
  organizations,
  entitlementSummaries,
  policies,
  checkoutReady,
  syncHealth,
  supportCases,
  canViewSupport,
}: PlatformAttentionBuildInput): PlatformAttentionItem[] {
  const items: PlatformAttentionItem[] = [];
  for (const organization of organizations) {
    const status = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;
    if (status === "past_due") items.push({ id: `billing:${organization.id}:past_due`, category: "billing", severity: "critical", title: "Payment is due", detail: "Subscription access may pause if the outstanding payment is not recovered.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review account" });
    if (status === "paused") items.push({ id: `billing:${organization.id}:paused`, category: "billing", severity: "critical", title: "Subscription is paused", detail: "Confirm whether this is a failed payment or an expired trial before restoring access.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review billing state" });
    if (status === "incomplete") items.push({ id: `billing:${organization.id}:incomplete`, category: "billing", severity: "high", title: "Subscription setup is incomplete", detail: "The owner has not completed the subscription setup needed for paid access.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review account" });
    if (organization.account_status === "suspended") items.push({ id: `access:${organization.id}:suspended`, category: "access", severity: "high", title: "Account is suspended", detail: organization.suspension_reason ? `Reason: ${organization.suspension_reason}` : "Review the account controls and recorded lifecycle history.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review access" });
  }

  for (const summary of entitlementSummaries) {
    if (summary.filterKeys.includes("trial_expiring")) items.push({ id: `access:${summary.organizationId}:trial_expiring`, category: "access", severity: "high", title: "Trial ends within seven days", detail: summary.trial.endsAt ? `Access ends ${formatDate(summary.trial.endsAt)}.` : summary.accessDetail, organizationName: summary.organizationName, organizationId: summary.organizationId, href: `/platform/organizations/${summary.organizationId}`, actionLabel: "Review entitlement", createdAt: summary.trial.endsAt ?? undefined });
    if (summary.filterKeys.includes("grant_expiring")) items.push({ id: `access:${summary.organizationId}:grant_expiring`, category: "access", severity: "medium", title: "Complimentary access ends within seven days", detail: summary.currentGrant?.endsAt ? `Grant ends ${formatDate(summary.currentGrant.endsAt)}.` : "Review the current grant before access ends.", organizationName: summary.organizationName, organizationId: summary.organizationId, href: `/platform/organizations/${summary.organizationId}`, actionLabel: "Review grant", createdAt: summary.currentGrant?.endsAt });
  }

  if (canViewSupport) {
    const now = Date.now();
    for (const supportCase of supportCases) {
      const overdue = Date.parse(supportCase.first_response_due_at) <= now;
      items.push({ id: `support:${supportCase.id}`, category: "support", severity: supportCase.priority === "urgent" ? "critical" : overdue ? "high" : "medium", title: supportCase.priority === "urgent" ? `Urgent case: ${supportCase.subject}` : supportCase.subject, detail: `First response ${overdue ? "overdue" : "due"} ${formatDate(supportCase.first_response_due_at)} · ${supportCase.status.replaceAll("_", " ")}.`, organizationName: supportCase.organizationName, organizationId: supportCase.org_id, href: `/platform/organizations/${supportCase.org_id}`, actionLabel: "Open support history", createdAt: supportCase.first_response_due_at });
    }
  }

  for (const branch of syncHealth.summary.branchRows.filter((row) => row.status !== "healthy")) {
    const severity = branch.status === "needs_attention" ? "high" : "medium";
    const detail = branch.status === "needs_attention"
      ? `${branch.failedCount} failed · ${branch.conflictCount} conflict${branch.conflictCount === 1 ? "" : "s"} · ${branch.stuckCount} stuck.`
      : branch.status === "stale"
        ? `Last reporter update is ${syncHealthAge(branch.lastReportedAt, syncHealth.summary.asOf)} old.`
        : "No branch heartbeat is available yet.";
    items.push({ id: `sync:${branch.storeId}`, category: "sync", severity, title: `${syncHealthStatusLabel(branch.status)} at ${branch.storeName}`, detail: `${detail} ${syncHealthFreshnessLabel(branch.freshness)}.`, organizationName: branch.organizationName, organizationId: branch.organizationId, branchId: branch.storeId, branchName: branch.storeName, href: "/platform/sync", actionLabel: "Open sync health", createdAt: branch.lastReportedAt ?? undefined });
  }

  if (policies.billing.status !== "published") items.push({ id: "readiness:billing-policy", category: "readiness", severity: "high", title: "Billing policy is still a draft", detail: "Checkout and billing actions remain gated until the billing policy is published.", href: "/platform/policies", actionLabel: "Review policies" });
  if (policies.support.status !== "published") items.push({ id: "readiness:support-policy", category: "readiness", severity: "high", title: "Support policy is still a draft", detail: "Support and account lifecycle actions remain gated until the support policy is published.", href: "/platform/policies", actionLabel: "Review policies" });
  if (!checkoutReady) items.push({ id: "readiness:checkout", category: "readiness", severity: "high", title: "Checkout setup is incomplete", detail: "Review the provider, subscription, and catalog readiness checks before sending owners to checkout.", href: "/platform/plans", actionLabel: "Review checkout setup" });

  return sortAttentionItems(items).slice(0, 250);
}

function sortAttentionItems(items: PlatformAttentionItem[]) {
  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return [...items].sort((left, right) => {
    const severity = rank[left.severity] - rank[right.severity];
    if (severity !== 0) return severity;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
}

function normalizeSubscriptionStatus(value: string) {
  return value.trim().toLowerCase();
}

function syncHealthAge(value: string | null, asOf: string) {
  if (!value) return "unknown";
  const difference = Math.max(0, Date.parse(asOf) - Date.parse(value));
  const minutes = Math.round(difference / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function formatDate(value: string | null | undefined) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "an unknown time" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}
