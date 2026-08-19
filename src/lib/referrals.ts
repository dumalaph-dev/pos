export const REFERRAL_REWARD_DAYS = 7;

export type ReferralStatus = "pending" | "qualified" | "rewarded" | "rejected";
export type ReferralRewardStatus = "issued" | "revoked";

export type ReferralCodeRecord = {
  id: string;
  code: string;
  referrer_org_id: string;
  referrer_profile_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ReferralRecord = {
  id: string;
  referral_code_id: string;
  referrer_org_id: string;
  referrer_profile_id: string;
  referred_user_id: string | null;
  referred_profile_id: string | null;
  referred_org_id: string;
  status: ReferralStatus;
  captured_at: string;
  qualified_at: string | null;
  rewarded_at: string | null;
  reward_grant_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ReferralRewardRecord = {
  id: string;
  referral_id: string;
  referrer_org_id: string;
  grant_id: string | null;
  reward_type: "complimentary_premium_days" | string;
  reward_days: number;
  status: ReferralRewardStatus;
  issued_at: string;
  revoked_at: string | null;
  metadata: Record<string, unknown>;
};

export function normalizeReferralCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9]{8,32}$/.test(code) ? code : "";
}

export function normalizeReferralStatus(value: unknown): ReferralStatus {
  return value === "qualified" || value === "rewarded" || value === "rejected" ? value : "pending";
}

export function normalizeReferralRewardStatus(value: unknown): ReferralRewardStatus {
  return value === "revoked" ? "revoked" : "issued";
}

export function normalizeReferralCodeRecord(value: Record<string, unknown>): ReferralCodeRecord {
  return {
    id: typeof value.id === "string" ? value.id : "",
    code: normalizeReferralCode(value.code),
    referrer_org_id: typeof value.referrer_org_id === "string" ? value.referrer_org_id : "",
    referrer_profile_id: typeof value.referrer_profile_id === "string" ? value.referrer_profile_id : "",
    is_active: value.is_active !== false,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date(0).toISOString(),
  };
}

export function normalizeReferralRecord(value: Record<string, unknown>): ReferralRecord {
  return {
    id: typeof value.id === "string" ? value.id : "",
    referral_code_id: typeof value.referral_code_id === "string" ? value.referral_code_id : "",
    referrer_org_id: typeof value.referrer_org_id === "string" ? value.referrer_org_id : "",
    referrer_profile_id: typeof value.referrer_profile_id === "string" ? value.referrer_profile_id : "",
    referred_user_id: typeof value.referred_user_id === "string" ? value.referred_user_id : null,
    referred_profile_id: typeof value.referred_profile_id === "string" ? value.referred_profile_id : null,
    referred_org_id: typeof value.referred_org_id === "string" ? value.referred_org_id : "",
    status: normalizeReferralStatus(value.status),
    captured_at: typeof value.captured_at === "string" ? value.captured_at : new Date(0).toISOString(),
    qualified_at: typeof value.qualified_at === "string" ? value.qualified_at : null,
    rewarded_at: typeof value.rewarded_at === "string" ? value.rewarded_at : null,
    reward_grant_id: typeof value.reward_grant_id === "string" ? value.reward_grant_id : null,
    rejection_reason: typeof value.rejection_reason === "string" ? value.rejection_reason : null,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date(0).toISOString(),
  };
}

export function normalizeReferralRewardRecord(value: Record<string, unknown>): ReferralRewardRecord {
  return {
    id: typeof value.id === "string" ? value.id : "",
    referral_id: typeof value.referral_id === "string" ? value.referral_id : "",
    referrer_org_id: typeof value.referrer_org_id === "string" ? value.referrer_org_id : "",
    grant_id: typeof value.grant_id === "string" ? value.grant_id : null,
    reward_type: typeof value.reward_type === "string" ? value.reward_type : "complimentary_premium_days",
    reward_days: Number.isInteger(Number(value.reward_days)) ? Number(value.reward_days) : 0,
    status: normalizeReferralRewardStatus(value.status),
    issued_at: typeof value.issued_at === "string" ? value.issued_at : new Date(0).toISOString(),
    revoked_at: typeof value.revoked_at === "string" ? value.revoked_at : null,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
}

export function referralStatusLabel(status: ReferralStatus) {
  switch (status) {
    case "rewarded": return "Reward issued";
    case "qualified": return "Qualified";
    case "rejected": return "Rejected";
    default: return "Signed up";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
