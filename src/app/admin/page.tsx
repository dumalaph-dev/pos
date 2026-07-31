import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

// P0 placeholder. The real backoffice (dashboard, branches, ...) lands in P4/P6.
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, organizations(name)")
    .eq("id", user.id)
    .single();

  // Proxy already blocks cashiers; defense in depth here too.
  if (profile?.role === "cashier") redirect("/pos");

  const org =
    (profile?.organizations as { name?: string } | null)?.name ??
    "Organization";

  return (
    <main className="min-h-full p-6">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Backoffice · {org}
          </p>
          <h1 className="text-xl font-extrabold text-ink">
            {profile?.full_name ?? user.email}
          </h1>
        </div>
        <SignOutButton />
      </header>
      <p className="mt-6 text-ink-muted">
        Dashboard, branches, products, and reports arrive in P4–P8. Signed in as{" "}
        <span className="font-semibold text-ink">{profile?.role}</span>.
      </p>
    </main>
  );
}
