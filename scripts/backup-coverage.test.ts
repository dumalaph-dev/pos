import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.resolve(process.cwd(), "scripts", "backup-production.mjs"), "utf8");
const tableBlock = /const TABLES = \[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
const tables = new Set([...tableBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]));

const currentApplicationTables = [
  "admin_mutation_receipts", "admin_performance_samples", "admin_sync_health_snapshots", "attendance_logs", "audit_logs", "billing_provider_events", "categories", "customers", "devices", "discount_approvals", "display_gallery_items", "display_promotions", "employee_login_attempts", "employee_records", "employee_roles", "expenses", "inventory_counts", "inventory_items", "leave_requests", "online_order_attempts", "online_order_items", "online_order_phone_verifications", "online_orders", "order_action_approvals", "order_item_consumptions", "order_items", "orders", "organizations", "payroll_records", "platform_access_grants", "platform_announcement_audit_logs", "platform_announcements", "platform_attention_audit_logs", "platform_attention_occurrences", "platform_billing_settings", "platform_billing_variants", "platform_follow_up_task_audit_logs", "platform_follow_up_tasks", "platform_mutation_requests", "platform_operator_audit_logs", "platform_operators", "platform_policies", "platform_promotion_redemptions", "platform_promotions", "platform_referral_codes", "platform_referral_reward_ledger", "platform_referrals", "platform_trial_extensions", "product_recipe_items", "product_recipes", "products", "profiles", "shifts", "stock_movements", "stores", "suppliers", "support_case_events", "support_case_notes", "support_cases", "trial_feedback", "z_readings",
] as const;

test("logical backup allowlist covers every current application table", () => {
  const missing = currentApplicationTables.filter((table) => !tables.has(table));
  assert.deepEqual(missing, [], `backup-production.mjs is missing: ${missing.join(", ")}`);
  assert.equal(tables.size, currentApplicationTables.length, "backup allowlist should not contain duplicate or unknown table entries");
});

test("Wave 1 recovery evidence includes integrity and consistency declarations", () => {
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /consistency: "best_effort_api_snapshot"/);
  for (const table of ["platform_mutation_requests", "support_case_events", "support_case_notes"]) {
    assert.match(source, new RegExp(`"${table}"`));
  }
});
