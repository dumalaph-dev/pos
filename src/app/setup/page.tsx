import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { SetupWizard } from "./SetupWizard";

type ProfileRecord = {
  role: "admin" | "manager" | "cashier" | null;
  password_change_required: boolean;
  org_id: string;
};

type BranchRecord = { id: string; name: string; address: string | null };

export default async function SetupPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile || profile.role !== "admin") return <SetupNotAllowed />;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, address")
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .order("name");
  const branches = (data ?? []) as BranchRecord[];

  if (error) return <SetupUnavailable />;
  if (!branches.length) return <SetupEmpty />;
  return <SetupWizard branches={branches} />;
}

function SetupNotAllowed() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger"><AdminIcon name="alert" size={22} /></span><h1 className="mt-4 text-2xl font-extrabold">Admin access required</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Only an organization admin can bind a new tablet to a branch.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold text-primary">Back to admin</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}

function SetupUnavailable() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">Tablet setup is unavailable</h1><p className="mt-3 text-sm leading-6 text-ink-muted">The active branch list could not be loaded. Check the connection and try again.</p><Link href="/setup" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Retry</Link></div></main>;
}

function SetupEmpty() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">Create a branch first</h1><p className="mt-3 text-sm leading-6 text-ink-muted">This tablet can be bound after your organization has at least one active branch.</p><Link href="/admin/branches" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Open branches</Link></div></main>;
}
