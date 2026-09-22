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
  hasMore: boolean;
};

export async function readOrganizationAccessGrants(admin: PlatformAdminClient, organizationId: string): Promise<PlatformAccessGrantRead> {
  return readPlatformAccessGrants(admin, organizationId);
}

export async function readAllPlatformAccessGrants(admin: PlatformAdminClient, organizationIds?: string[]): Promise<PlatformAccessGrantRead> {
  return readPlatformAccessGrants(admin, undefined, organizationIds);
}

async function readPlatformAccessGrants(admin: PlatformAdminClient, organizationId?: string, organizationIds?: string[]): Promise<PlatformAccessGrantRead> {
  const scopedDirectoryRead = organizationIds !== undefined;
  if (organizationIds?.length === 0) {
    const [schema, adjustment] = await Promise.all([
      admin
        .from("platform_access_grants")
        .select("id")
        .limit(1),
      admin
        .from("platform_access_grants")
        .select("id, updated_at")
        .limit(1),
    ]);
    return {
      records: [],
      schemaAvailable: !schema.error,
      adjustmentSchemaAvailable: !adjustment.error,
      hasMore: false,
    };
  }

  let query = admin
    .from("platform_access_grants")
    .select(GRANT_FIELDS, { count: "exact" })
    .order("created_at", { ascending: false });
  if (organizationId) query = query.eq("org_id", organizationId);
  if (organizationIds && organizationIds.length > 0) query = query.in("org_id", organizationIds);
  if (scopedDirectoryRead) query = query.limit(5000);

  const [result, adjustment] = await Promise.all([
    query,
    admin
      .from("platform_access_grants")
      .select("id, updated_at")
      .limit(1),
  ]);

  if (result.error) return { records: [], schemaAvailable: false, adjustmentSchemaAvailable: false, hasMore: false };
  const records = (result.data ?? []).map((record) => normalizeComplimentaryGrant(record));
  return {
    records,
    schemaAvailable: true,
    adjustmentSchemaAvailable: !adjustment.error,
    hasMore: scopedDirectoryRead && (typeof result.count === "number" ? result.count > records.length : records.length === 5000),
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
