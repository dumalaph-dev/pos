import { isProductImageUrl } from "@/lib/product-images";

export const ADMIN_THEME_IDS = ["default", "current", "light", "dark", "retro"] as const;

export type AdminThemeId = (typeof ADMIN_THEME_IDS)[number];

export const ADMIN_THEME_OPTIONS: Array<{
  id: AdminThemeId;
  label: string;
  description: string;
}> = [
  // `default` is the house theme documented in docs/THEME_STYLE_GUIDE.md.
  // The themes below it are independent — changing the style guide must not
  // change them.
  { id: "default", label: "Default", description: "Forest green, gold, and cream paper" },
  { id: "current", label: "Classic", description: "Warm paper, cocoa, and cream" },
  { id: "light", label: "Light", description: "Soft neutrals with sage accents" },
  { id: "dark", label: "Dark", description: "Charcoal surfaces with calm mint" },
  { id: "retro", label: "Retro", description: "Market green, mustard, and cream" },
];

export const DEFAULT_ORGANIZATION_NAME = "Your Business";

export const DEFAULT_ADMIN_BRANDING = {
  brandName: "Dumala",
  brandTagline: "POS",
  theme: "default" as AdminThemeId,
  logoUrl: "/logo.png" as string | null,
};

export type AdminBranding = {
  brandName: string;
  brandTagline: string;
  theme: AdminThemeId;
  logoUrl: string | null;
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
    logoUrl: isProductImageUrl(dashboard.logo_url) ? dashboard.logo_url : DEFAULT_ADMIN_BRANDING.logoUrl,
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
      logo_url: branding.logoUrl,
    },
  };
}
