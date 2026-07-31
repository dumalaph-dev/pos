import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SellScreen from "@/components/pos/SellScreen";

// P1+P2 sell screen. Auth guard is lenient: if the auth service is
// unreachable (offline), render anyway — the client checks the cached
// session. Only a definitive "no user" redirects to login.
export default async function PosPage() {
  const supabase = await createClient();
  let checked = false;
  let user: { id: string } | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    checked = !error; // auth unreachable (offline) → render; client decides
  } catch {
    // same as above
  }
  if (checked && !user) redirect("/");

  return <SellScreen />;
}
