import { createClient } from "@/lib/supabase/server";
import { mergeBusinessPresetSetting } from "./business";

type AdminSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function saveOrganizationBusinessPreset(
  supabase: AdminSupabaseClient,
  orgId: string,
  presetId: string,
) {
  const { data: organization, error: readError } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();

  if (readError) return readError.message || "Business settings could not be read.";
  if (!organization) return "Business settings could not be found.";

  const { error } = await supabase
    .from("organizations")
    .update({ settings: mergeBusinessPresetSetting(organization.settings, presetId) })
    .eq("id", orgId);

  return error?.message || null;
}
