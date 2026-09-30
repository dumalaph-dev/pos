import type { createAdminClient } from "./employee-auth.ts";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type PlatformTrialCoupon = {
  id: string;
  code: string;
  name: string;
  months: number;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redemptions: number;
  isActive: boolean;
  createdAt: string;
};

export async function readPlatformTrialCoupons(admin: PlatformAdminClient) {
  const result = await admin
    .from("platform_trial_coupons")
    .select("id, code, name, months, starts_at, ends_at, max_redemptions, is_active, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (result.error) return { schemaAvailable: false, coupons: [] as PlatformTrialCoupon[] };

  const ids = (result.data ?? []).map((row) => row.id).filter((id): id is string => typeof id === "string");
  const redemptionResult = ids.length
    ? await admin.from("platform_trial_coupon_redemptions").select("coupon_id").in("coupon_id", ids)
    : { data: [], error: null };
  if (redemptionResult.error) return { schemaAvailable: false, coupons: [] as PlatformTrialCoupon[] };

  const counts = new Map<string, number>();
  for (const row of redemptionResult.data ?? []) {
    if (typeof row.coupon_id === "string") counts.set(row.coupon_id, (counts.get(row.coupon_id) ?? 0) + 1);
  }
  return {
    schemaAvailable: true,
    coupons: (result.data ?? []).flatMap((row) => {
      if (typeof row.id !== "string" || typeof row.code !== "string" || typeof row.name !== "string") return [];
      return [{
        id: row.id,
        code: row.code,
        name: row.name,
        months: Number(row.months) || 0,
        startsAt: typeof row.starts_at === "string" ? row.starts_at : null,
        endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
        maxRedemptions: row.max_redemptions === null ? null : Number(row.max_redemptions),
        redemptions: counts.get(row.id) ?? 0,
        isActive: Boolean(row.is_active),
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
      }];
    }),
  };
}
