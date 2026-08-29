import assert from "node:assert/strict";
import test from "node:test";
import {
  previewExtendedTrialEnd,
  readTrialExtensionEligibility,
  sumTrialExtensionDays,
  TRIAL_EXTENSION_MAX_DAYS_LIFETIME,
  TRIAL_EXTENSION_MAX_DAYS_PER_ACTION,
  type TrialExtensionRecord,
} from "../src/lib/platform-trial.ts";

const AS_OF = Date.parse("2026-08-29T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function extension(overrides: Partial<TrialExtensionRecord> = {}): TrialExtensionRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    org_id: "00000000-0000-4000-8000-000000000010",
    days: 14,
    reason: "Onboarding delayed while the owner waited on hardware",
    previous_status: "trialing",
    new_status: "trialing",
    previous_trial_ends_at: "2026-08-25T00:00:00.000Z",
    new_trial_ends_at: "2026-09-08T00:00:00.000Z",
    revived: false,
    created_by: null,
    created_at: "2026-08-25T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

test("a live trial can be extended", () => {
  const eligibility = readTrialExtensionEligibility({ status: "trialing" });
  assert.equal(eligibility.canExtend, true);
  assert.equal(eligibility.block, "none");
  assert.equal(eligibility.revives, false);
});

test("a trial-expired pause can be extended and is marked as a revive", () => {
  const eligibility = readTrialExtensionEligibility({ status: "paused" });
  assert.equal(eligibility.canExtend, true);
  assert.equal(eligibility.revives, true);
});

test("a pause carrying provider records is a billing failure and is refused", () => {
  const bySubscription = readTrialExtensionEligibility({ status: "paused", providerSubscriptionId: "sub_123" });
  assert.equal(bySubscription.canExtend, false);
  assert.equal(bySubscription.block, "billing_pause");

  const byPaymentIntent = readTrialExtensionEligibility({ status: "paused", providerPaymentIntentId: "pi_123" });
  assert.equal(byPaymentIntent.canExtend, false);
  assert.equal(byPaymentIntent.block, "billing_pause");
});

test("paying and cancelled subscription states are refused", () => {
  for (const status of ["active", "past_due", "canceled", "incomplete"]) {
    const eligibility = readTrialExtensionEligibility({ status });
    assert.equal(eligibility.canExtend, false, `${status} must not be extendable`);
    assert.equal(eligibility.block, "billing_subscription");
  }
});

test("a suspended account is refused before any subscription check", () => {
  const eligibility = readTrialExtensionEligibility({ status: "trialing", accountStatus: "suspended" });
  assert.equal(eligibility.canExtend, false);
  assert.equal(eligibility.block, "account_suspended");
});

test("an unknown subscription state is refused rather than assumed", () => {
  assert.equal(readTrialExtensionEligibility({ status: null }).block, "subscription_unknown");
  assert.equal(readTrialExtensionEligibility({ status: undefined }).canExtend, false);
});

test("the lifetime cap closes the action and bounds the per-action maximum", () => {
  const atCap = readTrialExtensionEligibility({ status: "trialing", daysUsed: TRIAL_EXTENSION_MAX_DAYS_LIFETIME });
  assert.equal(atCap.canExtend, false);
  assert.equal(atCap.block, "cap_reached");
  assert.equal(atCap.daysRemaining, 0);

  const nearCap = readTrialExtensionEligibility({ status: "trialing", daysUsed: TRIAL_EXTENSION_MAX_DAYS_LIFETIME - 5 });
  assert.equal(nearCap.canExtend, true);
  assert.equal(nearCap.maxDays, 5);

  const fresh = readTrialExtensionEligibility({ status: "trialing", daysUsed: 0 });
  assert.equal(fresh.maxDays, TRIAL_EXTENSION_MAX_DAYS_PER_ACTION);
});

test("extending a live trial appends to the time that is left", () => {
  const endsAt = new Date(AS_OF + 3 * DAY_MS).toISOString();
  const preview = previewExtendedTrialEnd(endsAt, 7, AS_OF);
  assert.equal(preview, new Date(AS_OF + 10 * DAY_MS).toISOString());
});

test("extending a lapsed trial restarts from today instead of burning days on the gap", () => {
  const endsAt = new Date(AS_OF - 30 * DAY_MS).toISOString();
  const preview = previewExtendedTrialEnd(endsAt, 7, AS_OF);
  assert.equal(preview, new Date(AS_OF + 7 * DAY_MS).toISOString());
});

test("a missing or invalid trial end falls back to today", () => {
  assert.equal(previewExtendedTrialEnd(null, 7, AS_OF), new Date(AS_OF + 7 * DAY_MS).toISOString());
  assert.equal(previewExtendedTrialEnd("not-a-date", 7, AS_OF), new Date(AS_OF + 7 * DAY_MS).toISOString());
});

test("a non-positive or fractional day count has no preview", () => {
  assert.equal(previewExtendedTrialEnd(null, 0, AS_OF), null);
  assert.equal(previewExtendedTrialEnd(null, -3, AS_OF), null);
  assert.equal(previewExtendedTrialEnd(null, 1.5, AS_OF), null);
});

test("operator days are summed across every recorded extension", () => {
  assert.equal(sumTrialExtensionDays([]), 0);
  assert.equal(sumTrialExtensionDays([extension({ days: 14 }), extension({ days: 30 })]), 44);
});
