import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SellScreen from "@/components/pos/SellScreen";

// P1 sell screen. Auth guard here is defense in depth — the proxy already
// protects /pos. All catalog/cart logic lives client-side (SellScreen).
export default async function PosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <SellScreen />;
}
