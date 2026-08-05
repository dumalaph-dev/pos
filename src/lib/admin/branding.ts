export const ADMIN_THEME_IDS = ["current", "light", "dark"] as const;

export type AdminThemeId = (typeof ADMIN_THEME_IDS)[number];

export const ADMIN_THEME_OPTIONS: Array<{
  id: AdminThemeId;
  label: string;
  description: string;
}> = [
  { id: "current", label: "Current", description: "Warm paper and lechon brown" },
  { id: "light", label: "Light", description: "Clean white and soft blue" },
  { id: "dark", label: "Dark", description: "Low-glare espresso workspace" },
];

export const DEFAULT_ORGANIZATION_NAME = "Rico's Lechon House";

export const DEFAULT_ADMIN_BRANDING = {
  brandName: "Rico's",
  brandTagline: "LECHON HOUSE",
  theme: "current" as AdminThemeId,
};

export type AdminBranding = {
  brandName: string;
  brandTagline: string;
  theme: AdminThemeId;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback;
}

export function isAdminThemeId(value: unknown): value is AdminThemeId {
  return typeof value === "string" && (ADMIN_THEME_IDS as readonly string[]).includes(value);
}

export function readAdminBranding(settings: unknown): AdminBranding {
  const dashboard = asRecord(asRecord(settings).admin_dashboard);
  const theme = isAdminThemeId(dashboard.theme) ? dashboard.theme : DEFAULT_ADMIN_BRANDING.theme;

  return {
    brandName: readString(dashboard.brand_name, DEFAULT_ADMIN_BRANDING.brandName),
    brandTagline: readOptionalString(dashboard.brand_tagline, DEFAULT_ADMIN_BRANDING.brandTagline),
    theme,
  };
}

export function mergeAdminBrandingSettings(settings: unknown, branding: AdminBranding) {
  const existing = asRecord(settings);
  const existingDashboard = asRecord(existing.admin_dashboard);

  return {
    ...existing,
    admin_dashboard: {
      ...existingDashboard,
      brand_name: branding.brandName,
      brand_tagline: branding.brandTagline,
      theme: branding.theme,
    },
  };
}
