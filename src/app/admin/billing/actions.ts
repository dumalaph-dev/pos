"use server";

import { revalidatePath } from "next/cache";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { normalizeTrialFeedbackStatus, readTrialLifecycle } from "@/lib/trial";

export type TrialFeedbackState = {
  ok: boolean;
  message: string;
};

const FEEDBACK_REASONS = new Set([
  "too_expensive",
  "still_setting_up",
  "missing_feature",
  "need_more_time",
  "not_ready",
  "other",
]);

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function submitTrialFeedback(_previousState: TrialFeedbackState, formData: FormData): Promise<TrialFeedbackState> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, message: "Your session has expired. Sign in again before sending feedback." };

  const profile = await getAdminProfile(user.id);
  if (!profile || profile.role !== "admin") return { ok: false, message: "Only the business owner can send trial feedback." };

  const reason = readText(formData, "reason");
  const details = readText(formData, "details");
  const wantsDiscount = formData.get("wants_discount") === "on";
  if (!FEEDBACK_REASONS.has(reason)) return { ok: false, message: "Choose the reason that best matches your decision." };
  if (details.length > 1000) return { ok: false, message: "Keep your feedback to 1,000 characters or fewer." };

  const supabase = await createClient();
  const organizationResult = await supabase
    .from("organizations")
    .select("created_at, subscription_status, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end")
    .eq("id", profile.org_id)
    .maybeSingle();
  let organization = organizationResult.data as {
    created_at?: string | null;
    subscription_status?: string | null;
    subscription_trial_started_at?: string | null;
    subscription_trial_ends_at?: string | null;
    subscription_current_period_end?: string | null;
  } | null;

  if (organizationResult.error) {
    const fallback = await supabase
      .from("organizations")
      .select("created_at, subscription_status, subscription_current_period_end")
      .eq("id", profile.org_id)
      .maybeSingle();
    if (fallback.error || !fallback.data) return { ok: false, message: "Your trial status could not be checked. Please try again later." };
    organization = fallback.data;
  }

  const trial = readTrialLifecycle({
    status: organization?.subscription_status,
    createdAt: organization?.created_at,
    trialStartedAt: organization?.subscription_trial_started_at,
    trialEndsAt: organization?.subscription_trial_ends_at,
    currentPeriodEnd: organization?.subscription_current_period_end,
  });
  if (!trial.isLastDay && !trial.isExpired) return { ok: false, message: "This check-in opens during the final day of your trial." };

  const response = await supabase.from("trial_feedback").upsert({
    org_id: profile.org_id,
    submitted_by: user.id,
    reason,
    details,
    wants_discount: wantsDiscount,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id" });

  if (response.error && isMissingTrialFeedbackSchema(response.error.message)) {
    const fallback = await saveFeedbackInOrganizationSettings(supabase, profile.org_id, {
      submittedBy: user.id,
      reason,
      details,
      wantsDiscount,
    });
    if (!fallback) return { ok: false, message: "Your feedback could not be saved. Please try again." };
  } else if (response.error) {
    return { ok: false, message: "Your feedback could not be saved. Please try again." };
  }

  revalidatePath("/admin/billing");
  revalidatePath("/platform/operations");
  return { ok: true, message: "Thanks — your feedback has been sent." };
}

async function saveFeedbackInOrganizationSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  feedback: { submittedBy: string; reason: string; details: string; wantsDiscount: boolean },
) {
  const current = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (current.error || !current.data) return false;
  const settings = isRecord(current.data.settings) ? current.data.settings : {};
  const existingFeedback = isRecord(settings.trial_retention_feedback) ? settings.trial_retention_feedback : {};
  const update = await supabase.from("organizations").update({
    settings: {
      ...settings,
      trial_retention_feedback: {
        ...existingFeedback,
        ...feedback,
        status: normalizeTrialFeedbackStatus(existingFeedback.status),
        platformNotes: typeof existingFeedback.platformNotes === "string" ? existingFeedback.platformNotes : "",
        updatedAt: new Date().toISOString(),
      },
    },
  }).eq("id", orgId);
  return !update.error;
}

function isMissingTrialFeedbackSchema(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("trial_feedback") || normalized.includes("does not exist") || normalized.includes("schema cache");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
