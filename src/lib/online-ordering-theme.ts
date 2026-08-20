import { getPosTheme, getPosThemeDisplayColors, type PosThemeId } from "@/lib/pos-theme";
import type { OnlineOrderingBranding } from "@/lib/online-ordering";

export type PublicMenuThemeVariables = Record<string, string>;

/**
 * The public menu uses the same visual vocabulary as the POS, but keeps its
 * own semantic variable names so a customer-facing preview cannot alter the
 * authenticated POS shell.
 */
function hexToRgb(hex: string) {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function relativeLuminance(hex: string) {
  const { red, green, blue } = hexToRgb(hex);
  return [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(left: string, right: string) {
  const brighter = Math.max(relativeLuminance(left), relativeLuminance(right));
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (brighter + 0.05) / (darker + 0.05);
}

function textOnColor(background: string) {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#173a2b") ? "#ffffff" : "#173a2b";
}

function readableAccentInk(accent: string, fallback: string) {
  return contrastRatio(accent, "#fffdf8") >= 4.5 ? accent : fallback;
}

export function getPublicMenuThemeVariables(themeId: PosThemeId, branding?: OnlineOrderingBranding): PublicMenuThemeVariables {
  const theme = getPosTheme(themeId);
  const colors = getPosThemeDisplayColors(themeId);
  const variables = theme.variables;
  const useBrandPalette = branding?.colorMode === "brand";
  const primary = useBrandPalette ? branding.primaryColor : variables["--pos-theme-topbar"];
  const accent = useBrandPalette ? branding.accentColor : variables["--pos-theme-highlight"];

  return {
    "--public-menu-bg": variables["--pos-theme-bg"],
    "--public-menu-panel": variables["--pos-theme-surface-panel"],
    "--public-menu-surface": variables["--pos-theme-surface"],
    "--public-menu-raised": variables["--pos-theme-surface-raised"],
    "--public-menu-sidebar": variables["--pos-theme-sidebar"],
    "--public-menu-border": variables["--pos-theme-border"],
    "--public-menu-border-strong": variables["--pos-theme-border-strong"],
    "--public-menu-text": variables["--pos-theme-text"],
    "--public-menu-muted": variables["--pos-theme-text-muted"],
    "--public-menu-subtle": variables["--pos-theme-text-subtle"],
    "--public-menu-primary": primary,
    "--public-menu-primary-hover": primary,
    "--public-menu-primary-text": useBrandPalette ? textOnColor(primary) : variables["--pos-theme-topbar-text"],
    "--public-menu-primary-soft": useBrandPalette ? `color-mix(in srgb, ${primary} 12%, transparent)` : variables["--pos-theme-primary-soft"],
    "--public-menu-secondary": variables["--pos-theme-secondary"],
    "--public-menu-secondary-hover": variables["--pos-theme-secondary-hover"],
    "--public-menu-accent": accent,
    "--public-menu-accent-dark": useBrandPalette ? readableAccentInk(accent, "#173a2b") : colors.accentInk,
    "--public-menu-accent-soft": useBrandPalette ? `color-mix(in srgb, ${accent} 18%, transparent)` : variables["--pos-theme-highlight-soft"],
    "--public-menu-success": accent,
    "--public-menu-success-soft": useBrandPalette ? `color-mix(in srgb, ${accent} 16%, transparent)` : variables["--pos-theme-highlight-soft"],
    "--public-menu-success-ink": useBrandPalette ? readableAccentInk(accent, "#173a2b") : colors.accentInk,
    "--public-menu-danger": "#a9513d",
    "--public-menu-danger-soft": "#f8e9e2",
    "--public-menu-font": variables["--pos-theme-font"],
    "--public-menu-weight": variables["--pos-theme-weight"],
    "--public-menu-letter-spacing": variables["--pos-theme-letter-spacing"],
    "--public-menu-radius-card": variables["--pos-theme-radius-card"],
    "--public-menu-radius-button": variables["--pos-theme-radius-btn"],
    "--public-menu-shadow-card": variables["--pos-theme-shadow-card"],
    "--public-menu-shadow-pop": variables["--pos-theme-shadow-pop"],
    "--public-menu-pattern": variables["--pos-theme-app-pattern"],
    "--public-menu-panel-gradient": variables["--pos-theme-panel-gradient"],
    "--public-menu-card-gradient": variables["--pos-theme-card-gradient"],
    "--public-menu-control-gradient": variables["--pos-theme-control-gradient"],
  };
}
