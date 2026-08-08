import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { getBillingPlan, formatBillingDate, normalizeSubscriptionStatus, subscriptionStatusLabel, subscriptionTone } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import { billingVariantPriceLabel, DEFAULT_BILLING_VARIANTS, DEFAULT_MONTHLY_PRICE_CENTAVOS, DEFAULT_PLATFORM_POLICIES, hasSubscriptionPaymentMethod, isPolicyGateOpen } from "@/lib/platform-operations";
import { payMongoConfiguration, readPayMongoSubscriptionReadiness, readPlatformOperations } from "@/lib/platform-operations-server";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import SubscriptionCheckout from "./SubscriptionCheckout";

type OrganizationRecord = {
  id: string;
  name: string;
  currency: string;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_current_period_end?: string | null;
  subscription_updated_at?: string | null;
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
    .select("id, name, currency, subscription_status, subscription_plan, subscription_current_period_end, subscription_updated_at")
    .eq("id", profile.org_id)
    .maybeSingle();

  let organization: OrganizationRecord | null = richResult.data as OrganizationRecord | null;
  const subscriptionFieldsAvailable = !richResult.error;
  if (richResult.error) {
    const fallback = await supabase.from("organizations").select("id, name, currency").eq("id", profile.org_id).maybeSingle();
    organization = fallback.data as OrganizationRecord | null;
  }

  const branchesResult = await supabase.from("stores").select("id, is_active").eq("org_id", profile.org_id);
  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const activeBranches = branches.filter((branch) => branch.is_active).length;
  const status = subscriptionFieldsAvailable ? normalizeSubscriptionStatus(organization?.subscription_status) : null;
  const currentPlan = getBillingPlan(organization?.subscription_plan);
  const platformAdmin = createAdminClient();
  const operations = platformAdmin
    ? await readPlatformOperations(platformAdmin)
    : {
      catalog: { currency: "PHP" as const, monthlyPriceCentavos: DEFAULT_MONTHLY_PRICE_CENTAVOS, variants: DEFAULT_BILLING_VARIANTS, schemaAvailable: false },
      policies: { ...DEFAULT_PLATFORM_POLICIES, schemaAvailable: false },
    };
  const catalog = operations.catalog;
  const policyGateOpen = operations.policies.schemaAvailable && isPolicyGateOpen(operations.policies);
  const paymongo = payMongoConfiguration();
  const paymongoSubscriptionReadiness = await readPayMongoSubscriptionReadiness();
  const providerReady = policyGateOpen && paymongo.secretKeyConfigured && paymongo.publicKeyConfigured && paymongo.keyModeConsistent && paymongo.webhookSecretConfigured && paymongo.subscriptionsEnabled && paymongoSubscriptionReadiness.subscriptionsApiAvailable === true && hasSubscriptionPaymentMethod(paymongoSubscriptionReadiness.subscriptionPaymentMethods);
  const providerDetail = !paymongo.secretKeyConfigured || !paymongo.publicKeyConfigured || !paymongo.keyModeConsistent || !paymongo.webhookSecretConfigured
    ? "The platform owner must configure matching PayMongo keys and the webhook signing secret before checkout can collect a payment."
    : !paymongo.subscriptionsEnabled || paymongoSubscriptionReadiness.subscriptionsApiAvailable !== true
      ? "Request PayMongo Subscriptions activation for this organization, then rerun the checkout preflight and keep PAYMONGO_SUBSCRIPTIONS_ENABLED=true only after access is confirmed."
      : !hasSubscriptionPaymentMethod(paymongoSubscriptionReadiness.subscriptionPaymentMethods)
        ? "Enable Visa/Mastercard cards or Maya for this PayMongo organization, then request Subscriptions activation for that payment method."
        : "PayMongo checkout is being prepared. Run the checkout preflight to verify the remaining provider settings.";
  const annualAutoRenewalAllowed = operations.policies.billing.settings.annualRenewal !== "manual_review";
  const monthlyPriceLabel = formatPeso(catalog.monthlyPriceCentavos);
  const offeredVariants = catalog.variants.filter((variant) => variant.isActive);
  const checkoutVariants = offeredVariants.filter((variant): variant is typeof variant & { id: string } => Boolean(variant.id) && (variant.intervalUnit !== "year" || annualAutoRenewalAllowed)).map((variant) => ({
    id: variant.id,
    label: variant.label,
    priceLabel: billingVariantPriceLabel(catalog, variant),
    cadenceLabel: variant.intervalUnit === "month" ? "/ month" : `/ ${variant.intervalCount} ${variant.intervalCount === 1 ? "year" : "years"}`,
    discountPercent: variant.discountPercent,
  }));

  return (
    <main className="admin-page min-h-screen bg-bg px-4 pb-12 pt-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <AdminPageHeader title="Billing & plan">
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <section className="mt-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Owner workspace</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">One plan. Everything included.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Every business gets the complete Premium workspace: {monthlyPriceLabel}/month after the 14-day free trial, with every branch and staff member included.</p>
          </div>
          <div className="flex items-center gap-2 rounded-pill bg-primary-soft px-3 py-2 text-xs font-extrabold text-primary"><AdminIcon name="wallet" size={15} /> {organization?.name ?? "Your business"}</div>
        </section>

        {(!subscriptionFieldsAvailable || !catalog.schemaAvailable) && <div role="status" className="mt-7 rounded-card border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold text-ink">{!subscriptionFieldsAvailable ? "Subscription tracking is not active yet. Apply migration 0025 before connecting checkout or recording plan changes." : "Pricing is using the default catalog until the platform operations migration is applied."}</div>}

        <section className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]" aria-labelledby="current-plan-heading">
          <div className="rounded-card border border-primary/20 bg-primary p-6 text-primary-fg shadow-[var(--shadow-pop)] sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary-fg/65">Current plan</p>
                <h2 id="current-plan-heading" className="mt-2 text-3xl font-extrabold">{currentPlan.name}</h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-primary-fg/75">{currentPlan.summary}</p>
              </div>
              {status && <span className="rounded-pill bg-primary-fg/15 px-3 py-1.5 text-xs font-extrabold text-primary-fg">{subscriptionStatusLabel(status)}</span>}
            </div>
            <div className="mt-7 grid gap-3 border-t border-primary-fg/15 pt-5 sm:grid-cols-3">
              <BillingMetric label="Branches" value={`${activeBranches} active`} detail={`${branches.length} total`} />
              <BillingMetric label="Price" value={`${monthlyPriceLabel}/month`} detail="One plan for every branch" />
              <BillingMetric label="Next review" value={subscriptionFieldsAvailable ? formatBillingDate(organization?.subscription_current_period_end) : "After setup"} detail={subscriptionFieldsAvailable ? "Current period" : "Migration required"} />
            </div>
          </div>

          <aside className="rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7" aria-labelledby="billing-status-heading">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Subscription status</p>
            <h2 id="billing-status-heading" className="mt-2 text-xl font-extrabold">{status ? subscriptionStatusLabel(status) : "Not connected"}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{status === "active" ? "Your workspace is on an active Premium subscription." : status === "trialing" ? "Your 14-day Premium trial is active while billing is being connected." : "Billing updates will appear here once the payment connection is enabled."}</p>
            {status && <span className={`mt-5 inline-flex rounded-pill px-3 py-1.5 text-xs font-extrabold ${subscriptionTone(status)}`}>{subscriptionStatusLabel(status)}</span>}
            <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-ink-muted">Last recorded update: {subscriptionFieldsAvailable ? formatBillingDate(organization?.subscription_updated_at) : "Not available"}</p>
          </aside>
        </section>

        <section className="mt-8" aria-labelledby="plans-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Premium plan</p>
              <h2 id="plans-heading" className="mt-2 text-2xl font-extrabold">The complete workspace from {monthlyPriceLabel}/month.</h2>
            </div>
            <span className="text-xs font-semibold text-ink-muted">Monthly + annual options · checkout follows policy review</span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {offeredVariants.length === 0 ? <div className="rounded-card border border-line bg-surface p-5 text-sm text-ink-muted">No billing options are currently offered. The platform owner can enable one from Platform Operations.</div> : offeredVariants.map((variant) => {
              const isMonthly = variant.intervalUnit === "month" && variant.intervalCount === 1;
              return (
                <article key={variant.id ?? `${variant.intervalUnit}-${variant.intervalCount}`} className={`rounded-card border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6 ${isMonthly ? "border-primary/40 ring-1 ring-primary/15" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-extrabold">Premium · {variant.label}</h3>
                      <p className="mt-1 text-sm leading-5 text-ink-muted">{isMonthly ? currentPlan.summary : `Prepay ${variant.intervalCount} ${variant.intervalUnit}${variant.intervalCount === 1 ? "" : "s"} with a ${variant.discountPercent}% discount.`}</p>
                    </div>
                    {isMonthly && <span className="rounded-pill bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold text-primary">Base price</span>}
                  </div>
                  <p className="mt-5 text-3xl font-extrabold tracking-[-0.04em]">{billingVariantPriceLabel(catalog, variant)}<span className="ml-1 text-sm font-semibold text-ink-muted">{isMonthly ? "/ month" : ` / ${variant.intervalCount} ${variant.intervalUnit}${variant.intervalCount === 1 ? "" : "s"}`}</span></p>
                  {isMonthly && <ul className="mt-5 grid gap-2.5 border-t border-line pt-5">{currentPlan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-ink-muted"><AdminIcon name="check" size={15} /><span>{feature}</span></li>)}</ul>}
                  <div className="mt-6 border-t border-line pt-4"><span className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-subtle">{isMonthly ? "Configured base price" : "Available after checkout is connected"}</span></div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-8 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="checkout-heading">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Secure checkout</p>
            <h2 id="checkout-heading" className="mt-2 text-2xl font-extrabold">Connect billing to keep your workspace active.</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">The first payment creates the PayMongo subscription and stores a tokenized payment method for future scheduled invoices.</p>
            {!annualAutoRenewalAllowed && <p className="mt-3 max-w-2xl rounded-btn bg-warning/10 px-3 py-2.5 text-xs font-semibold leading-5 text-ink">Annual options are hidden because the published billing policy requires manual review instead of automatic annual renewal.</p>}
          </div>
          <SubscriptionCheckout variants={checkoutVariants} policyGateOpen={policyGateOpen} providerReady={providerReady} providerDetail={providerDetail} publicKey={paymongo.publicKey} apiBaseUrl={paymongo.apiBaseUrl} ownerEmail={user.email ?? ""} />
        </section>

        <section className="mt-8 rounded-card border border-line bg-surface-raised p-5 sm:p-6" aria-labelledby="billing-next-heading"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="alert" size={17} /></span><div><h2 id="billing-next-heading" className="text-base font-extrabold">What happens next</h2><p className="mt-1 text-sm leading-6 text-ink-muted">{policyGateOpen && providerReady ? "Checkout is available. PayMongo will send signed subscription and payment events to keep this status current." : "Pricing is managed from Platform Operations. Checkout remains locked until both policies are published and PayMongo subscription activation plus keys are configured."}</p></div></div></section>
      </div>
    </main>
  );
}

function BillingMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary-fg/60">{label}</p><strong className="mt-1 block text-sm">{value}</strong><span className="mt-0.5 block text-xs text-primary-fg/65">{detail}</span></div>;
}

function BillingMessage({ title, detail }: { title: string; detail: string }) {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">{title}</h1><p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p><Link href="/admin" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Back to dashboard</Link></div></main>;
}
