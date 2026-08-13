import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createTtlCache } from "@/lib/ttl-cache";

export type AdminConnectionSnapshot = {
  lastSyncedLabel: string | null;
};

const CONNECTION_TTL_MS = 15_000;
const connections = createTtlCache<AdminConnectionSnapshot>(CONNECTION_TTL_MS);

function formatLastSynced(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(date);
}

/**
 * Connection status is advisory UI metadata, not an authorization decision.
 * Keep it briefly per user/organization/branch so the admin shell does not
 * block every navigation on the same device-heartbeat query.
 */
export const getAdminConnection = cache(async (
  userId: string,
  orgId: string,
  storeId: string | null,
): Promise<AdminConnectionSnapshot> => {
  const key = `${userId}:${orgId}:${storeId ?? "all"}`;
  return connections.fetch(key, async () => {
    try {
      const supabase = await createClient();
      let query = supabase
        .from("devices")
        .select("last_seen_at")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (storeId) query = query.eq("store_id", storeId);
      const { data } = await query.maybeSingle();
      const lastSeenAt = typeof data?.last_seen_at === "string" ? data.last_seen_at : null;
      return { lastSyncedLabel: formatLastSynced(lastSeenAt) };
    } catch {
      return { lastSyncedLabel: null };
    }
  });
});
