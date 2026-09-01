import { createAdminClient } from "@/lib/employee-auth";
import {
  normalizeComplimentaryGrant,
  readEffectiveComplimentaryAccess,
  type ComplimentaryAccessGrant,
  type EffectiveComplimentaryAccess,
} from "@/lib/platform-access";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const GRANT_FIELDS = "id, org_id, source, status, starts_at, ends_at, reason, created_by, created_at, revoked_by, revoked_at, metadata";

export type PlatformAccessGrantRead = {
  records: ComplimentaryAccessGrant[];
  schemaAvailable: boolean;
  adjustmentSchemaAvailable: boolean;
};

export async function readOrganizationAccessGrants(admin: PlatformAdminClient, organizationId: string): Promise<PlatformAccessGrantRead> {
  return readPlatformAccessGrants(admin, organizationId);
}

export async function readAllPlatformAccessGrants(admin: PlatformAdminClient): Promise<PlatformAccessGrantRead> {
  return readPlatformAccessGrants(admin);
}

async function readPlatformAccessGrants(admin: PlatformAdminClient, organizationId?: string): Promise<PlatformAccessGrantRead> {
  let query = admin
    .from("platform_access_grants")
    .select(GRANT_FIELDS)
    .order("created_at", { ascending: false });
  if (organizationId) query = query.eq("org_id", organizationId);

  const [result, adjustment] = await Promise.all([
    query,
    admin
      .from("platform_access_grants")
      .select("id, updated_at")
      .limit(1),
  ]);

  if (result.error) return { records: [], schemaAvailable: false, adjustmentSchemaAvailable: false };
  return {
    records: (result.data ?? []).map((record) => normalizeComplimentaryGrant(record)),
    schemaAvailable: true,
    adjustmentSchemaAvailable: !adjustment.error,
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
