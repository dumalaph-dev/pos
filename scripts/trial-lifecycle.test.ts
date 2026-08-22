import assert from "node:assert/strict";
import test from "node:test";
import {
  getBillingAccessReason,
  isSubscriptionAccessCurrent,
  readTrialLifecycle,
  TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
} from "../src/lib/trial.ts";

const TRIAL_END = "2026-08-10T00:00:00.000Z";

test("trial access is active immediately before the end and expired at the boundary", () => {
  const end = Date.parse(TRIAL_END);
  const before = readTrialLifecycle({ status: "trialing", trialEndsAt: TRIAL_END }, end - 1);
  const atEnd = readTrialLifecycle({ status: "trialing", trialEndsAt: TRIAL_END }, end);

  assert.equal(before.isActive, true);
  assert.equal(before.isExpired, false);
  assert.equal(atEnd.isActive, false);
  assert.equal(atEnd.isExpired, true);
  assert.equal(isSubscriptionAccessCurrent({ status: "trialing", trialEndsAt: TRIAL_END }, end - 1), true);
  assert.equal(isSubscriptionAccessCurrent({ status: "trialing", trialEndsAt: TRIAL_END }, end), false);
});

test("an expired trial remains visible to Billing after persistence changes its status", () => {
  const end = Date.parse(TRIAL_END);
  const lifecycle = readTrialLifecycle({
    status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
    trialEndsAt: TRIAL_END,
  }, end);

  assert.equal(lifecycle.isExpired, true);
  assert.equal(readTrialLifecycle({
    status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
    trialEndsAt: TRIAL_END,
    providerSubscriptionId: "sub_paid",
  }, end).known, false);
  assert.equal(isSubscriptionAccessCurrent({
    status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
    trialEndsAt: TRIAL_END,
  }, end), false);
});

test("a successful payment restores protected access immediately", () => {
  const end = Date.parse(TRIAL_END);
  assert.equal(isSubscriptionAccessCurrent({
    status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
    trialEndsAt: TRIAL_END,
  }, end), false);
  assert.equal(isSubscriptionAccessCurrent({
    status: "active",
    trialEndsAt: TRIAL_END,
  }, end), true);
});

test("protected-route billing redirects distinguish expired trials from other access endings", () => {
  const end = Date.parse(TRIAL_END);

  assert.equal(getBillingAccessReason({
    status: TRIAL_EXPIRED_SUBSCRIPTION_STATUS,
    trialEndsAt: TRIAL_END,
  }, end), "trial_expired");
  assert.equal(getBillingAccessReason({ status: "canceled" }, end), "access_ended");
});

test("temporary QR Ph access is bounded by its prepaid period", () => {
  const end = Date.parse(TRIAL_END);
  assert.equal(isSubscriptionAccessCurrent({
    status: "active",
    currentPeriodEnd: TRIAL_END,
    billingMode: "temporary_qrph",
  }, end - 1), true);
  assert.equal(isSubscriptionAccessCurrent({
    status: "active",
    currentPeriodEnd: TRIAL_END,
    billingMode: "temporary_qrph",
  }, end), false);
});
