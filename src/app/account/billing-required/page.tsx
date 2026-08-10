import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BillingRequiredPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (!profile) redirect("/");

  if (profile.organizations?.account_status === "suspended") redirect("/account/suspended");
  if (profile.role === "admin") redirect("/admin/billing");

  const organizationName = profile.organizations?.name ?? "Your organization";
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-ink">
      <section className="w-full max-w-xl rounded-card border border-warning/30 bg-surface p-7 text-center shadow-[var(--shadow-pop)] sm:p-9" aria-labelledby="billing-required-heading">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-accent"><AdminIcon name="wallet" size={25} /></span>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Billing required</p>
        <h1 id="billing-required-heading" className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">{organizationName} needs an active plan</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">The organization trial or billing period has ended. Ask the business owner to renew before using POS or backoffice features.</p>
        <div className="mt-6 flex justify-center"><SignOutButton className="px-4 py-3" /></div>
        <Link href="/account" className="mt-4 inline-flex rounded-btn border border-line-strong px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary">Back to account</Link>
      </section>
    </main>
  );
}
