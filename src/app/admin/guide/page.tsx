import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminGuide, type GuideRole } from "@/components/admin/AdminGuide";
import { GUIDE_TOPIC_IDS, type GuideTopic } from "@/components/admin/admin-guide-data";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { readAdminBranding } from "@/lib/admin/branding";
import { getAdminProfile } from "@/lib/admin/profile";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Help & Guide",
  description: "Practical answers and daily workflows for every Dumala POS role.",
};

function shortName(name: string | null | undefined, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function guideRole(role: string | null | undefined): GuideRole {
  return role === "cashier" || role === "manager" ? role : "admin";
}

function guideTopic(value: string | string[] | undefined): GuideTopic | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return GUIDE_TOPIC_IDS.includes(candidate as GuideTopic) ? candidate as GuideTopic : undefined;
}

export default async function AdminGuidePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (profile?.password_change_required) redirect("/account/password?required=1");

  if (!profile) {
    return (
      <main className="admin-page text-ink">
        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <section className="admin-panel mt-5 p-6">
            <p className="admin-panel__eyebrow">Help &amp; Guide</p>
            <h1 className="admin-panel__title">Your guide is ready when your profile is set up.</h1>
            <p className="admin-panel__subtitle mt-2">Ask an organization admin to finish your profile and branch assignment, then sign in again.</p>
          </section>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const branding = readAdminBranding(profile.organizations?.settings);
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const userInitial = firstName.charAt(0).toUpperCase();
  const role = guideRole(profile.role);
  const organizationName = profile.organizations?.name ?? branding.brandName;

  return (
    <main data-admin-theme={branding.theme} className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <header className="admin-topbar">
          <Link href="/admin" className="admin-mobile-brand" aria-label={`${branding.brandName} ${branding.brandTagline} dashboard`}>
            <AdminBrandLogo logoUrl={branding.logoUrl} className="admin-brand__mark" iconSize={20} label="Brand logo" />
            <span className="admin-brand__copy"><strong>{branding.brandName}</strong><small>{branding.brandTagline}</small></span>
          </Link>
          <Link href="/products" className="admin-icon-button" aria-label="Open products"><AdminIcon name="box" size={19} /></Link>
          <Link href="/admin/guide" className="admin-icon-button admin-icon-button--help" aria-label="Help and guide" aria-current="page"><AdminIcon name="help" size={19} /></Link>
          <AdminMenu
            triggerClassName="admin-user-chip"
            triggerLabel={`Account menu for ${firstName}`}
            trigger={
              <>
                <span className="admin-user-chip__avatar" aria-hidden="true">{userInitial}</span>
                <span className="admin-user-chip__copy"><strong>{firstName}</strong><small>{role === "manager" ? "Manager" : role === "cashier" ? "Cashier" : "Admin"}</small></span>
                <span className="admin-user-chip__caret" aria-hidden="true">⌄</span>
              </>
            }
          >
            <Link href="/admin/settings" className="admin-menu__item">Settings</Link>
            <Link href="/account/password" className="admin-menu__item">Change password</Link>
            <SignOutButton variant="menu" />
          </AdminMenu>
          <SignOutButton className="px-2 py-2.5 text-[10px]" />
        </header>

        <AdminGuide currentRole={role} organizationName={organizationName} initialTopic={guideTopic(params.topic)} />
      </div>
    </main>
  );
}
