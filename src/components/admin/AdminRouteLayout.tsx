import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "./AdminShell";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAdminProfile } from "@/lib/admin/profile";

type AdminRole = "admin" | "manager" | "cashier";
type ShellProfile = {
  role: AdminRole | null;
  store_id: string | null;
  password_change_required: boolean;
  stores: { name?: string } | null;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";

export default async function AdminRouteLayout({ children }: { children: ReactNode }) {
  // No Supabase client here: the identity comes from the check middleware
  // already performed, and the profile is served from the shared per-request
  // cache the page is about to read too. The shell costs zero round trips.
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ShellProfile | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return children;

  const branchName = profile.store_id ? profile.stores?.name ?? DEFAULT_STORE_NAME : "All branches";

  return <AdminShell branchName={branchName}>{children}</AdminShell>;
}
