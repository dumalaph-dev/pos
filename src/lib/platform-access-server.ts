import { createAdminClient } from "@/lib/employee-auth";
import {
  normalizeComplimentaryGrant,
  readEffectiveComplimentaryAccess,
  type ComplimentaryAccessGrant,
  type EffectiveComplimentaryAccess,
} from "@/lib/platform-access";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const GRANT_FIELDS = "id, org_id, source, status, starts_at, ends_at, reason, created_by, created_at, revoked_by, revoked_at, metadata";

export async function readOrganizationAccessGrants(admin: PlatformAdminClient, organizationId: string): Promise<{
  records: ComplimentaryAccessGrant[];
  schemaAvailable: boolean;
}> {
  const result = await admin
    .from("platform_access_grants")
    .select(GRANT_FIELDS)
    .eq("org_id", organizationId)
    .order("created_at", { ascending: false });

  if (result.error) return { records: [], schemaAvailable: false };
  return {
    records: (result.data ?? []).map((record) => normalizeComplimentaryGrant(record)),
    schemaAvailable: true,
  };
}

export async function readCurrentComplimentaryAccess(admin: PlatformAdminClient, organizationId: string): Promise<EffectiveComplimentaryAccess | null> {
  const now = new Date().toISOString();
  const result = await admin
    .from("platform_access_grants")
    .select(GRANT_FIELDS)
    .eq("org_id", organizationId)
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: false })
    .limit(20);

  if (result.error) return null;
  return readEffectiveComplimentaryAccess((result.data ?? []).map((record) => normalizeComplimentaryGrant(record)));
}
