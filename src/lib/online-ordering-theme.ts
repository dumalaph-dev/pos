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

const MINIMUM_TEXT_CONTRAST = 4.5;

function isHexColor(value: string): boolean {
  return /^#[\da-f]{6}$/i.test(value);
}

function relativeLuminance(hex: string) {
  if (!isHexColor(hex)) return 0;
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

function mixHex(foreground: string, background: string, foregroundWeight: number) {
  const foregroundRgb = hexToRgb(foreground);
  const backgroundRgb = hexToRgb(background);
  const weight = Math.min(1, Math.max(0, foregroundWeight));
  const channel = (foregroundChannel: number, backgroundChannel: number) => Math.round((foregroundChannel * weight) + (backgroundChannel * (1 - weight)));
  return `#${[channel(foregroundRgb.red, backgroundRgb.red), channel(foregroundRgb.green, backgroundRgb.green), channel(foregroundRgb.blue, backgroundRgb.blue)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function pickReadableColor(background: string, candidates: string[], fallback = "#000000") {
  const validCandidates = candidates.filter(isHexColor);
  if (!isHexColor(background) || validCandidates.length === 0) return fallback;
  return validCandidates.reduce((best, candidate) => contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best);
}

function keepReadableColor(foreground: string, background: string, fallbacks: string[]) {
  return isHexColor(foreground) && contrastRatio(foreground, background) >= MINIMUM_TEXT_CONTRAST
    ? foreground
    : pickReadableColor(background, fallbacks);
}

export function getPublicMenuThemeVariables(themeId: PosThemeId, branding?: OnlineOrderingBranding): PublicMenuThemeVariables {
  const theme = getPosTheme(themeId);
  const colors = getPosThemeDisplayColors(themeId);
  const variables = theme.variables;
  const useBrandPalette = branding?.colorMode === "brand";
  const primary = useBrandPalette ? branding.primaryColor : variables["--pos-theme-topbar"];
  const accent = useBrandPalette ? branding.accentColor : variables["--pos-theme-highlight"];
  const background = variables["--pos-theme-bg"];
  const panel = variables["--pos-theme-surface-panel"];
  const surface = variables["--pos-theme-surface"];
  const raised = variables["--pos-theme-surface-raised"];
  const sidebar = variables["--pos-theme-sidebar"];
  const baseText = pickReadableColor(surface, [variables["--pos-theme-text"], variables["--pos-theme-topbar"], variables["--pos-theme-topbar-text"], "#000000", "#ffffff"]);
  const panelText = pickReadableColor(panel, [variables["--pos-theme-text"], baseText, variables["--pos-theme-topbar"], variables["--pos-theme-topbar-text"], "#000000", "#ffffff"]);
  const raisedText = pickReadableColor(raised, [primary, variables["--pos-theme-text"], baseText, variables["--pos-theme-topbar-text"], "#000000", "#ffffff"]);
  const sidebarText = pickReadableColor(sidebar, [primary, variables["--pos-theme-text"], baseText, variables["--pos-theme-topbar-text"], "#000000", "#ffffff"]);
  const muted = keepReadableColor(variables["--pos-theme-text-muted"], surface, [baseText, panelText, "#000000", "#ffffff"]);
  const subtle = keepReadableColor(variables["--pos-theme-text-subtle"], surface, [muted, baseText, "#000000", "#ffffff"]);
  const primaryText = pickReadableColor(primary, [variables["--pos-theme-topbar-text"], baseText, "#ffffff", "#000000"]);
  const primarySoft = useBrandPalette ? mixHex(primary, surface, 0.12) : variables["--pos-theme-primary-soft"];
  const primarySoftText = pickReadableColor(primarySoft, [baseText, panelText, primary, "#000000", "#ffffff"]);
  const accentText = pickReadableColor(accent, [primary, baseText, variables["--pos-theme-topbar-text"], "#ffffff", "#000000"]);
  const accentInk = pickReadableColor(surface, [accent, baseText, primary, "#000000", "#ffffff"]);
  const accentSoft = useBrandPalette ? mixHex(accent, surface, 0.18) : variables["--pos-theme-highlight-soft"];
  const successSoft = useBrandPalette ? mixHex(accent, surface, 0.16) : variables["--pos-theme-highlight-soft"];
  const successInk = pickReadableColor(successSoft, [accent, baseText, primary, "#000000", "#ffffff"]);
  const danger = "#a9513d";
  const dangerSoft = "#f8e9e2";
  const dangerText = pickReadableColor(dangerSoft, [danger, baseText, "#000000", "#ffffff"]);

  return {
    "--public-menu-bg": background,
    "--public-menu-panel": panel,
    "--public-menu-surface": surface,
    "--public-menu-raised": raised,
    "--public-menu-sidebar": sidebar,
    "--public-menu-border": variables["--pos-theme-border"],
    "--public-menu-border-strong": variables["--pos-theme-border-strong"],
    "--public-menu-text": baseText,
    "--public-menu-panel-text": panelText,
    "--public-menu-surface-text": baseText,
    "--public-menu-raised-text": raisedText,
    "--public-menu-sidebar-text": sidebarText,
    "--public-menu-muted": muted,
    "--public-menu-subtle": subtle,
    "--public-menu-heading": pickReadableColor(raised, [primary, raisedText, baseText, "#000000", "#ffffff"]),
    "--public-menu-primary": primary,
    "--public-menu-primary-hover": primary,
    "--public-menu-primary-text": primaryText,
    "--public-menu-primary-soft": primarySoft,
    "--public-menu-primary-soft-text": primarySoftText,
    "--public-menu-secondary": variables["--pos-theme-secondary"],
    "--public-menu-secondary-hover": variables["--pos-theme-secondary-hover"],
    "--public-menu-accent": accent,
    "--public-menu-accent-hover": accent,
    "--public-menu-accent-text": accentText,
    "--public-menu-accent-ink": pickReadableColor(surface, [accent, colors.accentInk, accentInk, baseText, "#000000", "#ffffff"]),
    "--public-menu-accent-dark": accentInk,
    "--public-menu-accent-soft": accentSoft,
    "--public-menu-accent-soft-text": pickReadableColor(accentSoft, [accent, baseText, primary, "#000000", "#ffffff"]),
    "--public-menu-success": accent,
    "--public-menu-success-soft": successSoft,
    "--public-menu-success-ink": successInk,
    "--public-menu-danger": danger,
    "--public-menu-danger-soft": dangerSoft,
    "--public-menu-danger-text": dangerText,
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
