import { getPosTheme, getPosThemeDisplayColors, type PosThemeId } from "@/lib/pos-theme";

export type PublicMenuThemeVariables = Record<string, string>;

/**
 * The public menu uses the same visual vocabulary as the POS, but keeps its
 * own semantic variable names so a customer-facing preview cannot alter the
 * authenticated POS shell.
 */
export function getPublicMenuThemeVariables(themeId: PosThemeId): PublicMenuThemeVariables {
  const theme = getPosTheme(themeId);
  const colors = getPosThemeDisplayColors(themeId);
  const variables = theme.variables;

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
    "--public-menu-primary": variables["--pos-theme-topbar"],
    "--public-menu-primary-hover": variables["--pos-theme-topbar"],
    "--public-menu-primary-text": variables["--pos-theme-topbar-text"],
    "--public-menu-primary-soft": variables["--pos-theme-primary-soft"],
    "--public-menu-secondary": variables["--pos-theme-secondary"],
    "--public-menu-secondary-hover": variables["--pos-theme-secondary-hover"],
    "--public-menu-accent": variables["--pos-theme-highlight"],
    "--public-menu-accent-dark": colors.accentInk,
    "--public-menu-accent-soft": variables["--pos-theme-highlight-soft"],
    "--public-menu-success": variables["--pos-theme-highlight"],
    "--public-menu-success-soft": variables["--pos-theme-highlight-soft"],
    "--public-menu-success-ink": colors.accentInk,
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
