import { createAdminClient } from "@/lib/employee-auth";
import { normalizeTrialExtension, type TrialExtensionRecord } from "@/lib/platform-trial";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const EXTENSION_FIELDS = "id, org_id, days, reason, previous_status, new_status, previous_trial_ends_at, new_trial_ends_at, revived, created_by, created_at, metadata";

export type PlatformTrialExtensionRead = {
  records: TrialExtensionRecord[];
  schemaAvailable: boolean;
  hasMore: boolean;
};

export async function readOrganizationTrialExtensions(admin: PlatformAdminClient, organizationId: string): Promise<PlatformTrialExtensionRead> {
  const result = await admin
    .from("platform_trial_extensions")
    .select(EXTENSION_FIELDS)
    .eq("org_id", organizationId)
    .order("created_at", { ascending: false });

  if (result.error) return { records: [], schemaAvailable: false, hasMore: false };
  return {
    records: (result.data ?? []).map((record) => normalizeTrialExtension(record)),
    schemaAvailable: true,
    hasMore: false,
  };
}

export async function readAllPlatformTrialExtensions(admin: PlatformAdminClient, organizationIds?: string[]): Promise<PlatformTrialExtensionRead> {
  const scopedDirectoryRead = organizationIds !== undefined;
  if (organizationIds?.length === 0) {
    const schema = await admin
      .from("platform_trial_extensions")
      .select("id")
      .limit(1);
    return {
      records: [],
      schemaAvailable: !schema.error,
      hasMore: false,
    };
  }

  let query = admin
    .from("platform_trial_extensions")
    .select(EXTENSION_FIELDS, { count: "exact" })
    .order("created_at", { ascending: false });
  if (organizationIds && organizationIds.length > 0) query = query.in("org_id", organizationIds);
  const limit = scopedDirectoryRead ? 5000 : 10000;
  const result = await query.limit(limit);

  if (result.error) return { records: [], schemaAvailable: false, hasMore: false };
  const records = (result.data ?? []).map((record) => normalizeTrialExtension(record));
  return {
    records,
    schemaAvailable: true,
    hasMore: typeof result.count === "number" ? result.count > records.length : records.length === limit,
  };
}
