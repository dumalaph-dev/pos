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
import { isComplimentaryAccessCurrent } from "@/lib/platform-access";
import { readCurrentComplimentaryAccess } from "@/lib/platform-access-server";
import { calculateAdditionalBranchPriceQuote, calculateCatalogVariantPriceQuote, DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS, DEFAULT_INCLUDED_BRANCH_COUNT, DEFAULT_MONTHLY_PRICE_CENTAVOS, DEFAULT_PLATFORM_POLICIES, hasSubscriptionPaymentMethod, isPolicyGateOpen, MAX_BRANCH_ENTITLEMENT, readPolicyNumber, type BillingCatalog, type BillingVariant } from "@/lib/platform-operations";
import { payMongoConfiguration, readPayMongoSubscriptionReadiness, readPlatformOperations } from "@/lib/platform-operations-server";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { readTrialLifecycle, type TrialLifecycle } from "@/lib/trial";
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
  subscription_entitled_branch_count?: number | null;
};

type BranchRecord = { id: string; is_active: boolean };
type QueryValue = string | string[] | undefined;

function readParam(value: QueryValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readBranchCount(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_BRANCH_ENTITLEMENT ? parsed : null;
}

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: QueryValue; target?: QueryValue }>;
}) {
  const params = await searchParams;
  const additionalBranchRequested = readParam(params.reason) === "additional_branch";
  const requestedTargetBranchCount = readBranchCount(readParam(params.target));
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (!profile) return <BillingMessage title="Your admin profile is not ready." detail="Ask an organization admin to finish your profile before opening billing settings." />;
  if (profile.role !== "admin") return <BillingMessage title="Owner access required" detail="Only the business owner can manage the organization plan and subscription." />;

  const supabase = await createClient();
  const richResult = await supabase
    .from("organizations")
    .select("id, name, currency, created_at, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_updated_at, subscription_billing_mode, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_entitled_branch_count")
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
      catalog: { currency: "PHP" as const, monthlyPriceCentavos: DEFAULT_MONTHLY_PRICE_CENTAVOS, additionalBranchPriceCentavos: DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS, includedBranchCount: DEFAULT_INCLUDED_BRANCH_COUNT, variants: [], schemaAvailable: false },
      policies: { ...DEFAULT_PLATFORM_POLICIES, schemaAvailable: false },
    };
  const catalog = operations.catalog.schemaAvailable
    ? operations.catalog
    : { ...operations.catalog, variants: [] };
  const currentVariant = findCurrentBillingVariant(catalog.variants, organization);
  const complimentaryAccess = platformAdmin ? await readCurrentComplimentaryAccess(platformAdmin, profile.org_id) : null;
  const complimentaryAccessIsCurrent = Boolean(complimentaryAccess && isComplimentaryAccessCurrent(complimentaryAccess.until));
  const policyGateOpen = operations.policies.schemaAvailable && isPolicyGateOpen(operations.policies);
  const paymongo = payMongoConfiguration();
  const paymongoSubscriptionReadiness = await readPayMongoSubscriptionReadiness();
  const providerReady = policyGateOpen && paymongo.secretKeyConfigured && paymongo.publicKeyConfigured && paymongo.keyModeConsistent && paymongo.webhookSecretConfigured && paymongo.subscriptionsEnabled && paymongoSubscriptionReadiness.subscriptionsApiAvailable === true && hasSubscriptionPaymentMethod(paymongoSubscriptionReadiness.subscriptionPaymentMethods);
  const configuredPaymentMethods = paymongoSubscriptionReadiness.subscriptionPaymentMethods?.map((method) => method.toLowerCase()) ?? [];
  const qrPhCapabilityReady = configuredPaymentMethods.includes("qrph");
  const cardCapabilityReady = configuredPaymentMethods.includes("card") || configuredPaymentMethods.includes("cards");
  const providerDetail = "Online payment is not available right now. Please try again later or contact support.";
  const temporaryQrPhDetail = "Online payment is not available right now. Please try again later or contact support.";
  const annualAutoRenewalAllowed = operations.policies.billing.settings.annualRenewal !== "manual_review";
  const monthlyPriceLabel = catalog.schemaAvailable ? formatPeso(catalog.monthlyPriceCentavos) : "Unavailable";
  const offeredVariants = catalog.variants.filter((variant) => variant.isActive && (variant.intervalUnit !== "year" || annualAutoRenewalAllowed));
  const prepaidAccessIsCurrent = status === "active" && billingMode === "temporary_qrph" && isBillingPeriodCurrent(currentPeriodEnd);
  const paidBranchEntitlement = Math.max(Number(organization?.subscription_entitled_branch_count) || catalog.includedBranchCount, catalog.includedBranchCount);
  const prepaidCapacityBase = Math.max(paidBranchEntitlement, activeBranches, 1);
  const targetActiveBranchCount = additionalBranchRequested
    ? Math.min(Math.max(activeBranches, 1) + 1, Math.max(requestedTargetBranchCount ?? 0, Math.max(activeBranches, 1) + 1), MAX_BRANCH_ENTITLEMENT)
    : prepaidAccessIsCurrent
      ? Math.min(prepaidCapacityBase + 1, MAX_BRANCH_ENTITLEMENT)
      : Math.max(activeBranches, 1);
  const additionalBranchAlreadyCovered = additionalBranchRequested && targetActiveBranchCount <= paidBranchEntitlement;
  const additionalBranchCheckout = additionalBranchRequested && prepaidAccessIsCurrent && targetActiveBranchCount > paidBranchEntitlement;
  const prepaidCapacityCheckout = prepaidAccessIsCurrent && targetActiveBranchCount > paidBranchEntitlement;
  const branchCheckout = additionalBranchCheckout || prepaidCapacityCheckout;
  const prepaidTermVariants = currentVariant?.id ? [currentVariant] : [];
  const checkoutSourceVariants = branchCheckout && prepaidTermVariants.length > 0 ? prepaidTermVariants : offeredVariants;
  const checkoutVariants = checkoutSourceVariants
      .filter((variant): variant is typeof variant & { id: string } => Boolean(variant.id))
    .map((variant) => {
      const quote = branchCheckout
        ? calculateAdditionalBranchPriceQuote(catalog, variant, Math.max(paidBranchEntitlement, activeBranches), targetActiveBranchCount)
        : calculateCatalogVariantPriceQuote(catalog, variant, additionalBranchRequested ? targetActiveBranchCount : activeBranches);
      return {
        id: variant.id,
        label: variant.label,
        priceLabel: formatPeso(quote.termTotalCentavos),
        cadenceLabel: branchCheckout
          ? "one-time for prepaid term"
          : variant.intervalUnit === "month" ? "per month" : `for ${variant.intervalCount} ${variant.intervalCount === 1 ? "year" : "years"}`,
        monthlyEquivalentLabel: formatPeso(quote.monthlyEquivalentCentavos),
        discountPercent: variant.discountPercent,
        baseAmountCentavos: quote.termTotalCentavos,
        activeBranchCount: quote.activeBranchCount,
        billableBranchCount: quote.billableBranchCount,
        intervalUnit: variant.intervalUnit,
        intervalCount: variant.intervalCount,
      };
    });
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
    || complimentaryAccessIsCurrent
  );
  const showCheckout = branchCheckout || status !== "active" || !currentAccessIsValid;
  const temporaryQrPhReady = subscriptionFieldsAvailable
    && policyGateOpen
    && paymongo.secretKeyConfigured
    && paymongo.webhookSecretConfigured
    && paymongo.temporaryQrPhEnabled
    && (branchCheckout ? qrPhCapabilityReady || cardCapabilityReady : qrPhCapabilityReady);
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

        {additionalBranchRequested && <section role="alert" className={`mt-5 rounded-card border px-4 py-4 text-sm text-ink shadow-[var(--shadow-card)] ${additionalBranchAlreadyCovered ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{additionalBranchAlreadyCovered ? "Branch capacity available" : "Branch capacity payment required"}</p><h2 className="mt-1 text-base font-extrabold">{additionalBranchAlreadyCovered ? "Your next branch is ready to create." : "Complete billing before adding another active location."}</h2><p className="mt-1 max-w-2xl leading-5 text-ink-muted">{additionalBranchAlreadyCovered ? <>Your paid entitlement covers {paidBranchEntitlement} active branch{paidBranchEntitlement === 1 ? "" : "es"}. Return to Branches to create the location.</> : additionalBranchCheckout ? <>Your prepaid plan covers {paidBranchEntitlement} active branch{paidBranchEntitlement === 1 ? "" : "es"}. Pay <strong className="text-ink">{checkoutVariants[0]?.priceLabel ?? formatPeso(catalog.additionalBranchPriceCentavos)}</strong> to bring paid capacity to {targetActiveBranchCount} branches, then return to Branches to create them.</> : "Your current access does not cover another active branch. Choose a Premium plan and complete payment below, then return to Branches to create the location. Paid subscriptions apply the additional-branch charge to the next billing cycle."}</p>{additionalBranchAlreadyCovered ? <Link href="/admin/branches" className="mt-3 inline-flex rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Return to Branches</Link> : showCheckout && <Link href="#checkout-heading" className="mt-3 inline-flex rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Continue to payment</Link>}</section>}

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
          branchEntitlement={paidBranchEntitlement}
          monthlyPriceLabel={monthlyPriceLabel}
          complimentaryAccessUntil={complimentaryAccessIsCurrent ? complimentaryAccess?.until ?? null : null}
        />

        {trial.reminder && !complimentaryAccessIsCurrent && <TrialReminder trial={trial} monthlyPriceLabel={monthlyPriceLabel} />}
        {(trial.isLastDay || trial.isExpired) && <TrialFeedbackForm submitted={feedbackSubmitted} />}

        {showCheckout && (
          <section className="mt-5 rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5" aria-labelledby="checkout-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Secure payment</p>
                <h2 id="checkout-heading" className="mt-1 text-xl font-extrabold">{branchCheckout ? "Add branch capacity." : "Start your Premium plan."}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">{branchCheckout ? "Choose your prepaid term and add the branch slots you need. Your current prepaid period stays unchanged." : "Choose a plan, add branch slots if needed, and pay securely. The order summary below shows the one amount due."}</p>
              </div>
              {!annualAutoRenewalAllowed && <span className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-extrabold text-ink">Annual renewal is currently manual</span>}
            </div>
            {branchCheckout ? (
              <TemporaryQrPhCheckout variants={checkoutVariants} branchPricing={{ catalog, activeBranchCount: activeBranches, entitledBranchCount: paidBranchEntitlement, mode: "additional_branch", maxBranchCount: MAX_BRANCH_ENTITLEMENT }} policyGateOpen={policyGateOpen} providerReady={temporaryQrPhReady} providerDetail={temporaryQrPhDetail} purpose="additional_branch" targetActiveBranchCount={targetActiveBranchCount} />
            ) : providerReady ? (
              <SubscriptionCheckout variants={checkoutVariants} branchPricing={{ catalog, activeBranchCount: activeBranches, entitledBranchCount: paidBranchEntitlement, mode: "subscription", maxBranchCount: MAX_BRANCH_ENTITLEMENT }} policyGateOpen={policyGateOpen} providerReady={providerReady} providerDetail={providerDetail} publicKey={paymongo.publicKey} apiBaseUrl={paymongo.apiBaseUrl} ownerEmail={user.email ?? ""} targetActiveBranchCount={additionalBranchRequested ? targetActiveBranchCount : undefined} />
            ) : (
              <TemporaryQrPhCheckout variants={checkoutVariants} branchPricing={{ catalog, activeBranchCount: activeBranches, entitledBranchCount: paidBranchEntitlement, mode: "subscription", maxBranchCount: MAX_BRANCH_ENTITLEMENT }} policyGateOpen={policyGateOpen} providerReady={temporaryQrPhReady} providerDetail={temporaryQrPhDetail} purpose="subscription" targetActiveBranchCount={additionalBranchRequested ? targetActiveBranchCount : undefined} />
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
  branchEntitlement,
  monthlyPriceLabel,
  complimentaryAccessUntil,
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
  branchEntitlement: number;
  monthlyPriceLabel: string;
  complimentaryAccessUntil: string | null;
}) {
  const complimentaryAccessIsCurrent = isComplimentaryAccessCurrent(complimentaryAccessUntil);
  const trialExpired = status === "paused" && trial.isExpired && !complimentaryAccessIsCurrent;
  const isTrialing = !complimentaryAccessIsCurrent && (status === null || status === "trialing" || trialExpired);
  const isTrial = isTrialing && !trialExpired;
  const isActive = status === "active" && accessIsCurrent;
  const accessEnded = status === "active" && !accessIsCurrent;
  const isComplimentary = complimentaryAccessIsCurrent && !isActive && !isTrial;
  const isRecurring = billingMode !== "temporary_qrph";
  const statusLabel = isActive ? "Active" : isComplimentary ? "Complimentary Premium" : trialExpired ? "Trial ended" : isTrial ? "Trial active" : accessEnded ? "Access ended" : status ? subscriptionStatusLabel(status) : "Not connected";
  const title = isComplimentary ? "Complimentary Premium" : trialExpired ? "Trial ended" : isTrial ? "Premium trial" : "Premium";
  const summary = isActive
    ? "Your Premium plan is active across every branch and staff account."
    : isComplimentary
      ? `Platform-owned access is active through ${complimentaryAccessUntil ? formatBillingDate(complimentaryAccessUntil) : "the grant end date"}. You can subscribe at any time to continue without an entitlement gap.`
    : trialExpired
      ? "Your 14-day trial has ended. Subscribe to keep the complete Premium workspace available."
    : isTrial
      ? "Your 14-day trial includes Premium workspace access for the included branch. Additional active branches require a paid plan."
      : accessEnded
        ? "Your Premium access has ended. Choose a plan below to continue using every feature."
        : "Review your billing details and choose a plan when you are ready.";
  const currentQuote = variant ? calculateCatalogVariantPriceQuote(catalog, variant, activeBranches) : null;
  const monthlyEquivalentLabel = currentQuote ? formatPeso(currentQuote.monthlyEquivalentCentavos) : monthlyPriceLabel;
  const timingLabel = isComplimentary ? "Access through" : trialExpired ? "Trial ended" : isTrialing ? "Trial ends" : isRecurring ? "Next billing" : "Access through";
  const timingValue = isComplimentary
    ? complimentaryAccessUntil ? formatBillingDate(complimentaryAccessUntil) : "Grant end date"
    : isTrialing
    ? trial.endsAt ? formatBillingDate(trial.endsAt) : "14 days included"
    : currentPeriodEnd ? formatBillingDate(currentPeriodEnd) : "Not scheduled";
  const branchDirectoryTotal = Math.max(totalBranches, activeBranches, 1);
  const effectiveBranchEntitlement = Math.max(branchEntitlement, activeBranches, 1);
  const branchCoverage = Math.min(Math.round((activeBranches / effectiveBranchEntitlement) * 100), 100);
  const paidAddOnBranches = Math.max(effectiveBranchEntitlement - catalog.includedBranchCount, 0);
  const branchBillingDetail = paidAddOnBranches > 0
    ? `${catalog.includedBranchCount} included · ${paidAddOnBranches} paid add-on${paidAddOnBranches === 1 ? "" : "s"}`
    : "Included with Premium · add slots in checkout";
  const cardTone = isActive || isComplimentary
    ? "border-primary/20 bg-gradient-to-br from-primary via-primary to-primary-hover text-primary-fg shadow-[var(--shadow-pop)]"
    : isTrial
      ? "border-accent/30 bg-secondary text-ink shadow-[var(--shadow-card)]"
      : "border-line bg-surface text-ink shadow-[var(--shadow-card)]";
  const mutedTone = isActive || isComplimentary ? "text-primary-fg/72" : "text-ink-muted";

  return (
    <section className={`relative mt-5 overflow-hidden rounded-[22px] border ${cardTone}`} aria-labelledby="current-plan-heading">
      {(isActive || isComplimentary) && <>
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-px w-2/3 bg-gradient-to-r from-accent/75 to-transparent" />
      </>}
      <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1.12fr)_minmax(280px,0.88fr)]">
        <div>
          <div className="p-5 sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isActive || isComplimentary ? "bg-accent text-accent-fg shadow-[0_8px_20px_rgba(188,150,87,0.24)]" : "bg-primary text-primary-fg"}`}><AdminIcon name="wallet" size={20} /></span>
              <div>
                <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${isActive ? "text-primary-fg/65" : "text-accent"}`}>Current plan</p>
                <h2 id="current-plan-heading" className="mt-1 text-2xl font-extrabold tracking-[-0.04em]">{title}</h2>
              </div>
            </div>
              <span className={`rounded-pill px-3 py-1.5 text-xs font-extrabold ${isActive || isComplimentary ? "bg-primary-fg/15 text-primary-fg ring-1 ring-inset ring-primary-fg/15" : isTrial ? "bg-primary/10 text-primary" : "bg-warning/15 text-ink"}`}>{statusLabel}</span>
            </div>

            <p className={`mt-4 max-w-xl text-sm leading-6 ${mutedTone}`}>{summary}</p>

            <div className={`mt-6 grid gap-3 border-t pt-5 sm:grid-cols-3 ${isActive || isComplimentary ? "border-primary-fg/15" : "border-line"}`}>
              <BranchUsageMetric activeBranches={activeBranches} totalBranches={effectiveBranchEntitlement} directoryTotal={branchDirectoryTotal} coverage={branchCoverage} detail={branchBillingDetail} inverse={isActive || isComplimentary} />
              <PlanMetric inverse={isActive || isComplimentary} label={isComplimentary ? "Plan" : isTrialing ? "Starting price" : "Monthly equivalent"} value={isComplimentary ? "Premium" : isTrialing ? monthlyPriceLabel : monthlyEquivalentLabel} detail={isComplimentary ? "No provider charge" : isTrialing ? "Monthly billing" : variant?.discountPercent ? `${variant.discountPercent}% plan savings` : "Premium rate"} />
              <PlanMetric inverse={isActive || isComplimentary} label={timingLabel} value={timingValue} detail={isComplimentary ? "Subscribe before this date" : isTrialing ? "All features included" : isRecurring ? "Automatic renewal" : "Renew before this date"} />
            </div>

            {isTrialing && trial.known && trial.endsAt && trial.remainingMs !== null && <TrialCountdown endsAt={trial.endsAt} initialRemainingMs={trial.remainingMs} inverse={isActive} />}

            {isActive && <div className={`mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 ${mutedTone}`}><span>{activeBranches} active branch{activeBranches === 1 ? "" : "es"}</span><span className="text-primary-fg/40" aria-hidden="true">·</span><span>{effectiveBranchEntitlement} paid capacity{effectiveBranchEntitlement === 1 ? " slot" : " slots"}</span><span className="text-primary-fg/40" aria-hidden="true">·</span><span>Manage add-ons below</span></div>}
            {isComplimentary && <p className={`mt-5 text-xs leading-5 ${mutedTone}`}>Complimentary access covers {activeBranches} of {totalBranches} active branches. Subscription checkout remains available before the grant ends.</p>}
          </div>
        </div>

        <aside className={`border-t p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7 ${isActive || isComplimentary ? "border-primary-fg/15" : "border-primary/10"}`} aria-label="Premium plan features">
          <div className={`rounded-2xl border p-4 sm:p-5 ${isActive || isComplimentary ? "border-primary-fg/12 bg-primary-fg/10" : "border-primary/10 bg-primary/5"}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${isActive || isComplimentary ? "text-primary-fg/65" : "text-accent"}`}>Included with Premium</p>
                <p className={`mt-1 text-sm font-extrabold ${isActive || isComplimentary ? "text-primary-fg" : "text-ink"}`}>Everything your team needs to operate.</p>
              </div>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isActive || isComplimentary ? "bg-accent text-accent-fg" : "bg-primary text-primary-fg"}`}><AdminIcon name="star" size={17} /></span>
            </div>
            <ul className={`mt-4 grid gap-2.5 text-sm leading-5 ${mutedTone}`}>
              {plan.features.map((feature) => <li key={feature} className="flex gap-2.5"><AdminIcon name="check" size={16} /><span>{feature}</span></li>)}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

function BranchUsageMetric({ activeBranches, totalBranches, directoryTotal, coverage, detail, inverse }: { activeBranches: number; totalBranches: number; directoryTotal: number; coverage: number; detail: string; inverse: boolean }) {
  const labelTone = inverse ? "text-primary-fg/70" : "text-accent";
  const detailTone = inverse ? "text-primary-fg/65" : "text-ink-muted";
  const shellTone = inverse ? "border-accent/40 bg-accent/12" : "border-accent/30 bg-accent/10";
  const iconTone = inverse ? "bg-accent text-accent-fg" : "bg-accent/15 text-accent";

  return <div className={`rounded-2xl border p-3.5 sm:p-4 ${shellTone}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${labelTone}`}>Branches active</p>
        <p className="mt-1 flex items-baseline gap-1 whitespace-nowrap"><strong className="text-2xl font-extrabold tracking-[-0.04em]">{activeBranches}</strong><span className={`text-sm font-bold ${detailTone}`}>/ {totalBranches}</span></p>
      </div>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${iconTone}`}><AdminIcon name="branches" size={16} /></span>
    </div>
    <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${inverse ? "bg-primary-fg/15" : "bg-accent/15"}`} role="progressbar" aria-label={`${activeBranches} of ${totalBranches} paid branch entitlement active; ${directoryTotal} branches in directory`} aria-valuemin={0} aria-valuemax={totalBranches} aria-valuenow={Math.min(activeBranches, totalBranches)}>
      <span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${coverage}%` }} />
    </div>
    <p className={`mt-2 truncate text-[10px] font-semibold ${detailTone}`} title={detail}>{detail}</p>
  </div>;
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
