import "./AdminRouteLayout.css";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AdminShell } from "./AdminShell";
import { REQUEST_PATH_HEADER } from "@/lib/auth/identity-headers";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";
import { readAdminBranding } from "@/lib/admin/branding";
import { isSubscriptionAccessCurrent } from "@/lib/trial";

type AdminRole = "admin" | "manager" | "cashier";
type ShellProfile = {
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
  } | null;
};

const DEFAULT_STORE_NAME = "Your Store";

function formatLastSynced(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(date);
}

async function readConnection(orgId: string, storeId: string | null) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("devices")
      .select("is_active, last_seen_at")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (storeId) query = query.eq("store_id", storeId);
    const { data } = await query.maybeSingle();
    const lastSeenAt = typeof data?.last_seen_at === "string" ? data.last_seen_at : null;
    const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : NaN;
    const connected = Boolean(data?.is_active && Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= 5 * 60 * 1000);
    return { connected, lastSyncedLabel: formatLastSynced(lastSeenAt) };
  } catch {
    return { connected: false, lastSyncedLabel: null };
  }
}

async function readBranchOptions(orgId: string, storeId: string | null, canSwitch: boolean) {
  const supabase = await createClient();
  let query = supabase.from("stores").select("id, name, is_active").eq("org_id", orgId).eq("is_active", true).order("name");
  if (!canSwitch && storeId) query = query.eq("id", storeId);
  const { data } = await query;
  return (data ?? []) as AdminBranchOption[];
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
  const isBillingRoute = requestPath === "/admin/billing" || !requestPath;
  const subscriptionAccess = profile?.organizations
    ? isSubscriptionAccessCurrent({
      status: profile.organizations.subscription_status,
      trialStartedAt: profile.organizations.subscription_trial_started_at,
      trialEndsAt: profile.organizations.subscription_trial_ends_at,
      currentPeriodEnd: profile.organizations.subscription_current_period_end,
      billingMode: profile.organizations.subscription_billing_mode,
    })
    : null;
  if (subscriptionAccess === false && !isBillingRoute) {
    redirect(profile?.role === "admin" ? "/admin/billing" : "/account/billing-required");
  }
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return children;

  const canSwitchBranches = profile.role === "admin";
  const branches = await readBranchOptions(profile.org_id, profile.store_id, canSwitchBranches);
  const selectedBranchId = canSwitchBranches ? await getSelectedAdminBranchId(branches, profile.store_id) : profile.store_id;
  const branchName = selectedBranchId ? branches.find((branch) => branch.id === selectedBranchId)?.name ?? profile.stores?.name ?? DEFAULT_STORE_NAME : "All branches";
  const connection = await readConnection(profile.org_id, selectedBranchId);
  const branding = readAdminBranding(profile.organizations?.settings);

  return <AdminShell branding={branding} branchName={branchName} connection={connection} branches={branches} selectedBranchId={selectedBranchId} canSwitchBranches={canSwitchBranches} canManageBranches={canSwitchBranches}>{children}</AdminShell>;
}
