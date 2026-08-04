import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { updateOrganizationSettings } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";

type CurrentProfile = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

type OrganizationRecord = {
  id: string;
  name: string;
  currency: string;
};

const DEFAULT_ORGANIZATION_NAME = "Rico's Lechon House";

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as CurrentProfile | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <SettingsProfileMissing />;

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, currency")
    .eq("id", profile.org_id)
    .maybeSingle();
  const organization = data as OrganizationRecord | null;
  const canWrite = profile.role === "admin";
  const saved = readParam(params.saved);
  const savedMessage = saved === "organization" ? "Organization settings saved." : "";
  const errorMessage = readParam(params.error);

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="settings" size={20} /></Link>
            <div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p><h1 className="truncate text-lg font-extrabold text-primary">Settings</h1></div>
          </div>
          <div className="ml-auto flex items-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link><Link href="/admin/pos" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Open POS settings</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
        </header>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Account configuration</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Keep your organization identity consistent.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">Organization identity lives here. Branch receipts, tax rules, terminals, and printers are managed together in the POS workspace.</p></div><span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span></div>

        {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
        {errorMessage && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{errorMessage}</div>}
        {error && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Organization details could not be refreshed. The page is showing the configuration that was available.</div>}
        {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This page is read-only for your role. Ask an organization admin to change configuration.</div>}

        <section id="organization" aria-labelledby="organization-heading" className="admin-panel mt-6 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Organization</p><h2 id="organization-heading" className="admin-panel__title">Business identity</h2><p className="admin-panel__subtitle">Used as the account-level name across the backoffice.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{organization?.currency ?? "PHP"}</span></div><form action={updateOrganizationSettings} className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.4fr)_180px_auto] md:items-end"><SettingsField label="Organization name" htmlFor="organization-name"><input id="organization-name" name="name" defaultValue={organization?.name ?? DEFAULT_ORGANIZATION_NAME} disabled={!canWrite} required maxLength={120} className="inventory-input" /></SettingsField><SettingsField label="Currency" htmlFor="organization-currency"><select id="organization-currency" name="currency" defaultValue={organization?.currency ?? "PHP"} disabled={!canWrite} className="inventory-input"><option value="PHP">PHP</option><option value="USD">USD</option><option value="SGD">SGD</option></select></SettingsField><button type="submit" disabled={!canWrite || !organization} className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save identity</button></form></section>

        <section className="admin-panel mt-4 p-5" aria-labelledby="pos-configuration-heading"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">POS workspace</p><h2 id="pos-configuration-heading" className="admin-panel__title">Branch receipts and devices</h2><p className="admin-panel__subtitle">Keep the settings that affect checkout, printed receipts, and physical terminals beside the live POS preview.</p></div><Link href="/admin/pos" className="rounded-btn bg-primary px-4 py-2 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover">Open POS</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2"><Link href="/admin/pos?tab=receipts" className="rounded-card border border-line bg-surface-raised p-4 transition hover:border-primary/40 hover:bg-primary-soft"><span className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Receipt &amp; tax details</span><strong className="mt-2 block text-sm font-extrabold text-ink">Branch identity, TIN, VAT, and receipt output</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">Edit the branch information that appears on the cashier preview and printed receipt.</span></Link><Link href="/admin/pos?tab=hardware" className="rounded-card border border-line bg-surface-raised p-4 transition hover:border-primary/40 hover:bg-primary-soft"><span className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent">POS terminals &amp; printers</span><strong className="mt-2 block text-sm font-extrabold text-ink">Register counters and test printer connections</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">Manage terminal prefixes, printer transport, network bridge details, and active status.</span></Link></div></section>
      </div>
    </main>
  );
}

function SettingsField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function SettingsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
