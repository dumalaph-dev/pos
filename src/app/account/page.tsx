import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordChangeForm } from "./password/PasswordChangeForm";
import { getAdminProfile } from "@/lib/admin/profile";
import { getAuthenticatedUser } from "@/lib/supabase/server";

function labelRole(value: string | null) {
  if (!value) return "POS user";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function AccountPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (!profile) redirect("/");

  const displayName = profile.full_name?.trim() || "Team member";
  const branchName = profile.stores?.name ?? "All branches";
  const organizationName = profile.organizations?.name ?? "Dumala POS";
  const usesEmployeeId = user.email?.endsWith("@staff.internal") ?? false;
  const destination = profile.role === "cashier" ? "/pos" : "/admin";

  return (
    <main className="min-h-screen bg-bg p-4 text-ink sm:p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Account settings</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-primary">Your account</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">Review your POS access details and keep your sign-in password current.</p>
          </div>
          <Link href={destination} className="rounded-btn bg-secondary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Back to {profile.role === "cashier" ? "POS" : "dashboard"}
          </Link>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7" aria-labelledby="account-details-title">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Profile</p>
            <h2 id="account-details-title" className="mt-2 text-xl font-extrabold text-ink">Access details</h2>
            <dl className="mt-6 divide-y divide-line">
              <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <dt className="text-xs font-semibold text-ink-muted">Name</dt>
                <dd className="text-right text-sm font-extrabold text-ink">{displayName}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 py-3">
                <dt className="text-xs font-semibold text-ink-muted">Access role</dt>
                <dd className="text-right text-sm font-extrabold text-ink">{labelRole(profile.role)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 py-3">
                <dt className="text-xs font-semibold text-ink-muted">Branch</dt>
                <dd className="text-right text-sm font-extrabold text-ink">{branchName}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 py-3 last:pb-0">
                <dt className="text-xs font-semibold text-ink-muted">Sign-in method</dt>
                <dd className="text-right text-sm font-extrabold text-ink">{usesEmployeeId ? "Employee ID" : "Email"}</dd>
              </div>
            </dl>
            <p className="mt-6 rounded-btn bg-secondary px-3 py-3 text-xs leading-5 text-ink-muted">{organizationName} access is managed by your organization administrator.</p>
          </section>

          <section className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7" aria-labelledby="password-settings-title">
            <div className="mb-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Security</p>
              <h2 id="password-settings-title" className="mt-2 text-xl font-extrabold text-ink">Password</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">Change your private password whenever you need to. Your current password is never displayed here.</p>
            </div>
            <PasswordChangeForm displayName={displayName} mode="settings" />
          </section>
        </div>
      </div>
    </main>
  );
}
