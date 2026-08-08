"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/employee-auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  calculateBillingVariantPrice,
  normalizeDiscount,
  parsePhpToCentavos,
  type BillingIntervalUnit,
} from "@/lib/platform-operations";

export type PlatformActionState = {
  ok: boolean;
  message: string;
};

type PlatformActionFailure = {
  ok: false;
  message: string;
};

export async function saveBillingCatalog(_previousState: PlatformActionState, formData: FormData): Promise<PlatformActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const monthlyPrice = parsePhpToCentavos(readText(formData, "monthly_price"));
  if (monthlyPrice === null || monthlyPrice < 2_000) {
    return { ok: false, message: "Enter a monthly PHP price of at least ₱20.00 for PayMongo subscription compatibility." };
  }

  const rawVariants = readText(formData, "variants");
  let parsedVariants: unknown;
  try {
    parsedVariants = JSON.parse(rawVariants);
  } catch {
    return { ok: false, message: "The pricing rows could not be read. Refresh the page and try again." };
  }

  if (!Array.isArray(parsedVariants) || parsedVariants.length === 0 || parsedVariants.length > 20) {
    return { ok: false, message: "Add at least one pricing option and keep the catalog to 20 options or fewer." };
  }

  const variants: Array<{
    id: string;
    label: string;
    billing_unit: BillingIntervalUnit;
    interval_count: number;
    discount_percent: number;
    paymongo_plan_id: string | null;
    is_active: boolean;
    sort_order: number;
  }> = [];
  const cycleKeys = new Set<string>();

  for (const [index, row] of parsedVariants.entries()) {
    if (!isRecord(row)) return { ok: false, message: "One pricing row is invalid. Refresh the page and try again." };

    const label = readRecordText(row, "label");
    const intervalUnit = readRecordText(row, "intervalUnit");
    const intervalCount = Number(row.intervalCount);
    const discountPercent = normalizeDiscount(row.discountPercent);
    const id = readRecordText(row, "id");
    const paymongoPlanId = readRecordText(row, "paymongoPlanId");
    const isActive = row.isActive === true;

    if (!label || label.length > 80) return { ok: false, message: `Pricing row ${index + 1} needs a label of 1–80 characters.` };
    if (intervalUnit !== "month" && intervalUnit !== "year") return { ok: false, message: `Pricing row ${index + 1} has an invalid billing interval.` };
    if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 10) return { ok: false, message: `Pricing row ${index + 1} must bill for 1–10 intervals.` };
    if (intervalUnit === "month" && intervalCount !== 1) return { ok: false, message: "Monthly billing must use a one-month interval." };
    if (discountPercent === null) return { ok: false, message: `Discount for pricing row ${index + 1} must be between 0% and 100%.` };
    if (intervalUnit === "month" && discountPercent !== 0) return { ok: false, message: "The monthly base price cannot have a discount." };
    if (isActive && calculateBillingVariantPrice(monthlyPrice, intervalUnit, intervalCount, discountPercent) < 2_000) return { ok: false, message: `Pricing row ${index + 1} would be below PayMongo's minimum active subscription amount after its discount.` };
    if (id && !isUuid(id)) return { ok: false, message: `Pricing row ${index + 1} has an invalid identifier.` };
    const cycleKey = `${intervalUnit}:${intervalCount}`;
    if (cycleKeys.has(cycleKey)) return { ok: false, message: "Each billing duration can only appear once in the catalog." };
    cycleKeys.add(cycleKey);

    variants.push({
      id: id || crypto.randomUUID(),
      label,
      billing_unit: intervalUnit,
      interval_count: intervalCount,
      discount_percent: discountPercent,
      paymongo_plan_id: paymongoPlanId || null,
      is_active: isActive,
      sort_order: index,
    });
  }

  const monthlyVariant = variants.find((variant) => variant.billing_unit === "month" && variant.interval_count === 1);
  if (!monthlyVariant || !monthlyVariant.is_active) return { ok: false, message: "Keep the monthly option in the catalog and offered to customers." };

  const settingsResult = await actor.admin.from("platform_billing_settings").upsert({
    id: "default",
    currency: "PHP",
    monthly_price_centavos: monthlyPrice,
    updated_at: new Date().toISOString(),
  });
  if (settingsResult.error) return migrationError(settingsResult.error.message);

  const variantsResult = await actor.admin.from("platform_billing_variants").upsert(variants, { onConflict: "id" });
  if (variantsResult.error) return migrationError(variantsResult.error.message);

  revalidatePlatformPages();
  return { ok: true, message: "Subscription pricing saved. New checkouts can use this catalog after the policy gate and PayMongo setup are complete." };
}

export async function savePlatformPolicy(_previousState: PlatformActionState, formData: FormData): Promise<PlatformActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const policyKey = readText(formData, "policy_key");
  if (policyKey !== "billing" && policyKey !== "support") return { ok: false, message: "Choose a valid platform policy." };

  const intent = readText(formData, "intent") === "publish" ? "published" : "draft";
  const summary = readText(formData, "summary");
  if (!summary || summary.length > 500) return { ok: false, message: "Add a short policy summary of up to 500 characters." };

  const settings = policyKey === "billing" ? readBillingPolicySettings(formData) : readSupportPolicySettings(formData);
  if (!settings.ok) return settings;

  if (intent === "published" && policyKey === "support") {
    const email = String((settings.settings as { supportEmail?: string }).supportEmail ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Add a valid support email before publishing the support policy." };
  }

  const existing = await actor.admin.from("platform_policies").select("version").eq("policy_key", policyKey).maybeSingle();
  if (existing.error) return migrationError(existing.error.message);

  const result = await actor.admin.from("platform_policies").upsert({
    policy_key: policyKey,
    status: intent,
    version: Number(existing.data?.version ?? 0) + 1,
    summary,
    settings: settings.settings,
    published_at: intent === "published" ? new Date().toISOString() : null,
    updated_by: actor.userId,
    updated_at: new Date().toISOString(),
  });
  if (result.error) return migrationError(result.error.message);

  revalidatePlatformPages();
  return {
    ok: true,
    message: intent === "published"
      ? `${policyKey === "billing" ? "Billing" : "Support"} policy published. ${policyKey === "billing" ? "Checkout" : "Support actions"} still require the remaining policy to be published.`
      : `${policyKey === "billing" ? "Billing" : "Support"} policy saved as a draft.`,
  };
}

async function requirePlatformAdmin(): Promise<{ ok: true; admin: NonNullable<ReturnType<typeof createAdminClient>>; userId: string } | PlatformActionFailure> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, message: "Your session has expired. Sign in again to manage platform operations." };
  if (!isPlatformAdminEmail(user.email)) return { ok: false, message: "Platform administrator access is required." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "The platform database client is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };
  return { ok: true, admin, userId: user.id };
}

function readBillingPolicySettings(formData: FormData) {
  const trialDays = readBoundedInteger(formData, "trial_days", 0, 365);
  const paymentGraceDays = readBoundedInteger(formData, "payment_grace_days", 0, 90);
  const refundWindowDays = readBoundedInteger(formData, "refund_window_days", 0, 365);
  const priceChangeNoticeDays = readBoundedInteger(formData, "price_change_notice_days", 0, 365);
  const annualRenewal = readText(formData, "annual_renewal");

  if (trialDays === null || paymentGraceDays === null || refundWindowDays === null || priceChangeNoticeDays === null) {
    return { ok: false as const, message: "Billing policy day values must be whole numbers within their allowed ranges." };
  }
  if (annualRenewal !== "auto_renew" && annualRenewal !== "manual_review") {
    return { ok: false as const, message: "Choose how annual subscriptions renew." };
  }

  return {
    ok: true as const,
    settings: { trialDays, paymentGraceDays, refundWindowDays, priceChangeNoticeDays, annualRenewal },
  };
}

function readSupportPolicySettings(formData: FormData) {
  const firstResponseHours = readBoundedInteger(formData, "first_response_hours", 1, 720);
  const supportHours = readText(formData, "support_hours");
  const supportEmail = readText(formData, "support_email");
  const escalationPath = readText(formData, "escalation_path");

  if (firstResponseHours === null) return { ok: false as const, message: "First response time must be a whole number from 1 to 720 hours." };
  if (!supportHours || supportHours.length > 160) return { ok: false as const, message: "Add support coverage hours of up to 160 characters." };
  if (supportEmail.length > 160) return { ok: false as const, message: "Support email must be at most 160 characters." };
  if (escalationPath.length > 500) return { ok: false as const, message: "Escalation instructions must be at most 500 characters." };

  return { ok: true as const, settings: { firstResponseHours, supportHours, supportEmail, escalationPath } };
}

function readBoundedInteger(formData: FormData, name: string, min: number, max: number) {
  const value = Number(readText(formData, name));
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordText(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function migrationError(detail: string): PlatformActionState {
  const lower = detail.toLowerCase();
  if (lower.includes("does not exist") || lower.includes("relation") || lower.includes("column")) {
    return { ok: false, message: "Apply Supabase migration 0027_platform_operations.sql before saving platform policies or pricing." };
  }
  return { ok: false, message: detail || "The platform operation could not be saved." };
}

function revalidatePlatformPages() {
  revalidatePath("/");
  revalidatePath("/platform");
  revalidatePath("/admin/billing");
  revalidatePath("/signup");
}
