import { redirect } from "next/navigation";
import CalendarScreen from "@/components/calendar/CalendarScreen";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAdminProfile } from "@/lib/admin/profile";

function shortName(name: string | null | undefined, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

export default async function CalendarPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
        <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
          <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
          <div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to admin</Link><SignOutButton className="px-4 py-3" /></div>
        </div>
      </main>
    );
  }

  const userName = shortName(profile.full_name, shortName(user.email, "Admin"));
  const userRole = profile.role === "manager" ? "Manager" : "Admin";

  return (
    <main className="calendar-page">
      <CalendarScreen userName={userName} userRole={userRole} storageScope={profile.org_id} />
    </main>
  );
}
