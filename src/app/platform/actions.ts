"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/employee-auth";
import { BILLING_CATALOG_TAG } from "@/lib/platform-operations-server";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  calculateBillingVariantPrice,
  normalizeDiscount,
  parsePhpToCentavos,
  type BillingIntervalUnit,
} from "@/lib/platform-operations";
import { normalizePromotionCode } from "@/lib/platform-promotions";

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

export async function savePlatformPromotion(_previousState: PlatformActionState, formData: FormData): Promise<PlatformActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const code = normalizePromotionCode(readText(formData, "code"));
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const discountType = readText(formData, "discount_type");
  const discountValue = Number(readText(formData, "discount_value"));
  const appliesTo = readText(formData, "applies_to");
  const startsAtInput = readText(formData, "starts_at");
  const endsAtInput = readText(formData, "ends_at");
  const startsAt = readDateTime(startsAtInput);
  const endsAt = readDateTime(endsAtInput);
  const maxRedemptionsValue = readText(formData, "max_redemptions");

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { ok: false, message: "Use 3–32 letters, numbers, hyphens, or underscores for the code." };
  if (!name || name.length > 80) return { ok: false, message: "Add a promotion name of 1–80 characters." };
  if (description.length > 240) return { ok: false, message: "Keep the description to 240 characters or fewer." };
  if (discountType !== "percentage" && discountType !== "fixed") return { ok: false, message: "Choose a valid discount type." };
  if (!Number.isFinite(discountValue) || discountValue <= 0) return { ok: false, message: "Enter a discount value greater than zero." };
  if (discountType === "percentage" && (discountValue < 0.01 || discountValue > 100)) return { ok: false, message: "Percentage discounts must be between 0.01 and 100." };
  if (discountType === "fixed" && (!Number.isSafeInteger(Math.round(discountValue * 100)) || Math.round(discountValue * 100) < 1 || discountValue > 10_000)) return { ok: false, message: "Fixed discounts must be a valid PHP amount from ₱0.01 to ₱10,000." };
  if (appliesTo !== "all" && appliesTo !== "monthly" && appliesTo !== "annual") return { ok: false, message: "Choose which billing options the promotion applies to." };
  if ((startsAtInput && !startsAt) || (endsAtInput && !endsAt)) return { ok: false, message: "Enter valid campaign dates using Singapore time." };
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return { ok: false, message: "The end date must be after the start date." };

  const maxRedemptions = maxRedemptionsValue ? Number(maxRedemptionsValue) : null;
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1_000_000)) {
    return { ok: false, message: "Redemption limits must be whole numbers from 1 to 1,000,000." };
  }

  const result = await actor.admin.from("platform_promotions").insert({
    code,
    name,
    description,
    discount_type: discountType,
    discount_percent: discountType === "percentage" ? Math.round(discountValue * 100) / 100 : null,
    discount_amount_centavos: discountType === "fixed" ? Math.round(discountValue * 100) : null,
    applies_to: appliesTo,
    starts_at: startsAt,
    ends_at: endsAt,
    max_redemptions: maxRedemptions,
    is_active: true,
    created_by: actor.userId,
    updated_at: new Date().toISOString(),
  });
  if (result.error) {
    if (result.error.code === "23505") return { ok: false, message: "That promotion code already exists. Use a different code." };
    return promotionMigrationError(result.error.message);
  }

  revalidatePlatformPages();
  return { ok: true, message: `${code} is live and ready to use in checkout.` };
}

export async function togglePlatformPromotion(_previousState: PlatformActionState, formData: FormData): Promise<PlatformActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const id = readText(formData, "promotion_id");
  const isActive = readText(formData, "is_active") === "true";
  if (!isUuid(id)) return { ok: false, message: "That promotion could not be identified." };

  const result = await actor.admin
    .from("platform_promotions")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (result.error) return promotionMigrationError(result.error.message);

  revalidatePlatformPages();
  return { ok: true, message: !isActive ? "Promotion activated." : "Promotion paused." };
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

function promotionMigrationError(detail: string): PlatformActionState {
  const lower = detail.toLowerCase();
  if (lower.includes("does not exist") || lower.includes("relation") || lower.includes("column")) {
    return { ok: false, message: "Apply Supabase migration 0040_platform_promotions.sql before managing promotion codes." };
  }
  return { ok: false, message: detail || "The promotion could not be saved." };
}

function revalidatePlatformPages() {
  // The public pages read the catalog through a cached wrapper keyed by this
  // tag. revalidatePath alone would drop their rendered output but hand the
  // next render the same stale cache entry, so a price edit would not reach the
  // landing page until the TTL expired.
  //
  // "max" is stale-while-revalidate: the first public visitor after an edit may
  // still be served the old price while the new one is fetched behind them.
  // That is the right trade here — the operator's own console reads the catalog
  // uncached, so they always see their write immediately, and the alternative
  // (`updateTag`) is only documented against `fetch` and `use cache` tags, not
  // the `unstable_cache` entry this invalidates.
  revalidateTag(BILLING_CATALOG_TAG, "max");
  revalidatePath("/");
  revalidatePath("/platform");
  revalidatePath("/platform/plans");
  revalidatePath("/platform/policies");
  revalidatePath("/platform/users");
  revalidatePath("/platform/operations");
  revalidatePath("/platform/promotions");
  revalidatePath("/admin/billing");
  revalidatePath("/signup");
}

function readDateTime(value: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "00");
  const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    localDate.getUTCFullYear() !== year
    || localDate.getUTCMonth() !== month - 1
    || localDate.getUTCDate() !== day
    || localDate.getUTCHours() !== hour
    || localDate.getUTCMinutes() !== minute
    || localDate.getUTCSeconds() !== second
  ) return null;
  return new Date(localDate.getTime() - 8 * 60 * 60 * 1000).toISOString();
}
