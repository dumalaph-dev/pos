/**
 * Admin styles, split out of the former single 8,603-line AdminRouteLayout.css.
 *
 * IMPORT ORDER IS LOAD-BEARING — do not reorder or alphabetize.
 *
 * `themes.css` deliberately comes after the workspace files because it bridges
 * them: `.employee-page[data-admin-theme]` and friends remap palettes that
 * `employees.css` and `products.css` define first. Hoisting themes above them
 * would silently revert those workspaces to their hardcoded pre-theme colors
 * under every admin theme.
 *
 * For the same reason these stay imported here rather than from the individual
 * routes. Route-level imports would give each admin page a smaller stylesheet,
 * but the load order across route boundaries is not guaranteed to keep the
 * theme bridges last, so the payload win is not worth a theming regression.
 * Splitting the bridges out per workspace is the prerequisite for that change.
 */
import "./admin-css/shell.css";
import "./admin-css/backoffice.css";
import "./admin-css/products.css";
import "./admin-css/employees.css";
import "./admin-css/themes.css";
import "./admin-css/shifts.css";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AdminShell } from "./AdminShell";
import { REQUEST_PATH_HEADER } from "@/lib/auth/identity-headers";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";
import { getAdminBranchOptions, getAdminBranches } from "@/lib/admin/branches";
import { getAdminConnection } from "@/lib/admin/connection";
import { readAdminBranding } from "@/lib/admin/branding";
import { getBillingAccessReason, isSubscriptionAccessCurrent } from "@/lib/trial";
import type { OfflineProfileSnapshot } from "@/lib/offline";

type AdminRole = "admin" | "manager" | "cashier";
type ShellProfile = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  stores: { name?: string } | null;
  organizations: {
    settings?: unknown;
    account_status?: "active" | "suspended" | null;
    subscription_status?: string | null;
    subscription_trial_started_at?: string | null;
    subscription_trial_ends_at?: string | null;
    subscription_current_period_end?: string | null;
    subscription_billing_mode?: string | null;
    subscription_provider_subscription_id?: string | null;
    subscription_provider_payment_intent_id?: string | null;
    complimentary_access_until?: string | null;
  } | null;
};

const DEFAULT_STORE_NAME = "Your Store";

async function readBranchOptions(orgId: string, storeId: string | null, canSwitch: boolean, includeReceiptFields: boolean) {
  const { data } = includeReceiptFields
    ? await getAdminBranches(orgId)
    : await getAdminBranchOptions(orgId);
  const visibleBranches = data.filter((branch) => branch.is_active && (canSwitch || !storeId || branch.id === storeId));
  return visibleBranches.map(({ id, name, is_active }) => ({ id, name, is_active })) as AdminBranchOption[];
}

export default async function AdminRouteLayout({ children }: { children: ReactNode }) {
  // The identity comes from the check middleware already performed, and the
  // profile is served from the shared per-request cache the page reads too.
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ShellProfile | null;

  if (profile?.organizations?.account_status === "suspended") redirect("/account/suspended");
  if (profile?.password_change_required) redirect("/account/password?required=1");
  const requestPath = (await headers()).get(REQUEST_PATH_HEADER);
  const isBillingRoute = requestPath === "/admin/billing" || requestPath === "/admin/referrals" || !requestPath;
  const subscriptionInput = profile?.organizations
    ? {
      status: profile.organizations.subscription_status,
      trialStartedAt: profile.organizations.subscription_trial_started_at,
      trialEndsAt: profile.organizations.subscription_trial_ends_at,
      currentPeriodEnd: profile.organizations.subscription_current_period_end,
      billingMode: profile.organizations.subscription_billing_mode,
      providerSubscriptionId: profile.organizations.subscription_provider_subscription_id,
      providerPaymentIntentId: profile.organizations.subscription_provider_payment_intent_id,
      complimentaryAccessUntil: profile.organizations.complimentary_access_until,
    }
    : null;
  const subscriptionAccess = subscriptionInput ? isSubscriptionAccessCurrent(subscriptionInput) : null;
  if (subscriptionAccess === false && subscriptionInput && !isBillingRoute) {
    redirect(profile?.role === "admin"
      ? `/admin/billing?reason=${getBillingAccessReason(subscriptionInput)}&source=admin`
      : "/account/billing-required");
  }
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return children;

  const canSwitchBranches = profile.role === "admin";
  const receiptRoute = !requestPath || requestPath === "/admin" || requestPath === "/admin/" || requestPath === "/admin/orders" || requestPath === "/admin/sales" || requestPath === "/admin/promotions";
  const branches = await readBranchOptions(profile.org_id, profile.store_id, canSwitchBranches, receiptRoute);
  const selectedBranchId = canSwitchBranches ? await getSelectedAdminBranchId(branches, profile.store_id) : profile.store_id;
  const branchName = selectedBranchId ? branches.find((branch) => branch.id === selectedBranchId)?.name ?? profile.stores?.name ?? DEFAULT_STORE_NAME : "All branches";
  const connection = await getAdminConnection(user.id, profile.org_id, selectedBranchId);
  const branding = readAdminBranding(profile.organizations?.settings);
  const offlineProfile: OfflineProfileSnapshot = {
    id: user.id,
    org_id: profile.org_id,
    store_id: selectedBranchId,
    store_name: branchName,
    store_address: null,
    store_tin: null,
    brand_logo_url: branding.logoUrl,
    full_name: profile.full_name,
    role: profile.role,
  };

  return <AdminShell branding={branding} branchName={branchName} connection={connection} branches={branches} selectedBranchId={selectedBranchId} canSwitchBranches={canSwitchBranches} canManageBranches={canSwitchBranches} offlineProfile={offlineProfile}>{children}</AdminShell>;
}
