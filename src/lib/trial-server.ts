import { createAdminClient } from "@/lib/employee-auth";
import {
  readTrialLifecycle,
  TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
  type TrialLifecycleInput,
} from "@/lib/trial";

export type TrialTransitionResult = {
  transitioned: boolean;
  status: string | null | undefined;
};

/**
 * Atomically persists the expired-trial state. The date check is also present
 * in the database entitlement function, so a missed request cannot reopen the
 * tenant through an authenticated RPC or table policy.
 */
export async function transitionExpiredTrial(
  organizationId: string,
  input: TrialLifecycleInput,
  now = Date.now(),
): Promise<TrialTransitionResult> {
  const lifecycle = readTrialLifecycle(input, now);
  if (input.status !== "trialing" || !lifecycle.isExpired) {
    return { transitioned: false, status: input.status };
  }

  const admin = createAdminClient();
  if (!admin) return { transitioned: false, status: input.status };

  try {
    const rpc = await admin.rpc("expire_trialing_organization", { p_org_id: organizationId });
    if (!rpc.error) {
      if (rpc.data === true) {
        return { transitioned: true, status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS };
      }

      // A successful payment may have won the race with this request. Read the
      // current status before returning the stale trial snapshot to the cache.
      const current = await admin
        .from("organizations")
        .select("subscription_status")
        .eq("id", organizationId)
        .maybeSingle();
      return {
        transitioned: false,
        status: typeof current.data?.subscription_status === "string" ? current.data.subscription_status : input.status,
      };
    }

    // Keep a rolling deploy compatible with a database where the new RPC has
    // not reached the schema cache yet. The status predicate prevents an
    // expiry write from overwriting a concurrent successful payment.
    const fallback = await admin
      .from("organizations")
      .update({
        subscription_status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
        subscription_updated_at: new Date(now).toISOString(),
      })
      .eq("id", organizationId)
      .eq("subscription_status", "trialing")
      .select("subscription_status")
      .maybeSingle();

    if (!fallback.error && fallback.data?.subscription_status === TRIAL_EXPIRED_SUBSCRIPTION_STATUS) {
      return { transitioned: true, status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS };
    }
  } catch {
    // RLS still fails closed at the exact expiry boundary if the transition
    // write is unavailable. Do not turn a transient admin-client error into a
    // request failure for the owner.
  }

  return { transitioned: false, status: input.status };
}
