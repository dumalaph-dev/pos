import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { getAdminBranchOptions } from "@/lib/admin/branches";
import { formatBillingDate, getBillingPlan, isBillingPeriodCurrent, normalizeSubscriptionStatus, subscriptionStatusLabel, type BillingPlan, type SubscriptionStatus } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import { billingVariantMonthlyEquivalent, billingVariantPriceLabel, calculateBillingVariantPrice, DEFAULT_MONTHLY_PRICE_CENTAVOS, DEFAULT_PLATFORM_POLICIES, hasSubscriptionPaymentMethod, isPolicyGateOpen, readPolicyNumber, type BillingCatalog, type BillingVariant } from "@/lib/platform-operations";
import { payMongoConfiguration, readPayMongoSubscriptionReadiness, readPlatformOperations } from "@/lib/platform-operations-server";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { formatTrialRemaining, readTrialLifecycle, type TrialLifecycle } from "@/lib/trial";
import TrialCountdown from "./TrialCountdown";
import TrialFeedbackForm from "./TrialFeedbackForm";
import SubscriptionCheckout from "./SubscriptionCheckout";
import TemporaryQrPhCheckout from "./TemporaryQrPhCheckout";

type OrganizationRecord = {
  id: string;
  name: string;
  currency: string;
  created_at?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_trial_started_at?: string | null;
  subscription_trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_updated_at?: string | null;
  subscription_billing_mode?: "recurring" | "temporary_qrph" | null;
  subscription_billing_variant_id?: string | null;
  subscription_provider_plan_id?: string | null;
  subscription_provider_subscription_id?: string | null;
  subscription_provider_payment_intent_id?: string | null;
};

type BranchRecord = { id: string; is_active: boolean };

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (!profile) return <BillingMessage title="Your admin profile is not ready." detail="Ask an organization admin to finish your profile before opening billing settings." />;
  if (profile.role !== "admin") return <BillingMessage title="Owner access required" detail="Only the business owner can manage the organization plan and subscription." />;

  const supabase = await createClient();
  const richResult = await supabase
    .from("organizations")
    .select("id, name, currency, created_at, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_updated_at, subscription_billing_mode, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id")
    .eq("id", profile.org_id)
    .maybeSingle();

  let organization: OrganizationRecord | null = richResult.data as OrganizationRecord | null;
  let subscriptionFieldsAvailable = !richResult.error;
  if (richResult.error) {
    const fallback = await supabase
      .from("organizations")
      .select("id, name, currency, created_at, subscription_status, subscription_plan, subscription_current_period_end, subscription_updated_at")
      .eq("id", profile.org_id)
      .maybeSingle();
    organization = fallback.data as OrganizationRecord | null;
    subscriptionFieldsAvailable = !fallback.error;
  }

  if (organization && subscriptionFieldsAvailable) {
    const variantResult = await supabase
      .from("organizations")
      .select("subscription_billing_variant_id")
      .eq("id", profile.org_id)
      .maybeSingle();
    if (!variantResult.error) {
      organization = {
        ...organization,
        subscription_billing_variant_id: (variantResult.data as { subscription_billing_variant_id?: string | null } | null)?.subscription_billing_variant_id ?? null,
      };
    }
  }

  const branchesResult = await getAdminBranchOptions(profile.org_id);
  const branches = branchesResult.data as BranchRecord[];
  const activeBranches = branches.filter((branch) => branch.is_active).length;
  const status = subscriptionFieldsAvailable ? normalizeSubscriptionStatus(organization?.subscription_status) : null;
  const currentPeriodEnd = organization?.subscription_current_period_end ?? null;
  const billingMode = organization?.subscription_billing_mode ?? "recurring";
  const currentPlan = getBillingPlan(organization?.subscription_plan);
  const platformAdmin = createAdminClient();
  const operations = platformAdmin
    ? await readPlatformOperations(platformAdmin)
    : {
      catalog: { currency: "PHP" as const, monthlyPriceCentavos: DEFAULT_MONTHLY_PRICE_CENTAVOS, variants: [], schemaAvailable: false },
      policies: { ...DEFAULT_PLATFORM_POLICIES, schemaAvailable: false },
    };
  const catalog = operations.catalog.schemaAvailable
    ? operations.catalog
    : { ...operations.catalog, variants: [] };
  const currentVariant = findCurrentBillingVariant(catalog.variants, organization);
  const policyGateOpen = operations.policies.schemaAvailable && isPolicyGateOpen(operations.policies);
  const paymongo = payMongoConfiguration();
  const paymongoSubscriptionReadiness = await readPayMongoSubscriptionReadiness();
  const providerReady = policyGateOpen && paymongo.secretKeyConfigured && paymongo.publicKeyConfigured && paymongo.keyModeConsistent && paymongo.webhookSecretConfigured && paymongo.subscriptionsEnabled && paymongoSubscriptionReadiness.subscriptionsApiAvailable === true && hasSubscriptionPaymentMethod(paymongoSubscriptionReadiness.subscriptionPaymentMethods);
  const qrPhCapabilityReady = paymongoSubscriptionReadiness.subscriptionPaymentMethods?.some((method) => method.toLowerCase() === "qrph") === true;
  const temporaryQrPhReady = subscriptionFieldsAvailable && policyGateOpen && paymongo.secretKeyConfigured && paymongo.webhookSecretConfigured && paymongo.temporaryQrPhEnabled && qrPhCapabilityReady;
  const providerDetail = "Online payment is not available right now. Please try again later or contact support.";
  const temporaryQrPhDetail = "Online payment is not available right now. Please try again later or contact support.";
  const annualAutoRenewalAllowed = operations.policies.billing.settings.annualRenewal !== "manual_review";
  const monthlyPriceLabel = catalog.schemaAvailable ? formatPeso(catalog.monthlyPriceCentavos) : "Unavailable";
  const offeredVariants = catalog.variants.filter((variant) => variant.isActive && (variant.intervalUnit !== "year" || annualAutoRenewalAllowed));
  const checkoutVariants = offeredVariants
    .filter((variant): variant is typeof variant & { id: string } => Boolean(variant.id))
    .map((variant) => ({
      id: variant.id,
      label: variant.label,
      priceLabel: billingVariantPriceLabel(catalog, variant),
      cadenceLabel: variant.intervalUnit === "month" ? "per month" : `for ${variant.intervalCount} ${variant.intervalCount === 1 ? "year" : "years"}`,
      monthlyEquivalentLabel: formatPeso(billingVariantMonthlyEquivalent(catalog, variant)),
      discountPercent: variant.discountPercent,
      baseAmountCentavos: calculateBillingVariantPrice(catalog.monthlyPriceCentavos, variant.intervalUnit, variant.intervalCount, variant.discountPercent),
    }));
  const trialDays = operations.policies.schemaAvailable
    ? readPolicyNumber(operations.policies.billing, "trialDays", 14)
    : 14;
  const trial = readTrialLifecycle({
    status: organization?.subscription_status,
    createdAt: organization?.created_at,
    trialStartedAt: organization?.subscription_trial_started_at,
    trialEndsAt: organization?.subscription_trial_ends_at,
    currentPeriodEnd: status === "trialing" ? currentPeriodEnd : null,
    providerSubscriptionId: organization?.subscription_provider_subscription_id,
    providerPaymentIntentId: organization?.subscription_provider_payment_intent_id,
    trialDays,
  });
  const trialAccessIsCurrent = status === "trialing" && trial.known && trial.isActive;
  const currentAccessIsValid = (
    (status === "active" && (billingMode !== "temporary_qrph" || isBillingPeriodCurrent(currentPeriodEnd)))
    || trialAccessIsCurrent
  );
  const showCheckout = status !== "active" || !currentAccessIsValid;
  const feedbackResult = trial.isLastDay || trial.isExpired
    ? await supabase.from("trial_feedback").select("id").eq("org_id", profile.org_id).maybeSingle()
    : null;
  const feedbackSubmitted = Boolean(feedbackResult?.data) && !feedbackResult?.error;

  return (
    <main className="admin-page min-h-screen bg-bg px-4 pb-10 pt-4 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <AdminPageHeader title="Billing & Plan">
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <section className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Account billing</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">Your plan, at a glance.</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Manage your Dumala POS plan and keep every branch, staff member, and sale moving smoothly.</p>
          </div>
          <div className="flex items-center gap-2 rounded-pill bg-primary-soft px-3 py-2 text-xs font-extrabold text-primary"><AdminIcon name="wallet" size={15} /> {organization?.name ?? "Your business"}</div>
        </section>

        {(!subscriptionFieldsAvailable || !catalog.schemaAvailable) && <div role="status" className="mt-4 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">Billing details are still being set up. Please contact support if this message continues.</div>}

        <CurrentPlanCard
          status={status}
          accessIsCurrent={currentAccessIsValid}
          trial={trial}
          plan={currentPlan}
          variant={currentVariant}
          catalog={catalog}
          currentPeriodEnd={currentPeriodEnd}
          billingMode={billingMode}
          activeBranches={activeBranches}
          totalBranches={branches.length}
          monthlyPriceLabel={monthlyPriceLabel}
        />

        {trial.reminder && <TrialReminder trial={trial} monthlyPriceLabel={monthlyPriceLabel} />}
        {(trial.isLastDay || trial.isExpired) && <TrialFeedbackForm submitted={feedbackSubmitted} />}

        {showCheckout && (
          <section className="mt-5 rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" aria-labelledby="checkout-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Secure payment</p>
                <h2 id="checkout-heading" className="mt-1 text-xl font-extrabold">Start your Premium plan.</h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Choose a plan, apply a code if you have one, and pay securely. Every branch and staff account stays covered.</p>
              </div>
              {!annualAutoRenewalAllowed && <span className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-extrabold text-ink">Annual renewal is currently manual</span>}
            </div>
            {providerReady ? (
              <SubscriptionCheckout variants={checkoutVariants} policyGateOpen={policyGateOpen} providerReady={providerReady} providerDetail={providerDetail} publicKey={paymongo.publicKey} apiBaseUrl={paymongo.apiBaseUrl} ownerEmail={user.email ?? ""} />
            ) : (
              <TemporaryQrPhCheckout variants={checkoutVariants} policyGateOpen={policyGateOpen} providerReady={temporaryQrPhReady} providerDetail={temporaryQrPhDetail} />
            )}
          </section>
        )}

        {showCheckout && <BillingSteps trial={status === "trialing" && trial.isActive} />}
      </div>
    </main>
  );
}

function CurrentPlanCard({
  status,
  accessIsCurrent,
  trial,
  plan,
  variant,
  catalog,
  currentPeriodEnd,
  billingMode,
  activeBranches,
  totalBranches,
  monthlyPriceLabel,
}: {
  status: SubscriptionStatus | null;
  accessIsCurrent: boolean;
  trial: TrialLifecycle;
  plan: BillingPlan;
  variant: BillingVariant | null;
  catalog: BillingCatalog;
  currentPeriodEnd: string | null;
  billingMode: "recurring" | "temporary_qrph";
  activeBranches: number;
  totalBranches: number;
  monthlyPriceLabel: string;
}) {
  const trialExpired = status === "paused" && trial.isExpired;
  const isTrialing = status === null || status === "trialing" || trialExpired;
  const isTrial = isTrialing && !trialExpired;
  const isActive = status === "active" && accessIsCurrent;
  const accessEnded = status === "active" && !accessIsCurrent;
  const isRecurring = billingMode !== "temporary_qrph";
  const statusLabel = isActive ? "Active" : trialExpired ? "Trial ended" : isTrial ? "Trial active" : accessEnded ? "Access ended" : status ? subscriptionStatusLabel(status) : "Not connected";
  const title = trialExpired ? "Trial ended" : isTrial ? "Premium trial" : "Premium";
  const summary = isActive
    ? "Your Premium plan is active across every branch and staff account."
    : trialExpired
      ? "Your 14-day trial has ended. Subscribe to keep the complete Premium workspace available."
    : isTrial
      ? "Your 14-day trial includes the complete Premium workspace."
      : accessEnded
        ? "Your Premium access has ended. Choose a plan below to continue using every feature."
        : "Review your billing details and choose a plan when you are ready.";
  const totalPriceLabel = variant ? billingVariantPriceLabel(catalog, variant) : monthlyPriceLabel;
  const monthlyEquivalentLabel = variant ? formatPeso(billingVariantMonthlyEquivalent(catalog, variant)) : monthlyPriceLabel;
  const variantLabel = variant?.label ?? "Monthly";
  const planCadence = variant?.intervalUnit === "year" ? `Paid for ${variant.intervalCount} ${variant.intervalCount === 1 ? "year" : "years"}` : "Billed monthly";
  const timingLabel = trialExpired ? "Trial ended" : isTrialing ? "Trial ends" : isRecurring ? "Next billing" : "Access through";
  const timingValue = isTrialing
    ? trial.endsAt ? formatBillingDate(trial.endsAt) : "14 days included"
    : currentPeriodEnd ? formatBillingDate(currentPeriodEnd) : "Not scheduled";
  const cardTone = isActive
    ? "border-primary/20 bg-primary text-primary-fg shadow-[var(--shadow-pop)]"
    : isTrial
      ? "border-accent/30 bg-secondary text-ink shadow-[var(--shadow-card)]"
      : "border-line bg-surface text-ink shadow-[var(--shadow-card)]";
  const mutedTone = isActive ? "text-primary-fg/72" : "text-ink-muted";

  return (
    <section className={`relative mt-5 overflow-hidden rounded-card border ${cardTone}`} aria-labelledby="current-plan-heading">
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(260px,0.88fr)]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isActive ? "bg-accent text-accent-fg" : "bg-primary text-primary-fg"}`}><AdminIcon name="wallet" size={19} /></span>
              <div>
                <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${isActive ? "text-primary-fg/65" : "text-accent"}`}>Current plan</p>
                <h2 id="current-plan-heading" className="mt-1 text-2xl font-extrabold tracking-[-0.04em]">{title}</h2>
              </div>
            </div>
            <span className={`rounded-pill px-3 py-1.5 text-xs font-extrabold ${isActive ? "bg-primary-fg/15 text-primary-fg" : isTrial ? "bg-primary/10 text-primary" : "bg-warning/15 text-ink"}`}>{statusLabel}</span>
          </div>

          <p className={`mt-3 max-w-xl text-sm leading-5 ${mutedTone}`}>{summary}</p>

          <div className={`mt-4 grid gap-2 border-t pt-3 sm:grid-cols-3 ${isActive ? "border-primary-fg/15" : "border-line"}`}>
            <PlanMetric inverse={isActive} label={isTrialing ? "Trial remaining" : "Plan"} value={isTrialing ? formatTrialRemaining(trial.remainingMs) : variantLabel} detail={isTrialing ? "Live countdown below" : planCadence} />
            <PlanMetric inverse={isActive} label={isTrialing ? "Starting price" : "Monthly equivalent"} value={isTrialing ? monthlyPriceLabel : monthlyEquivalentLabel} detail={isTrialing ? "Monthly billing" : variant?.discountPercent ? `${variant.discountPercent}% plan savings` : "Premium rate"} />
            <PlanMetric inverse={isActive} label={timingLabel} value={timingValue} detail={isTrialing ? "All features included" : isRecurring ? "Automatic renewal" : "Renew before this date"} />
          </div>

          {isTrialing && trial.known && trial.endsAt && trial.remainingMs !== null && <TrialCountdown endsAt={trial.endsAt} initialRemainingMs={trial.remainingMs} inverse={isActive} />}

          {isActive && <p className={`mt-5 text-xs leading-5 ${mutedTone}`}>Current total: <strong className={isActive ? "text-primary-fg" : "text-ink"}>{totalPriceLabel}</strong>{variant?.intervalUnit === "year" ? ` for ${variant.intervalCount} ${variant.intervalCount === 1 ? "year" : "years"}` : " per month"} · {activeBranches} of {totalBranches} branches active.</p>}
        </div>

        <aside className="rounded-xl border border-primary/10 bg-primary/5 p-4" aria-label="Premium plan features">
          <div className="flex items-center justify-between gap-3">
            <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${isActive ? "text-primary-fg/65" : "text-accent"}`}>Included with Premium</p>
            <AdminIcon name="star" size={17} />
          </div>
          <ul className={`mt-3 grid gap-2 text-sm leading-5 ${mutedTone}`}>
            {plan.features.map((feature) => <li key={feature} className="flex gap-2.5"><AdminIcon name="check" size={16} /><span>{feature}</span></li>)}
          </ul>
        </aside>
      </div>
    </section>
  );
}

function TrialReminder({ trial, monthlyPriceLabel }: { trial: TrialLifecycle; monthlyPriceLabel: string }) {
  if (!trial.reminder || trial.remainingDays === null) return null;

  const isLastDay = trial.reminder === "last_day";
  const daysLabel = trial.remainingDays === 1 ? "less than a day" : `${trial.remainingDays} days`;

  return (
    <section className={`mt-5 rounded-card border px-5 py-4 sm:px-6 ${isLastDay ? "border-danger/30 bg-danger-soft" : "border-warning/30 bg-warning/10"}`} role="status" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isLastDay ? "bg-danger text-white" : "bg-warning text-white"}`}><AdminIcon name="bell" size={17} /></span>
          <div>
            <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${isLastDay ? "text-danger" : "text-accent"}`}>Trial reminder</p>
            <h2 className="mt-1 text-base font-extrabold text-ink">Your trial ends in {daysLabel}.</h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">Subscribe to Premium at {monthlyPriceLabel}/month to keep every branch, staff member, and feature active.</p>
          </div>
        </div>
        <Link href="#checkout-heading" className="inline-flex shrink-0 items-center justify-center rounded-btn bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Choose Premium</Link>
      </div>
    </section>
  );
}

function BillingSteps({ trial }: { trial: boolean }) {
  return (
    <section className="mt-5 rounded-xl border border-line bg-surface-raised p-4" aria-labelledby="billing-steps-heading">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="check" size={17} /></span>
        <div>
          <h2 id="billing-steps-heading" className="text-base font-extrabold">{trial ? "Your trial is ready when you are." : "Continue with Premium."}</h2>
          <p className="mt-1 text-sm leading-5 text-ink-muted">Choose a plan, complete your payment, and keep your complete POS workspace available for every branch and staff member.</p>
        </div>
      </div>
    </section>
  );
}

function PlanMetric({ label, value, detail, inverse }: { label: string; value: string; detail: string; inverse: boolean }) {
  return <div className={`rounded-xl border p-3 ${inverse ? "border-primary-fg/15 bg-primary-fg/10" : "border-line bg-surface-raised/60"}`}><p className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${inverse ? "text-primary-fg/60" : "text-ink-subtle"}`}>{label}</p><strong className="mt-1 block truncate text-sm">{value}</strong><span className={`mt-0.5 block truncate text-xs ${inverse ? "text-primary-fg/65" : "text-ink-muted"}`}>{detail}</span></div>;
}

function findCurrentBillingVariant(variants: BillingVariant[], organization: OrganizationRecord | null) {
  const storedVariant = organization?.subscription_billing_variant_id
    ? variants.find((variant) => variant.id === organization.subscription_billing_variant_id)
    : null;
  if (storedVariant) return storedVariant;

  const providerVariant = organization?.subscription_provider_plan_id
    ? variants.find((variant) => variant.paymongoPlanId === organization.subscription_provider_plan_id)
    : null;
  if (providerVariant) return providerVariant;

  return variants.find((variant) => variant.intervalUnit === "month" && variant.intervalCount === 1) ?? variants[0] ?? null;
}

function BillingMessage({ title, detail }: { title: string; detail: string }) {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">{title}</h1><p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p><Link href="/admin" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Back to dashboard</Link></div></main>;
}
