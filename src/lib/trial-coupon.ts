/** Matches the locked eligibility check in redeem_platform_trial_coupon. */
export function canClaimTrialCoupon(input: {
  accountStatus?: string | null;
  status?: string | null;
  trialEndsAt?: string | null;
  providerSubscriptionId?: string | null;
  providerPaymentIntentId?: string | null;
}, now = Date.now()): boolean {
  const trialEnd = input.trialEndsAt ? Date.parse(input.trialEndsAt) : NaN;
  return input.accountStatus === "active"
    && Number.isFinite(trialEnd)
    && (input.status === "trialing" || (input.status === "paused" && trialEnd <= now))
    && !input.providerSubscriptionId
    && !input.providerPaymentIntentId;
}

export function trialCouponError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("account_inactive")) return "This account is suspended and cannot redeem a trial coupon.";
  if (normalized.includes("already_redeemed")) return "This account has already redeemed that coupon.";
  if (normalized.includes("not_found")) return "That coupon code was not recognized.";
  if (normalized.includes("not_started")) return "That coupon is not available yet.";
  if (normalized.includes("expired")) return "That coupon has expired.";
  if (normalized.includes("inactive")) return "That coupon is no longer active.";
  if (normalized.includes("limit_reached")) return "That coupon has reached its claim limit.";
  if (normalized.includes("trial_only")) return "Trial coupons are for unpaid trials, including trials that have ended.";
  return "The coupon could not be applied. Please try again or contact support.";
}
