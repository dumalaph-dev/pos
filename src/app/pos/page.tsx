import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

// P0 placeholder. The real products-first sell screen lands in P1 (UI_SPEC §3).
export default async function PosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, store_id, stores(name)")
    .eq("id", user.id)
    .single();

  const branch =
    (profile?.stores as { name?: string } | null)?.name ?? "Unassigned branch";

  return (
    <main className="min-h-full p-6">
      <header className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            POS · {branch}
          </p>
          <h1 className="text-xl font-extrabold text-ink">
            {profile?.full_name ?? user.email}
          </h1>
        </div>
        <SignOutButton />
      </header>
      <p className="mt-6 text-ink-muted">
        Sell screen arrives in P1. You&apos;re signed in as{" "}
        <span className="font-semibold text-ink">{profile?.role}</span>.
      </p>
    </main>
  );
}
