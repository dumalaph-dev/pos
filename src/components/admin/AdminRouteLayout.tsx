import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "./AdminShell";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type ShellProfile = {
  role: AdminRole | null;
  store_id: string | null;
  stores: { name?: string } | null;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";

export default async function AdminRouteLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("role, store_id, stores(name)")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as ShellProfile | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return children;

  const branchName = profile.store_id ? profile.stores?.name ?? DEFAULT_STORE_NAME : "All branches";

  return <AdminShell branchName={branchName}>{children}</AdminShell>;
}
