import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { CheckoutReadinessChecklist } from "@/app/platform/CheckoutReadinessChecklist";
import { OrganizationOperations } from "@/app/platform/OrganizationOperations";
import { PlatformEntitlementDirectory } from "@/app/platform/PlatformEntitlementDirectory";
import { TrialFeedbackOperations } from "@/app/platform/TrialFeedbackOperations";
import { getBillingPlan, normalizeSubscriptionStatus, subscriptionStatusLabel, subscriptionTone } from "@/lib/billing";
import { formatPeso } from "@/lib/money";
import { getCheckoutReadiness, isPolicyGateOpen, readPolicyNumber } from "@/lib/platform-operations";
import { payMongoConfiguration, readPayMongoSubscriptionReadiness, readPlatformOperations, supportCasesSchemaAvailable } from "@/lib/platform-operations-server";
import { hasPlatformOperatorPermission } from "@/lib/platform-operators";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { formatTrialRemaining, readTrialLifecycle, TRIAL_FEEDBACK_STATUS_LABELS } from "@/lib/trial";
import { derivePlatformEntitlementSummary } from "@/lib/platform-entitlements";
import { PlatformAccessDenied, PlatformMetric, PlatformMigrationNotice, PlatformPageHeader, PlatformSectionHeading, PlatformStatusBadge } from "../../PlatformUI";
import { countByOrg, formatDate, readPlatformDirectory, readPlatformEntitlementRecords } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformOperationsPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  const admin = actor.admin;

  const [directory, operations, supportCasesReady, paymongoSubscriptionReadiness] = await Promise.all([
    readPlatformDirectory(admin),
    readPlatformOperations(admin),
    supportCasesSchemaAvailable(admin),
    readPayMongoSubscriptionReadiness(),
  ]);

  const {
    organizations,
    profiles,
    stores,
    employees,
    authEmailById,
    organizationsResult,
    trialFeedbackByOrg,
    trialFeedbackStorage,
    trialFeedbackWorkflowAvailable,
  } = directory;
  const { catalog, policies } = operations;
  const policyGateOpen = isPolicyGateOpen(policies);
  const paymongo = payMongoConfiguration();
  const checkoutReadiness = getCheckoutReadiness({
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
  const checkoutReady = checkoutReadiness.ready;
  const accountOperationsSchemaReady = organizationsResult.accountFieldsAvailable && policies.schemaAvailable && supportCasesReady;
  const canManageSupport = hasPlatformOperatorPermission(actor.role, "support_manage");
  const canManageEntitlements = hasPlatformOperatorPermission(actor.role, "entitlement_manage");
  const canViewSupport = actor.role !== "billing";
  const activeSubscriptions = organizations.filter((organization) => organization.subscription_status && normalizeSubscriptionStatus(organization.subscription_status) === "active").length;
  const trialSubscriptions = organizations.filter((organization) => organization.subscription_status && normalizeSubscriptionStatus(organization.subscription_status) === "trialing").length;
  const trialDays = readPolicyNumber(policies.billing, "trialDays", 14);
  const entitlementRecords = await readPlatformEntitlementRecords(admin);
  const priorityTrialLeads = organizations.filter((organization) => {
    const trial = readTrialLifecycle({
      status: organization.subscription_status,
      createdAt: organization.created_at,
      trialStartedAt: organization.subscription_trial_started_at,
      trialEndsAt: organization.subscription_trial_ends_at,
      currentPeriodEnd: organization.subscription_current_period_end,
      trialDays,
    });
    return trial.reminder !== null || trialFeedbackByOrg.has(organization.id);
  }).length;
  const discountRequests = Array.from(trialFeedbackByOrg.values()).filter((feedback) => feedback.wants_discount).length;
  const suspendedAccounts = organizations.filter((organization) => organization.account_status === "suspended").length;
  const storesByOrg = countByOrg(stores);
  const activeStoresByOrg = countByOrg(stores.filter((store) => store.is_active));
  const employeesByOrg = countByOrg(employees);
  const activeEmployeesByOrg = countByOrg(employees.filter((employee) => employee.is_active));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const entitlementSummaries = organizations.map((organization) => derivePlatformEntitlementSummary({
    organization,
    grants: entitlementRecords.accessGrantsByOrg.get(organization.id),
    trialExtensions: entitlementRecords.trialExtensionsByOrg.get(organization.id),
    activeBranchCount: activeStoresByOrg.get(organization.id) ?? 0,
    includedBranchCount: catalog.includedBranchCount,
    trialDays,
  }));
  const priorityLeads = organizations.map((organization) => {
    const trial = readTrialLifecycle({
      status: organization.subscription_status,
      createdAt: organization.created_at,
      trialStartedAt: organization.subscription_trial_started_at,
      trialEndsAt: organization.subscription_trial_ends_at,
      currentPeriodEnd: organization.subscription_current_period_end,
      trialDays,
    });
    return { organization, trial, feedback: trialFeedbackByOrg.get(organization.id) };
  }).filter(({ trial, feedback }) => trial.reminder !== null || feedback !== undefined).slice(0, 6);

  const feedbackStorageLabel = trialFeedbackStorage === "table"
    ? "Database queue"
    : trialFeedbackStorage === "table_legacy"
      ? "Apply migration 0039 for follow-up controls"
      : trialFeedbackStorage === "settings"
        ? "Fallback queue active"
        : "Feedback storage unavailable";

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Lifecycle & support"
          title="Operations"
          description="Monitor provider readiness, review business accounts, and use policy-gated lifecycle and support controls."
          actions={<>
            <Link href="/platform/policies" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="lock" size={14} /> Review policies</Link>
            <Link href="/platform/users" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">View users</Link>
          </>}
        />

        {(!organizationsResult.subscriptionFieldsAvailable || !organizationsResult.accountFieldsAvailable || !catalog.schemaAvailable || !policies.schemaAvailable || !supportCasesReady || !entitlementRecords.accessGrantsSchemaAvailable || !entitlementRecords.trialExtensionsSchemaAvailable) && <PlatformMigrationNotice migrations={["0027_platform_operations.sql", "0028_support_cases.sql", "0052_platform_access_grants.sql", "0054_atomic_platform_access_grant.sql", "0068_branch_billing_pricing.sql", "0075_extend_organization_trial.sql"]} />}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Operations summary">
          <PlatformMetric label="Active subscriptions" value={activeSubscriptions} detail={`${trialSubscriptions} businesses in trial`} icon="wallet" />
          <PlatformMetric label="Priority trial leads" value={canViewSupport ? priorityTrialLeads : "Restricted"} detail={canViewSupport ? `${discountRequests} tailored offer request${discountRequests === 1 ? "" : "s"}` : "Support workspace access is restricted"} icon="customers" />
          <PlatformMetric label="Suspended accounts" value={suspendedAccounts} detail={suspendedAccounts ? "Review before restoring access" : "No accounts suspended"} icon="lock" />
          <PlatformMetric label="Policy gate" value={policyGateOpen ? "Open" : "Locked"} detail={policyGateOpen ? "Account actions enabled" : "Publish both policies"} icon="refresh" />
          <PlatformMetric label="Checkout" value={checkoutReady ? "Ready" : "Locked"} detail={checkoutReady ? "Provider and policy checks pass" : "Finish provider setup"} icon="dashboard" />
        </section>

        <section className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]" aria-label="Checkout readiness and actions">
          <CheckoutReadinessChecklist readiness={checkoutReadiness} />

          <article className="rounded-[22px] border border-dashed border-line-strong bg-raised p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Policy-gated actions</p><h2 className="mt-1 text-xl font-extrabold">What you can do next</h2><p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Account suspension, restoration, and support cases are available from each business card below once the required migrations and policies are ready.</p></div>
              <PlatformStatusBadge status={policyGateOpen && accountOperationsSchemaReady && checkoutReady ? "active" : "draft"} label={policyGateOpen && accountOperationsSchemaReady && checkoutReady ? "Ready" : "Locked"} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <LockedAction icon="wallet" label="Subscription checkout" detail={checkoutReady ? "Available from the owner Billing page" : checkoutReadiness.remainingActions[0]?.action ?? "Complete the checkout-readiness checklist"} href={checkoutReady ? "/admin/billing" : undefined} />
              <LockedAction icon="alert" label="Suspend account" detail={accountOperationsSchemaReady && policyGateOpen ? "Use the business controls below" : policyGateOpen ? "Apply the platform migrations" : "Publish both policies first"} href={accountOperationsSchemaReady && policyGateOpen ? "#business-controls-heading" : undefined} hrefLabel="Open controls" />
              <LockedAction icon="help" label="Open support case" detail={accountOperationsSchemaReady && policyGateOpen ? "Use the business controls below" : policyGateOpen ? "Apply the support migration" : "Publish both policies first"} href={accountOperationsSchemaReady && policyGateOpen ? "#business-controls-heading" : undefined} hrefLabel="Open controls" />
            </div>
          </article>
        </section>

        <PlatformEntitlementDirectory
          summaries={entitlementSummaries}
          grantSchemaAvailable={entitlementRecords.accessGrantsSchemaAvailable}
          adjustmentSchemaAvailable={entitlementRecords.accessGrantAdjustmentSchemaAvailable}
          trialSchemaAvailable={entitlementRecords.trialExtensionsSchemaAvailable}
          policyGateOpen={policyGateOpen}
          canManage={canManageEntitlements}
        />

        <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="directory-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Account operations" title="Business directory" description="Review subscription and team context before opening a lifecycle or support control." action={<div className="text-right text-xs font-semibold text-ink-muted"><span className="block">{activeSubscriptions} active - {trialSubscriptions} in trial</span><span className="mt-1 block">Showing up to 100 recent organizations</span></div>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Business</th><th className="px-6 py-3 font-extrabold">Owner</th><th className="px-6 py-3 font-extrabold">Stores</th><th className="px-6 py-3 font-extrabold">Staff</th><th className="px-6 py-3 font-extrabold">Subscription</th><th className="px-6 py-3 font-extrabold">Status</th><th className="px-6 py-3 font-extrabold">Created</th></tr></thead>
              <tbody className="divide-y divide-line">
                {organizations.length === 0 ? <tr><td colSpan={7} className="px-6 py-12 text-center text-ink-muted">No business accounts yet.</td></tr> : organizations.map((organization) => {
                  const owner = organization.owner_profile_id ? profileById.get(organization.owner_profile_id) : undefined;
                  const subscription = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;
                  const plan = getBillingPlan(organization.subscription_plan);
                  return <tr key={organization.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><Link href={`/platform/organizations/${organization.id}`} className="block font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{organization.name}</Link><span className="mt-1 block text-xs text-ink-muted">{organization.id.slice(0, 8)}</span></td><td className="px-6 py-4"><strong className="block">{owner?.full_name ?? "Owner profile pending"}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) || "Email unavailable" : "-"}</span></td><td className="px-6 py-4"><strong>{activeStoresByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">of {storesByOrg.get(organization.id) ?? 0} active</span></td><td className="px-6 py-4"><strong>{activeEmployeesByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">of {employeesByOrg.get(organization.id) ?? 0} active</span></td><td className="px-6 py-4">{subscription ? <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${subscriptionTone(subscription)}`}>{subscriptionStatusLabel(subscription)}</span> : <span className="inline-flex rounded-full bg-raised px-2.5 py-1 text-xs font-extrabold text-ink-muted">Not connected</span>}<span className="mt-2 block text-xs font-semibold text-ink-muted">{plan.name} - {formatPeso(catalog.monthlyPriceCentavos)}/month</span></td><td className="px-6 py-4"><PlatformStatusBadge status={organization.account_status === "suspended" ? "suspended" : "active"} /></td><td className="whitespace-nowrap px-6 py-4 text-ink-muted">{formatDate(organization.created_at)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>

        {canViewSupport ? <section className="mt-8 rounded-[22px] border border-warning/30 bg-warning/10 p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="priority-trial-leads-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Retention queue</p><h2 id="priority-trial-leads-heading" className="mt-1 text-xl font-extrabold">Priority trial leads</h2><p className="mt-1 text-sm leading-5 text-ink-muted">Final-five-day reminders and every submitted feedback response appear here. Platform staff can record contact, offers, notes, and closure status.</p></div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${trialFeedbackStorage === "table" ? "bg-success/10 text-success" : "bg-surface text-ink-muted"}`}>{feedbackStorageLabel}</span>
          </div>
          {priorityLeads.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-warning/30 bg-surface/70 px-4 py-5 text-sm text-ink-muted">No active retention leads right now. New final-day feedback will appear here automatically.</div> : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{priorityLeads.map(({ organization, trial, feedback }) => {
            const leadLabel = trial.reminder === "last_day" ? "Ends today" : feedback?.wants_discount ? "Offer requested" : trial.reminder ? formatTrialRemaining(trial.remainingMs) : "Feedback received";
            return <article key={organization.id} className="rounded-xl border border-warning/25 bg-surface p-4">
              <div className="flex items-start justify-between gap-3"><div><strong className="block text-sm font-extrabold">{organization.name}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.id.slice(0, 8)}</span></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${trial.reminder === "last_day" || feedback?.wants_discount ? "bg-danger-soft text-danger" : "bg-warning/15 text-ink"}`}>{leadLabel}</span></div>
              {feedback ? <>
                <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Feedback</span><span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold text-primary">{TRIAL_FEEDBACK_STATUS_LABELS[feedback.status]}</span></div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">Reason: <strong className="font-extrabold text-ink">{feedback.reason.replaceAll("_", " ")}</strong></p>
                {feedback.details && <p className="mt-2 text-xs leading-5 text-ink-muted">Customer note: {feedback.details}</p>}
                {feedback.platform_notes && <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-xs leading-5 text-ink-muted">Internal note: {feedback.platform_notes}</p>}
                <TrialFeedbackOperations orgId={organization.id} status={feedback.status} platformNotes={feedback.platform_notes} workflowAvailable={trialFeedbackWorkflowAvailable} canManage={canManageSupport} />
              </> : <p className="mt-3 text-xs leading-5 text-ink-muted">This owner is approaching trial expiry. Open the support controls to offer help before access ends.</p>}
              <Link href={`#business-controls-${organization.id}`} className="mt-3 inline-flex text-xs font-extrabold text-primary hover:underline">Open support controls <AdminIcon name="arrow" size={13} /></Link>
            </article>;
          })}</div>}
        </section> : <section className="mt-8 rounded-[22px] border border-line bg-raised/60 p-5 sm:p-6" aria-label="Support workspace restricted"><PlatformSectionHeading eyebrow="Retention queue" title="Support workspace restricted" description="Billing operators can manage plans, promotions, and entitlements, but support cases and retention notes are reserved for Support and Owner operators." /></section>}

        <section id="business-controls-heading" className="mt-8 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="business-controls-title">
          <PlatformSectionHeading eyebrow="Lifecycle and support" title="Business controls" description={canViewSupport ? "Each action is recorded in the organization audit trail. Controls remain disabled until both policies are published and the required schemas are available." : "Support controls are hidden for Billing operators. Open an organization record for subscription and entitlement context."} />
          {organizations.length === 0 ? <p className="py-8 text-center text-sm text-ink-muted">No business accounts to manage.</p> : <div className="grid gap-4 pt-5 xl:grid-cols-2">{organizations.map((organization) => <article id={`business-controls-${organization.id}`} key={organization.id} className="rounded-[18px] border border-line bg-raised p-4"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-extrabold">{organization.name}</h3><p className="mt-1 text-xs font-semibold text-ink-muted">Account operations for {organization.id.slice(0, 8)}</p></div><PlatformStatusBadge status={organization.account_status === "suspended" ? "suspended" : "active"} /></div>{organization.account_status === "suspended" && organization.suspension_reason && <p className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold leading-5 text-danger">Reason: {organization.suspension_reason}</p>}<OrganizationOperations orgId={organization.id} orgName={organization.name} accountStatus={organization.account_status ?? "active"} suspensionReason={organization.suspension_reason ?? null} policyGateOpen={policyGateOpen} schemaAvailable={accountOperationsSchemaReady} canManage={canManageSupport} visible={canViewSupport} /></article>)}</div>}
        </section>

        <p className="mt-5 text-xs leading-5 text-ink-muted">Operations owns provider readiness, account lifecycle, support setup, and trial-retention follow-up. Plans, users, policies, and operator access each have their own workspace in the platform navigation.</p>
      </div>
    </main>
  );
}

function LockedAction({ icon, label, detail, href, hrefLabel }: { icon: "wallet" | "alert" | "help"; label: string; detail: string; href?: string; hrefLabel?: string }) {
  return <div className="rounded-[18px] border border-line bg-surface p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-raised text-ink-muted"><AdminIcon name={icon} size={17} /></span><p className="mt-3 text-sm font-extrabold text-ink">{label}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>{href ? <Link href={href} className="mt-4 block w-full rounded-xl bg-primary px-3 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-primary-fg">{hrefLabel ?? "Open"}</Link> : <button type="button" disabled className="mt-4 w-full rounded-xl bg-secondary px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted disabled:cursor-not-allowed">Locked</button>}</div>;
}
