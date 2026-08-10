import { getCatalogPreset } from "@/lib/catalog-presets";

export const BUSINESS_PRESET_SETTING_KEY = "business_preset_id";
export const LECHON_HOUSE_PRESET_ID = "lechon-house";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

export function readBusinessPresetId(settings: unknown): string | null {
  const value = asRecord(settings)[BUSINESS_PRESET_SETTING_KEY];
  return typeof value === "string" && getCatalogPreset(value) ? value : null;
}

export function mergeBusinessPresetSetting(settings: unknown, presetId: string): JsonRecord {
  return {
    ...asRecord(settings),
    [BUSINESS_PRESET_SETTING_KEY]: presetId,
  };
}

export function isLechonHouseBusiness(settings: unknown) {
  return readBusinessPresetId(settings) === LECHON_HOUSE_PRESET_ID;
}
