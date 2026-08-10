import { redirect } from "next/navigation";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionAccessCurrent } from "@/lib/trial";
import SellScreen from "@/components/pos/SellScreen";

// P1+P2 sell screen. Auth guard is lenient: if the auth service is
// unreachable (offline), render anyway — the client checks the cached
// offline PIN and branch catalog. Only a definitive "no user" redirects to login.
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
  if (checked && user) {
    const profile = await getAdminProfile(user.id);
    if (profile?.organizations?.account_status === "suspended") redirect("/account/suspended");
    if (profile?.password_change_required) redirect("/account/password?required=1");
    const subscriptionAccess = profile?.organizations
      ? isSubscriptionAccessCurrent({
        status: profile.organizations.subscription_status,
        trialStartedAt: profile.organizations.subscription_trial_started_at,
        trialEndsAt: profile.organizations.subscription_trial_ends_at,
        currentPeriodEnd: profile.organizations.subscription_current_period_end,
        billingMode: profile.organizations.subscription_billing_mode,
      })
      : null;
    if (subscriptionAccess === false) {
      redirect(profile?.role === "admin" ? "/admin/billing" : "/account/billing-required");
    }
  }

  return <SellScreen />;
}
