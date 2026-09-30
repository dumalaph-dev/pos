import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

test("trial coupons enforce one claim per organization and serialize the global claim limit", () => {
  const migration = read("supabase/migrations/0094_platform_trial_coupons.sql");
  assert.match(migration, /months between 1 and 12/);
  assert.match(migration, /unique \(coupon_id, organization_id\)/);
  assert.match(migration, /where code = v_code\s+for update/i);
  assert.match(migration, /count\(\*\)::integer into v_count/i);
  assert.match(migration, /max_redemptions is not null and v_count >= v_coupon\.max_redemptions/i);
  assert.match(migration, /make_interval\(months => v_coupon\.months\)/);
});

test("redemption is limited to current unpaid trials and records the trial change atomically", () => {
  const migration = read("supabase/migrations/0094_platform_trial_coupons.sql");
  assert.match(migration, /account_status[^;]*<> 'active'/i);
  assert.match(migration, /subscription_status <> 'trialing'/i);
  assert.match(migration, /subscription_trial_ends_at <= now\(\)/i);
  assert.match(migration, /subscription_provider_subscription_id is not null/i);
  assert.match(migration, /subscription_provider_payment_intent_id is not null/i);
  assert.match(migration, /insert into public\.platform_trial_coupon_redemptions/i);
  assert.match(migration, /platform\.trial\.coupon_redeemed/);
  assert.match(migration, /revoke all on function public\.redeem_platform_trial_coupon[^;]*anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.redeem_platform_trial_coupon[^;]*service_role/i);
});

test("business redemption verifies an owner session and calls only the server RPC", () => {
  const action = read("src/app/admin/billing/actions.ts");
  const page = read("src/app/admin/billing/page.tsx");
  assert.match(action, /getAuthenticatedUser\(\)/);
  assert.match(action, /profile\.role !== "admin"/);
  assert.match(action, /rpc\("redeem_platform_trial_coupon"/);
  assert.match(page, /trialAccessIsCurrent && !organization\?\.subscription_provider_subscription_id/);
  assert.match(page, /<TrialCouponRedeemer \/>/);
});

test("platform coupon creator bounds duration and exposes claim controls", () => {
  const action = read("src/app/platform/actions.ts");
  const editor = read("src/app/platform/PlatformTrialCouponEditor.tsx");
  assert.match(action, /requirePlatformOperator\("billing_manage"\)/);
  assert.match(action, /months < 1 \|\| months > 12/);
  assert.match(editor, /name="months" type="number" min="1" max="12"/);
  assert.match(editor, /name="max_redemptions"/);
  assert.match(editor, /togglePlatformTrialCoupon/);
});
