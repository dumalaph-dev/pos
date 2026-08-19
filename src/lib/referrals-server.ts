import { createAdminClient } from "@/lib/employee-auth";
import {
  normalizeReferralCodeRecord,
  normalizeReferralRecord,
  normalizeReferralRewardRecord,
  type ReferralCodeRecord,
  type ReferralRecord,
  type ReferralRewardRecord,
} from "@/lib/referrals";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const REFERRAL_FIELDS = "id, referral_code_id, referrer_org_id, referrer_profile_id, referred_user_id, referred_profile_id, referred_org_id, status, captured_at, qualified_at, rewarded_at, reward_grant_id, rejection_reason, created_at, updated_at";
const REFERRAL_CODE_FIELDS = "id, code, referrer_org_id, referrer_profile_id, is_active, created_at, updated_at";
const REFERRAL_REWARD_FIELDS = "id, referral_id, referrer_org_id, grant_id, reward_type, reward_days, status, issued_at, revoked_at, metadata";

export type OwnerReferralRecord = ReferralRecord & {
  referredOrganizationName: string | null;
  reward: ReferralRewardRecord | null;
};

export type OwnerReferralDashboard = {
  schemaAvailable: boolean;
  code: ReferralCodeRecord | null;
  referrals: OwnerReferralRecord[];
  rewards: ReferralRewardRecord[];
};

export async function readOwnerReferralDashboard(admin: PlatformAdminClient, organizationId: string, profileId: string): Promise<OwnerReferralDashboard> {
  const [codeResult, referralsResult, rewardsResult] = await Promise.all([
    admin
      .from("platform_referral_codes")
      .select(REFERRAL_CODE_FIELDS)
      .eq("referrer_org_id", organizationId)
      .eq("referrer_profile_id", profileId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    admin
      .from("platform_referrals")
      .select(REFERRAL_FIELDS)
      .eq("referrer_org_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("platform_referral_reward_ledger")
      .select(REFERRAL_REWARD_FIELDS)
      .eq("referrer_org_id", organizationId)
      .order("issued_at", { ascending: false })
      .limit(1000),
  ]);

  if (codeResult.error || referralsResult.error || rewardsResult.error) {
    return { schemaAvailable: false, code: null, referrals: [], rewards: [] };
  }

  const referrals = (referralsResult.data ?? []).map((row) => normalizeReferralRecord(row));
  const rewards = (rewardsResult.data ?? []).map((row) => normalizeReferralRewardRecord(row));
  const namesById = await readOrganizationNames(admin, referrals.map((referral) => referral.referred_org_id));
  const rewardByReferralId = new Map(rewards.map((reward) => [reward.referral_id, reward]));

  return {
    schemaAvailable: true,
    code: codeResult.data ? normalizeReferralCodeRecord(codeResult.data) : null,
    referrals: referrals.map((referral) => ({
      ...referral,
      referredOrganizationName: namesById.get(referral.referred_org_id) ?? null,
      reward: rewardByReferralId.get(referral.id) ?? null,
    })),
    rewards,
  };
}

export type ReferralQualificationResult = {
  schemaAvailable: boolean;
  rewarded: boolean;
  rewardDays: number | null;
  referralId: string | null;
  message: string | null;
  error: string | null;
};

export async function qualifyReferralForPaidConversion(admin: PlatformAdminClient, referredOrganizationId: string): Promise<ReferralQualificationResult> {
  const result = await admin.rpc("qualify_referral_for_paid_conversion", {
    p_referred_org_id: referredOrganizationId,
  });

  if (result.error) {
    return {
      schemaAvailable: !isMissingReferralSchemaError(result.error.message),
      rewarded: false,
      rewardDays: null,
      referralId: null,
      message: null,
      error: result.error.message,
    };
  }

  const value = isRecord(result.data) ? result.data : {};
  return {
    schemaAvailable: true,
    rewarded: value.rewarded === true,
    rewardDays: Number.isInteger(Number(value.reward_days)) ? Number(value.reward_days) : null,
    referralId: typeof value.referral_id === "string" ? value.referral_id : null,
    message: typeof value.message === "string" ? value.message : null,
    error: null,
  };
}

export function isMissingReferralSchemaError(message: string) {
  return /platform_referral|qualify_referral_for_paid_conversion|schema cache|does not exist/i.test(message);
}

async function readOrganizationNames(admin: PlatformAdminClient, organizationIds: string[]) {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  if (ids.length === 0) return new Map<string, string>();

  const result = await admin.from("organizations").select("id, name").in("id", ids);
  if (result.error) return new Map<string, string>();
  return new Map((result.data ?? []).map((row) => [String(row.id), String(row.name ?? "Unnamed organization")]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
