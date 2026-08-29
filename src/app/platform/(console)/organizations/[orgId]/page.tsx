import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { OrganizationOperations } from "@/app/platform/OrganizationOperations";
import { ComplimentaryGrantPanel } from "@/app/platform/ComplimentaryGrantPanel";
import { TrialExtensionPanel } from "@/app/platform/TrialExtensionPanel";
import { getBillingPlan, normalizeSubscriptionStatus, subscriptionStatusLabel, subscriptionTone } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { readEffectiveComplimentaryAccess } from "@/lib/platform-access";
import { readTrialExtensionEligibility, sumTrialExtensionDays } from "@/lib/platform-trial";
import { isPolicyGateOpen, readPolicyNumber } from "@/lib/platform-operations";
import { readPlatformOperations } from "@/lib/platform-operations-server";
import { absoluteUrl } from "@/lib/site-url";
import { referralStatusLabel } from "@/lib/referrals";
import { isSubscriptionAccessCurrent, formatTrialRemaining, readTrialLifecycle } from "@/lib/trial";
import { PlatformMetric, PlatformPageHeader, PlatformSectionHeading, PlatformUnavailable } from "@/app/platform/PlatformUI";
import { formatDate, humanizeRole, readPlatformOrganizationDetail } from "@/app/platform/_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformOrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!isUuid(orgId)) notFound();
  const asOf = new Date().toISOString();

  const admin = createAdminClient();
  if (!admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform console." />;

  const [detail, operations] = await Promise.all([
    readPlatformOrganizationDetail(admin, orgId),
    readPlatformOperations(admin),
  ]);
  if (!detail) notFound();

  const { organization, profiles, stores, employees, authEmailById, accessGrants, trialExtensions, supportCases, auditLogs, referralCode, referrals } = detail;
  const owner = organization.owner_profile_id ? profiles.find((profile) => profile.id === organization.owner_profile_id) : undefined;
  const ownerEmail = organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) : null;
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const employeeByProfileId = new Map(employees.filter((employee) => employee.profile_id).map((employee) => [employee.profile_id as string, employee]));
  const unlinkedEmployees = employees.filter((employee) => !employee.profile_id || !profileIds.has(employee.profile_id));
  const effectiveGrant = readEffectiveComplimentaryAccess(accessGrants);
  const subscription = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;
  const plan = getBillingPlan(organization.subscription_plan);
  const trialDays = operations.policies.schemaAvailable ? readPolicyNumber(operations.policies.billing, "trialDays", 14) : 14;
  const trial = readTrialLifecycle({
    status: organization.subscription_status,
    createdAt: organization.created_at,
    trialStartedAt: organization.subscription_trial_started_at,
    trialEndsAt: organization.subscription_trial_ends_at,
    currentPeriodEnd: organization.subscription_current_period_end,
    trialDays,
    providerSubscriptionId: organization.subscription_provider_subscription_id,
    providerPaymentIntentId: organization.subscription_provider_payment_intent_id,
  });
  const effectiveAccess = organization.account_status === "suspended"
    ? false
    : isSubscriptionAccessCurrent({
      status: organization.subscription_status,
      trialStartedAt: organization.subscription_trial_started_at,
      trialEndsAt: organization.subscription_trial_ends_at,
      currentPeriodEnd: organization.subscription_current_period_end,
      billingMode: organization.subscription_billing_mode,
      complimentaryAccessUntil: effectiveGrant?.until,
    });
  const trialExtensionEligibility = readTrialExtensionEligibility({
    status: organization.subscription_status,
    accountStatus: organization.account_status,
    providerSubscriptionId: organization.subscription_provider_subscription_id,
    providerPaymentIntentId: organization.subscription_provider_payment_intent_id,
    daysUsed: sumTrialExtensionDays(trialExtensions),
  });
  const policyGateOpen = isPolicyGateOpen(operations.policies);
  const accountOperationsReady = organization.account_status !== undefined && detail.supportCasesSchemaAvailable;
  const accessLabel = organization.account_status === "suspended"
    ? "Suspended"
    : effectiveGrant
      ? "Complimentary Premium"
      : effectiveAccess === true
        ? "Subscription access"
        : effectiveAccess === false
          ? "Access ended"
          : "Access unknown";

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Organization detail"
          title={organization.name}
          description="A single support and access record for subscription state, trial history, platform grants, people, branches, and operator activity."
          actions={<>
            <Link href="/platform/users" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="arrow" size={14} /> Directory</Link>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Operations</Link>
          </>}
        />

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Organization summary">
          <PlatformMetric label="Effective access" value={accessLabel} detail={effectiveGrant ? `Through ${formatDate(effectiveGrant.until)}` : subscription ? subscriptionStatusLabel(subscription) : "No subscription state"} icon="star" />
          <PlatformMetric label="Trial" value={trial.known ? formatTrialRemaining(trial.remainingMs) : "Not scheduled"} detail={trial.endsAt ? `Ends ${formatDate(trial.endsAt)}` : "Base trial history"} icon="bell" />
          <PlatformMetric label="People" value={profiles.length} detail={`${employees.length} employee records`} icon="customers" />
          <PlatformMetric label="Support history" value={supportCases.length} detail={`${detail.trialFeedback ? "Trial feedback captured" : "No trial feedback"}`} icon="help" />
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]" aria-label="Subscription and owner details">
          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PlatformSectionHeading eyebrow="Subscription & access" title="What this organization can use" description="Paid billing state and platform-owned complimentary access are shown independently." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <DetailField label="Plan" value={plan.name} />
              <DetailField label="Subscription" value={subscription ? subscriptionStatusLabel(subscription) : "Not connected"} tone={subscription ? subscriptionTone(subscription) : undefined} />
              <DetailField label="Account" value={organization.account_status === "suspended" ? "Suspended" : "Active"} tone={organization.account_status === "suspended" ? "danger" : "success"} />
              <DetailField label="Trial started" value={formatDate(organization.subscription_trial_started_at)} />
              <DetailField label="Trial ends" value={formatDate(organization.subscription_trial_ends_at)} />
              <DetailField label="Current period ends" value={formatDate(organization.subscription_current_period_end)} />
            </div>
            {effectiveGrant ? <div className="mt-4 rounded-xl border border-success/25 bg-success/10 px-4 py-3"><div className="flex items-start gap-2.5"><AdminIcon name="star" size={16} /><div><p className="text-xs font-extrabold uppercase tracking-wide text-success">Complimentary Premium is active</p><p className="mt-1 text-sm leading-5 text-ink">Access is covered through <strong>{formatDate(effectiveGrant.until)}</strong> via a {effectiveGrant.source} grant.</p><p className="mt-1 text-xs leading-5 text-ink-muted">Reason: {effectiveGrant.reason}</p></div></div></div> : <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-raised px-4 py-3 text-sm leading-5 text-ink-muted">No current complimentary grant is carrying this organization beyond its ordinary subscription state.</div>}
          </article>

          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PlatformSectionHeading eyebrow="Owner" title={owner?.full_name ?? "Owner profile pending"} description="The primary account contact currently linked to this organization." />
            <dl className="mt-5 space-y-3 text-sm"><DetailDefinition label="Email" value={ownerEmail || "Email unavailable"} /><DetailDefinition label="Role" value={owner ? humanizeRole(owner.role) : "—"} /><DetailDefinition label="Organization ID" value={organization.id} mono /><DetailDefinition label="Created" value={formatDate(organization.created_at)} /></dl>
          </article>
        </section>

        <TrialExtensionPanel
          orgId={organization.id}
          extensions={trialExtensions}
          eligibility={trialExtensionEligibility}
          schemaAvailable={detail.trialExtensionsSchemaAvailable}
          policyGateOpen={policyGateOpen}
          trialEndsAt={organization.subscription_trial_ends_at ?? organization.subscription_current_period_end ?? null}
          trialRemainingLabel={trial.known ? formatTrialRemaining(trial.remainingMs) : "No trial scheduled"}
          asOf={asOf}
        />

        <ComplimentaryGrantPanel orgId={organization.id} grants={accessGrants} schemaAvailable={detail.accessGrantsSchemaAvailable} policyGateOpen={policyGateOpen} accountSuspended={organization.account_status === "suspended"} asOf={asOf} />

        <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]" aria-label="People and branches">
          <article className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="px-5 py-5 sm:px-6"><PlatformSectionHeading eyebrow="People" title="Login profiles & employees" description="Profiles control authenticated access; employee records describe the workspace staff model." /></div>
            <div className="overflow-x-auto"><table className="min-w-[700px] w-full text-left text-sm"><thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Person</th><th className="px-6 py-3 font-extrabold">Role</th><th className="px-6 py-3 font-extrabold">Employee code</th><th className="px-6 py-3 font-extrabold">Access</th></tr></thead><tbody className="divide-y divide-line">{profiles.length === 0 && unlinkedEmployees.length === 0 ? <tr><td colSpan={4} className="px-6 py-8 text-center text-ink-muted">No people records found.</td></tr> : <>{profiles.map((profile) => { const employee = employeeByProfileId.get(profile.id); return <tr key={profile.id} className="align-top"><td className="px-6 py-4"><strong className="block">{profile.full_name || "Unnamed user"}</strong><span className="mt-1 block text-xs text-ink-muted">{authEmailById.get(profile.id) || "Email unavailable"}</span></td><td className="px-6 py-4"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{humanizeRole(profile.role)}</span></td><td className="px-6 py-4 text-xs font-semibold text-ink-muted">{employee?.employee_code ?? "—"}</td><td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${profile.is_active ? "bg-success/10 text-success" : "bg-raised text-ink-muted"}`}>{profile.is_active ? "Active" : "Inactive"}</span></td></tr>; })}{unlinkedEmployees.map((employee) => <tr key={`employee-${employee.id}`} className="align-top"><td className="px-6 py-4"><strong className="block">{employee.full_name || "Unnamed employee"}</strong><span className="mt-1 block text-xs text-ink-muted">No login profile linked</span></td><td className="px-6 py-4"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{humanizeRole(employee.role)}</span></td><td className="px-6 py-4 text-xs font-semibold text-ink-muted">{employee.employee_code ?? "—"}</td><td className="px-6 py-4"><span className="rounded-full bg-raised px-2.5 py-1 text-xs font-extrabold text-ink-muted">Employee record only</span></td></tr>)}</>}</tbody></table></div>
          </article>

          <article className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="px-5 py-5 sm:px-6"><PlatformSectionHeading eyebrow="Branches" title={`${stores.length} branch${stores.length === 1 ? "" : "es"}`} description="Active branch identity connected to the organization." /></div>
            <div className="divide-y divide-line">{stores.length === 0 ? <p className="px-6 py-8 text-center text-sm text-ink-muted">No branches found.</p> : stores.map((store) => <div key={store.id} className="flex items-center justify-between gap-3 px-6 py-4"><div><strong className="block text-sm">{store.name}</strong><span className="mt-1 block text-xs text-ink-muted">{store.id}</span></div><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${store.is_active ? "bg-success/10 text-success" : "bg-raised text-ink-muted"}`}>{store.is_active ? "Active" : "Inactive"}</span></div>)}</div>
          </article>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]" aria-label="Support and referrals">
          <article className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="px-5 py-5 sm:px-6"><PlatformSectionHeading eyebrow="Support history" title="Cases and trial feedback" description="The operator history attached to this organization, including retention conversations." /></div>
            <div className="border-t border-line">{supportCases.length === 0 ? <p className="px-6 py-8 text-center text-sm text-ink-muted">No support cases recorded for this organization.</p> : <div className="divide-y divide-line">{supportCases.map((supportCase) => <div key={supportCase.id} className="px-6 py-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="block text-sm">{supportCase.subject}</strong><span className="mt-1 block text-xs text-ink-muted">Opened {formatDate(supportCase.created_at)} · {supportCase.priority === "urgent" ? "Urgent" : "Normal"}</span></div><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{supportCase.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm leading-5 text-ink-muted">{supportCase.description}</p></div>)}</div>}{detail.trialFeedback && <div className="border-t border-line bg-warning/10 px-6 py-4"><p className="text-xs font-extrabold uppercase tracking-wide text-accent">Trial feedback</p><p className="mt-2 text-sm leading-5 text-ink">Reason: <strong>{detail.trialFeedback.reason.replaceAll("_", " ")}</strong>{detail.trialFeedback.wants_discount ? " · Discount requested" : ""}</p>{detail.trialFeedback.details && <p className="mt-1 text-sm leading-5 text-ink-muted">{detail.trialFeedback.details}</p>}<p className="mt-2 text-xs font-semibold text-ink-muted">Updated {formatDate(detail.trialFeedback.updated_at)} · {detail.trialFeedback.status}</p></div>}</div>
          </article>

          <article className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]">
            <div className="px-5 py-5 sm:px-6"><PlatformSectionHeading eyebrow="Referral history" title="Attribution & rewards" description="Referrals are captured at signup and rewarded only after the referred organization reaches its first paid conversion." /></div>
            {!detail.referralsAvailable ? <div className="border-t border-line px-6 py-8 text-sm leading-6 text-ink-muted">Referral data is unavailable until migration <code className="rounded bg-raised px-1.5 py-0.5 text-xs font-bold">0053_referral_program.sql</code> is applied.</div> : <>
              {referralCode && <div className="border-t border-line bg-primary-soft px-6 py-4"><p className="text-xs font-extrabold uppercase tracking-wide text-primary">Owner referral link</p><p className="mt-2 break-all font-mono text-xs font-semibold text-ink">{absoluteUrl(`/signup?ref=${encodeURIComponent(referralCode.code)}`)}</p><p className="mt-2 text-xs leading-5 text-ink-muted">Code: <strong className="font-mono text-primary">{referralCode.code}</strong></p></div>}
              {referrals.length === 0 ? <p className="border-t border-line px-6 py-8 text-center text-sm text-ink-muted">No referral records for this organization.</p> : <div className="divide-y divide-line">{referrals.slice(0, 8).map((referral) => { const isReferrer = referral.referrer_org_id === organization.id; const otherOrganization = isReferrer ? referral.referredOrganizationName : referral.referrerOrganizationName; const rewardLabel = referral.reward ? referral.reward.status === "revoked" ? "Reward revoked" : `${referral.reward.reward_days} Premium days issued` : isReferrer ? "Reward after paid conversion" : ""; return <div key={referral.id} className="px-6 py-4"><div className="flex items-start justify-between gap-3"><div><strong className="block text-sm">{isReferrer ? "Referred business" : "Referred by"}</strong><span className="mt-1 block text-xs text-ink-muted">{otherOrganization || "Organization name unavailable"}</span></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${referral.status === "rewarded" ? "bg-success/10 text-success" : referral.status === "rejected" ? "bg-danger-soft text-danger" : "bg-secondary text-primary"}`}>{referralStatusLabel(referral.status)}</span></div><p className="mt-2 text-xs leading-5 text-ink-muted">Captured {formatDate(referral.captured_at)}{rewardLabel ? ` · ${rewardLabel}` : ""}</p></div>; })}</div>}
            </>}
          </article>
        </section>

        <section className="mt-8 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="operator-controls-heading">
          <PlatformSectionHeading eyebrow="Operator controls" title="Lifecycle and support actions" description="These existing controls remain policy-gated and use the same audit boundary as grants." />
          <div className="mt-5"><OrganizationOperations orgId={organization.id} orgName={organization.name} accountStatus={organization.account_status ?? null} suspensionReason={organization.suspension_reason ?? null} policyGateOpen={policyGateOpen} schemaAvailable={accountOperationsReady} /></div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="audit-history-heading">
          <div className="px-5 py-5 sm:px-6"><PlatformSectionHeading eyebrow="Audit trail" title="Recent operator activity" description="The organization audit log includes platform actions and tenant-side changes that can help support review." action={<span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{auditLogs.length} entries</span>} /></div>
          <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">When</th><th className="px-6 py-3 font-extrabold">Action</th><th className="px-6 py-3 font-extrabold">Entity</th><th className="px-6 py-3 font-extrabold">Entity ID</th></tr></thead><tbody className="divide-y divide-line">{auditLogs.length === 0 ? <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-ink-muted">No audit entries found.</td></tr> : auditLogs.map((audit) => <tr key={audit.id}><td className="whitespace-nowrap px-6 py-4 text-xs font-semibold text-ink-muted">{formatDate(audit.created_at)}</td><td className="px-6 py-4 font-extrabold">{audit.action}</td><td className="px-6 py-4 text-ink-muted">{audit.entity ?? "—"}</td><td className="px-6 py-4 text-xs font-semibold text-ink-muted">{audit.entity_id ?? "—"}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </main>
  );
}

function DetailField({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | string }) {
  const toneClass = tone === "success" ? "bg-success/10 text-success" : tone === "danger" ? "bg-danger-soft text-danger" : tone ? tone : "bg-raised text-ink";
  return <div className="rounded-xl border border-line bg-raised/60 p-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">{label}</p><p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${toneClass}`}>{value}</p></div>;
}

function DetailDefinition({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex flex-col gap-1 border-b border-line pb-3 last:border-b-0 last:pb-0"><dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">{label}</dt><dd className={`break-all font-semibold text-ink-muted ${mono ? "font-mono text-xs" : "text-sm"}`}>{value}</dd></div>;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
