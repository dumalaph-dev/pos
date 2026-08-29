import { createAdminClient } from "@/lib/employee-auth";
import { normalizeTrialExtension, type TrialExtensionRecord } from "@/lib/platform-trial";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const EXTENSION_FIELDS = "id, org_id, days, reason, previous_status, new_status, previous_trial_ends_at, new_trial_ends_at, revived, created_by, created_at, metadata";

export async function readOrganizationTrialExtensions(admin: PlatformAdminClient, organizationId: string): Promise<{
  records: TrialExtensionRecord[];
  schemaAvailable: boolean;
}> {
  const result = await admin
    .from("platform_trial_extensions")
    .select(EXTENSION_FIELDS)
    .eq("org_id", organizationId)
    .order("created_at", { ascending: false });

  if (result.error) return { records: [], schemaAvailable: false };
  return {
    records: (result.data ?? []).map((record) => normalizeTrialExtension(record)),
    schemaAvailable: true,
  };
}
