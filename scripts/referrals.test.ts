import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReferralCode,
  normalizeReferralRecord,
  normalizeReferralRewardRecord,
  referralStatusLabel,
} from "../src/lib/referrals.ts";

test("referral codes are normalized and reject unsafe values", () => {
  assert.equal(normalizeReferralCode("  ABCD1234  "), "abcd1234");
  assert.equal(normalizeReferralCode("short"), "");
  assert.equal(normalizeReferralCode("abcd-1234"), "");
  assert.equal(normalizeReferralCode("a".repeat(33)), "");
});

test("referral records default to a pending attribution", () => {
  const record = normalizeReferralRecord({ id: "ref-1", referred_org_id: "org-2" });
  assert.equal(record.status, "pending");
  assert.equal(record.referred_org_id, "org-2");
  assert.equal(referralStatusLabel(record.status), "Signed up");
});

test("reward records preserve issued days and revoke status", () => {
  const reward = normalizeReferralRewardRecord({ reward_days: "7", status: "revoked" });
  assert.equal(reward.reward_days, 7);
  assert.equal(reward.status, "revoked");
});
