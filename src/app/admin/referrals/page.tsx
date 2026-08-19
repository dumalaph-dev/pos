import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { createAdminClient } from "@/lib/employee-auth";
import { absoluteUrl } from "@/lib/site-url";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { readOwnerReferralDashboard } from "@/lib/referrals-server";
import { referralStatusLabel } from "@/lib/referrals";
import { ReferralLinkCard } from "./ReferralLinkCard";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (!profile || profile.role !== "admin") redirect("/admin");

  const admin = createAdminClient();
  const dashboard = admin
    ? await readOwnerReferralDashboard(admin, profile.org_id, user.id)
    : { schemaAvailable: false, code: null, referrals: [], rewards: [] };
  const referralLink = dashboard.code ? absoluteUrl(`/signup?ref=${encodeURIComponent(dashboard.code.code)}`) : null;
  const rewardedCount = dashboard.referrals.filter((referral) => referral.status === "rewarded").length;
  const invitedCount = dashboard.referrals.length;
  const earnedDays = dashboard.rewards.filter((reward) => reward.status === "issued").reduce((total, reward) => total + reward.reward_days, 0);

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Referral program">
          <Link href="/admin/billing" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Billing &amp; Plan</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Growth &middot; owner rewards</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Help another counter get started.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Your link attributes a new business to your organization. Rewards are earned only after a real first paid conversion, with a clear record for both you and platform support.</p>
          </div>
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-btn border border-line bg-surface px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:border-line-strong hover:bg-primary-soft"><AdminIcon name="arrow" size={14} /> Dashboard</Link>
        </div>

        {!dashboard.schemaAvailable && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink">The referral program is not available yet. Apply Supabase migration <code className="rounded bg-surface px-1.5 py-0.5 text-xs font-bold">0053_referral_program.sql</code> before sharing a link.</div>}

        {referralLink && dashboard.code ? <div className="mt-6"><ReferralLinkCard code={dashboard.code.code} link={referralLink} /></div> : dashboard.schemaAvailable && <div className="mt-6 rounded-card border border-dashed border-line-strong bg-surface p-5 text-sm leading-6 text-ink-muted">A referral code has not been created for this owner account. Ask platform support to refresh the referral program setup.</div>}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ReferralMetric label="Invited signups" value={String(invitedCount)} detail="Organizations attributed to your link" tone="bg-primary text-primary-fg" />
          <ReferralMetric label="Paid conversions" value={String(rewardedCount)} detail="First paid subscriptions confirmed" tone="bg-success/10 text-success" />
          <ReferralMetric label="Premium days earned" value={String(earnedDays)} detail="Complimentary time issued to your organization" tone="bg-warning/15 text-warning" />
        </div>

        <section className="admin-panel mt-5 overflow-hidden p-5" aria-labelledby="referral-history-heading">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">Attribution history</p>
              <h2 id="referral-history-heading" className="admin-panel__title">Your referred businesses</h2>
              <p className="admin-panel__subtitle">A signup is pending until its first paid subscription is confirmed.</p>
            </div>
            {dashboard.code && <span className="rounded-full bg-primary-soft px-3 py-1.5 font-mono text-xs font-extrabold text-primary">{dashboard.code.code}</span>}
          </div>

          {dashboard.referrals.length === 0 ? (
            <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-8 text-center text-sm text-ink-muted">No referrals yet. Share your link with a café, restaurant, or food business that could use a simpler counter workflow.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="admin-list-table min-w-[700px]">
                <thead><tr><th>Business</th><th>Signed up</th><th>Status</th><th>Reward</th></tr></thead>
                <tbody>{dashboard.referrals.map((referral) => <tr key={referral.id}>
                  <td><strong>{referral.referredOrganizationName || "New organization"}</strong><small className="mt-1 block text-ink-muted">{referral.referred_org_id}</small></td>
                  <td className="whitespace-nowrap text-ink-muted">{formatDate(referral.captured_at)}</td>
                  <td><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${referral.status === "rewarded" ? "bg-success/10 text-success" : referral.status === "rejected" ? "bg-danger-soft text-danger" : "bg-secondary text-primary"}`}>{referralStatusLabel(referral.status)}</span></td>
                  <td>{referral.reward ? <><strong className={referral.reward.status === "revoked" ? "text-danger" : "text-success"}>{referral.reward.status === "revoked" ? "Reward revoked" : `${referral.reward.reward_days} days`}</strong><small className="mt-1 block text-ink-muted">{formatDate(referral.reward.revoked_at ?? referral.reward.issued_at)}</small></> : <span className="text-ink-muted">After paid conversion</span>}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-3" aria-label="Referral program rules">
          <ReferralRule number="01" title="Share" detail="Send your complete referral link to a future customer." />
          <ReferralRule number="02" title="They start free" detail="The new business receives the standard trial and its own workspace." />
          <ReferralRule number="03" title="You earn" detail="After the first paid conversion, 7 Premium days are scheduled for you." />
        </section>
      </div>
    </main>
  );
}

function ReferralMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`rounded-card p-5 shadow-[var(--shadow-card)] ${tone}`}><p className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-75">{label}</p><p className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">{value}</p><p className="mt-1 text-xs leading-5 opacity-75">{detail}</p></article>;
}

function ReferralRule({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <article className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]"><span className="text-xs font-extrabold tracking-[0.16em] text-accent">{number}</span><h2 className="mt-4 text-base font-extrabold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p></article>;
}

function formatDate(value: string | null | undefined) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}
