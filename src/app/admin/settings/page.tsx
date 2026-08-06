import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSettingsSaveButton, AdminThemePicker } from "@/components/admin/AdminThemeControls";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { ProductImageUpload } from "@/components/admin/ProductImageUpload";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import {
  DEFAULT_ADMIN_BRANDING,
  DEFAULT_ORGANIZATION_NAME,
  readAdminBranding,
  type AdminBranding,
} from "@/lib/admin/branding";
import { readAdminInventorySettings } from "@/lib/admin/inventory-settings";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { RestoreOwnerGuidanceButton } from "@/components/admin/OwnerOnboardingPanel";
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
  settings: unknown;
};

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
    .select("id, name, currency, settings")
    .eq("id", profile.org_id)
    .maybeSingle();
  const organization = data as OrganizationRecord | null;
  const branding = readAdminBranding(organization?.settings);
  const inventorySettings = readAdminInventorySettings(organization?.settings);
  const canWrite = profile.role === "admin";
  const saved = readParam(params.saved);
  const savedMessage = saved === "organization" ? "Dashboard settings saved." : "";
  const errorMessage = readParam(params.error);

  return (
    <main data-admin-theme={branding.theme} className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Settings">
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
          <Link href="/admin/pos" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Open POS settings</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Account configuration</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Make the backoffice feel like your business.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Set the name and brand your team sees across the admin dashboard, then choose the visual style that is easiest for you to work in.</p>
          </div>
          <span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span>
        </div>

        {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
        {errorMessage && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{errorMessage}</div>}
        {error && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Organization details could not be refreshed. The page is showing the configuration that was available.</div>}
        {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This page is read-only for your role. Ask an organization admin to change configuration.</div>}

        <section id="dashboard-settings" aria-labelledby="dashboard-settings-heading" className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
          <form action={updateOrganizationSettings} encType="multipart/form-data" className="admin-panel p-5 sm:p-6">
            <div className="admin-panel__header">
              <div><p className="admin-panel__eyebrow">Admin dashboard</p><h2 id="dashboard-settings-heading" className="admin-panel__title">Identity and appearance</h2><p className="admin-panel__subtitle">These details appear in the dashboard navigation and workspace chrome.</p></div>
              <span className="admin-settings-theme-pill">Shared workspace</span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><SettingsField label="Organization name" htmlFor="organization-name"><input id="organization-name" name="name" defaultValue={organization?.name ?? DEFAULT_ORGANIZATION_NAME} disabled={!canWrite} required maxLength={120} className="inventory-input" /><span className="mt-1.5 block text-xs text-ink-muted">Used for account-level records and organization references.</span></SettingsField></div>
              <SettingsField label="Brand name" htmlFor="brand-name"><input id="brand-name" name="brand_name" defaultValue={branding.brandName || DEFAULT_ADMIN_BRANDING.brandName} disabled={!canWrite} required maxLength={48} placeholder="e.g. Rico&apos;s" className="inventory-input" /><span className="mt-1.5 block text-xs text-ink-muted">The prominent name in the admin sidebar.</span></SettingsField>
              <SettingsField label="Brand tagline" htmlFor="brand-tagline"><input id="brand-tagline" name="brand_tagline" defaultValue={branding.brandTagline} disabled={!canWrite} maxLength={48} placeholder="e.g. LECHON HOUSE" className="inventory-input" /><span className="mt-1.5 block text-xs text-ink-muted">Optional supporting line below the brand name.</span></SettingsField>
              <ProductImageUpload
                existingImageUrl={branding.logoUrl}
                canWrite={canWrite && Boolean(organization)}
                prefix="brand-logo"
                fieldName="brand_logo_file"
                label="Brand logo"
                uploadLabel="Upload brand logo"
                replaceLabel="Replace brand logo"
                previewLabel="Brand logo preview"
                fallbackIcon="pig"
                assetLabel="logo"
              />
              <SettingsField label="Currency" htmlFor="organization-currency"><select id="organization-currency" name="currency" defaultValue={organization?.currency ?? "PHP"} disabled={!canWrite} className="inventory-input"><option value="PHP">PHP · Philippine peso</option><option value="USD">USD · US dollar</option><option value="SGD">SGD · Singapore dollar</option></select></SettingsField>
              <div className="admin-settings-inventory sm:col-span-2">
                <div className="admin-settings-inventory__copy"><p className="admin-panel__eyebrow">Inventory alerts</p><h3 className="mt-1 text-base font-extrabold text-ink">Keep a shared low-stock floor on the dashboard</h3><p className="mt-1 text-xs leading-5 text-ink-muted">Use this as the organization-wide alert floor. Products with a higher minimum keep their higher threshold.</p></div>
                <div className="admin-settings-inventory__controls">
                  <label htmlFor="low-stock-alerts-enabled" className="admin-settings-switch"><input id="low-stock-alerts-enabled" type="checkbox" name="low_stock_alerts_enabled" defaultChecked={inventorySettings.lowStockAlertsEnabled} disabled={!canWrite || !organization} /><span><strong>Show low-stock alerts</strong><small>Dashboard notifications and alert list</small></span></label>
                  <label htmlFor="default-low-stock-threshold" className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Alert floor</span><span className="flex items-center gap-2"><input id="default-low-stock-threshold" name="default_low_stock_threshold" type="number" min="0" max="100000" step="0.001" defaultValue={inventorySettings.defaultLowStockThreshold} required disabled={!canWrite || !organization} className="inventory-input tnums" /><span className="text-xs font-semibold text-ink-muted">units</span></span></label>
                </div>
              </div>
            </div>

            <div className="mt-7 border-t border-line pt-6">
              <AdminThemePicker initialTheme={branding.theme} disabled={!canWrite || !organization} />
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <p className="max-w-xl text-xs leading-5 text-ink-muted">Theme previews are local until you save. Saved brand and appearance settings are shared with your organization.</p>
              <AdminSettingsSaveButton disabled={!canWrite || !organization} />
            </div>
          </form>

          <DashboardPreview branding={branding} organizationName={organization?.name ?? DEFAULT_ORGANIZATION_NAME} />
        </section>

        {canWrite && <section className="admin-panel owner-guidance-settings mt-5 p-5 sm:p-6" aria-labelledby="owner-guidance-settings-heading"><div><p className="admin-panel__eyebrow">Owner help</p><h2 id="owner-guidance-settings-heading" className="admin-panel__title">Bring back the setup guide</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Show the first-time checklist and all feature tips again on your next visit. This only changes guidance visibility in this browser; it does not change your business data.</p></div><RestoreOwnerGuidanceButton /></section>}

        <section className="admin-panel mt-5 p-5 sm:p-6" aria-labelledby="pos-configuration-heading"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">POS workspace</p><h2 id="pos-configuration-heading" className="admin-panel__title">Branch receipts and devices</h2><p className="admin-panel__subtitle">Keep the settings that affect checkout, printed receipts, and physical terminals beside the live POS preview.</p></div><Link href="/admin/pos" className="rounded-btn bg-primary px-4 py-2 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover">Open POS</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2"><Link href="/admin/pos?tab=receipts" className="rounded-card border border-line bg-surface-raised p-4 transition hover:border-primary/40 hover:bg-primary-soft"><span className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Receipt &amp; tax details</span><strong className="mt-2 block text-sm font-extrabold text-ink">Branch identity, TIN, VAT, and receipt output</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">Edit the branch information that appears on the cashier preview and printed receipt.</span></Link><Link href="/admin/pos?tab=hardware" className="rounded-card border border-line bg-surface-raised p-4 transition hover:border-primary/40 hover:bg-primary-soft"><span className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent">POS terminals &amp; printers</span><strong className="mt-2 block text-sm font-extrabold text-ink">Register counters and test printer connections</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">Manage terminal prefixes, printer transport, network bridge details, and active status.</span></Link></div></section>
      </div>
    </main>
  );
}

function DashboardPreview({ branding, organizationName }: { branding: AdminBranding; organizationName: string }) {
  return (
    <aside className="admin-settings-preview admin-panel p-4 sm:p-5" aria-label="Dashboard preview">
      <div className="flex items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">Preview</p><h2 className="mt-1 text-base font-extrabold text-ink">Your admin workspace</h2></div><span className="admin-settings-preview__status"><i aria-hidden="true" />Live preview</span></div>
      <div data-admin-theme-preview className={`admin-settings-preview__window admin-settings-preview__window--${branding.theme}`}>
        <div className="admin-settings-preview__sidebar">
          <div className="admin-settings-preview__brand"><AdminBrandLogo logoUrl={branding.logoUrl} className="admin-settings-preview__mark" iconSize={16} label="Brand logo preview" /><span><strong>{branding.brandName}</strong><small>{branding.brandTagline || "Admin dashboard"}</small></span></div>
          <div className="admin-settings-preview__nav"><i /><i className="is-active" /><i /><i /><i /></div>
        </div>
        <div className="admin-settings-preview__body"><div className="admin-settings-preview__topline"><span /><span /><span /></div><p>{organizationName}</p><strong>Dashboard Overview</strong><div className="admin-settings-preview__cards"><i /><i /><i /></div></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">The preview updates as you choose a theme. Save when the dashboard feels comfortable to use.</p>
    </aside>
  );
}

function SettingsField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function SettingsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
