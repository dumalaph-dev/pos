export type PosThemeId = "modern" | "classic" | "soft" | "dark" | "bold";

export type PosThemeVariableName =
  | "--pos-theme-bg"
  | "--pos-theme-surface"
  | "--pos-theme-surface-panel"
  | "--pos-theme-surface-raised"
  | "--pos-theme-sidebar"
  | "--pos-theme-border"
  | "--pos-theme-border-strong"
  | "--pos-theme-text"
  | "--pos-theme-text-muted"
  | "--pos-theme-text-subtle"
  | "--pos-theme-primary-soft"
  | "--pos-theme-secondary"
  | "--pos-theme-secondary-hover"
  | "--pos-theme-highlight"
  | "--pos-theme-highlight-soft"
  | "--pos-theme-topbar"
  | "--pos-theme-topbar-text"
  | "--pos-theme-radius-card"
  | "--pos-theme-radius-btn"
  | "--pos-theme-shadow-card"
  | "--pos-theme-shadow-pop"
  | "--pos-theme-font"
  | "--pos-theme-weight"
  | "--pos-theme-letter-spacing"
  | "--pos-theme-app-pattern"
  | "--pos-theme-panel-gradient"
  | "--pos-theme-card-gradient"
  | "--pos-theme-control-gradient";

export type PosThemeVariables = Record<PosThemeVariableName, string>;

export type PosThemeDefinition = {
  id: PosThemeId;
  label: string;
  shortLabel: string;
  description: string;
  mood: string;
  variables: PosThemeVariables;
};

const shared = {
  "--pos-theme-weight": "650",
  "--pos-theme-letter-spacing": "0",
} as const;

export const POS_THEME_DEFINITIONS: Record<PosThemeId, PosThemeDefinition> = {
  modern: {
    id: "modern",
    label: "Modern Workspace",
    shortLabel: "Modern",
    description: "Layered neutrals, crisp controls, and a calm command-center feel.",
    mood: "Crisp · focused · adaptable",
    variables: {
      ...shared,
      "--pos-theme-bg": "#eef3f4",
      "--pos-theme-surface": "#ffffff",
      "--pos-theme-surface-panel": "#f5f9f9",
      "--pos-theme-surface-raised": "#ffffff",
      "--pos-theme-sidebar": "#e6eef0",
      "--pos-theme-border": "#d8e3e6",
      "--pos-theme-border-strong": "#b6cbd0",
      "--pos-theme-text": "#19272c",
      "--pos-theme-text-muted": "#61727a",
      "--pos-theme-text-subtle": "#91a1a7",
      "--pos-theme-primary-soft": "#e1edef",
      "--pos-theme-secondary": "#edf4f5",
      "--pos-theme-secondary-hover": "#dce9eb",
      "--pos-theme-highlight": "#1e918d",
      "--pos-theme-highlight-soft": "#d3efeb",
      "--pos-theme-topbar": "#20383c",
      "--pos-theme-topbar-text": "#f4fbfb",
      "--pos-theme-radius-card": "14px",
      "--pos-theme-radius-btn": "10px",
      "--pos-theme-shadow-card": "0 5px 18px rgba(35, 68, 76, 0.07)",
      "--pos-theme-shadow-pop": "0 18px 42px rgba(27, 52, 58, 0.16)",
      "--pos-theme-font": "Inter, ui-sans-serif, system-ui, sans-serif",
      "--pos-theme-app-pattern": "radial-gradient(circle at 8% 4%, rgba(30, 145, 141, 0.12), transparent 24%), radial-gradient(circle at 92% 82%, rgba(88, 150, 171, 0.10), transparent 26%)",
      "--pos-theme-panel-gradient": "linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(238, 246, 247, 0.96))",
      "--pos-theme-card-gradient": "linear-gradient(180deg, #ffffff 0%, #f7fbfb 100%)",
      "--pos-theme-control-gradient": "linear-gradient(180deg, #ffffff 0%, #edf5f6 100%)",
    },
  },
  classic: {
    id: "classic",
    label: "Classic Counter",
    shortLabel: "Classic",
    description: "Warm paper tones, ink-like rules, and a considered heritage register style.",
    mood: "Warm · crafted · familiar",
    variables: {
      ...shared,
      "--pos-theme-bg": "#eee1cf",
      "--pos-theme-surface": "#fbf5e9",
      "--pos-theme-surface-panel": "#f4e8d8",
      "--pos-theme-surface-raised": "#fffaf1",
      "--pos-theme-sidebar": "#e5d2b8",
      "--pos-theme-border": "#d5b995",
      "--pos-theme-border-strong": "#ae865d",
      "--pos-theme-text": "#402718",
      "--pos-theme-text-muted": "#826b54",
      "--pos-theme-text-subtle": "#a9947d",
      "--pos-theme-primary-soft": "#ead6bb",
      "--pos-theme-secondary": "#ecd9be",
      "--pos-theme-secondary-hover": "#ddc29f",
      "--pos-theme-highlight": "#a35e2b",
      "--pos-theme-highlight-soft": "#f0d6b6",
      "--pos-theme-topbar": "#4a2918",
      "--pos-theme-topbar-text": "#fff8eb",
      "--pos-theme-radius-card": "6px",
      "--pos-theme-radius-btn": "6px",
      "--pos-theme-shadow-card": "0 3px 0 rgba(109, 70, 35, 0.10), 0 8px 18px rgba(91, 52, 22, 0.08)",
      "--pos-theme-shadow-pop": "0 16px 34px rgba(77, 46, 22, 0.20)",
      "--pos-theme-font": "Georgia, 'Times New Roman', serif",
      "--pos-theme-weight": "600",
      "--pos-theme-letter-spacing": "0.012em",
      "--pos-theme-app-pattern": "linear-gradient(rgba(130, 81, 37, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(130, 81, 37, 0.035) 1px, transparent 1px)",
      "--pos-theme-panel-gradient": "linear-gradient(180deg, rgba(255, 250, 241, 0.98), rgba(242, 227, 207, 0.96))",
      "--pos-theme-card-gradient": "linear-gradient(180deg, #fffaf1 0%, #f4e8d8 100%)",
      "--pos-theme-control-gradient": "linear-gradient(180deg, #fffaf2 0%, #ead7be 100%)",
    },
  },
  soft: {
    id: "soft",
    label: "Soft Studio",
    shortLabel: "Soft",
    description: "Lavender mist, friendly curves, and diffused surfaces for a lighter rhythm.",
    mood: "Gentle · welcoming · relaxed",
    variables: {
      ...shared,
      "--pos-theme-bg": "#efedf5",
      "--pos-theme-surface": "#fffafd",
      "--pos-theme-surface-panel": "#f8f3fa",
      "--pos-theme-surface-raised": "#ffffff",
      "--pos-theme-sidebar": "#ebe6f3",
      "--pos-theme-border": "#e1d9eb",
      "--pos-theme-border-strong": "#c6b6d9",
      "--pos-theme-text": "#332b42",
      "--pos-theme-text-muted": "#7d718a",
      "--pos-theme-text-subtle": "#aa9fb5",
      "--pos-theme-primary-soft": "#eee5f6",
      "--pos-theme-secondary": "#f4edf8",
      "--pos-theme-secondary-hover": "#e8dcf2",
      "--pos-theme-highlight": "#b55e87",
      "--pos-theme-highlight-soft": "#f5dce8",
      "--pos-theme-topbar": "#4c3549",
      "--pos-theme-topbar-text": "#fff8fd",
      "--pos-theme-radius-card": "20px",
      "--pos-theme-radius-btn": "999px",
      "--pos-theme-shadow-card": "0 10px 26px rgba(95, 67, 116, 0.10)",
      "--pos-theme-shadow-pop": "0 20px 46px rgba(74, 49, 93, 0.17)",
      "--pos-theme-font": "'Trebuchet MS', ui-rounded, system-ui, sans-serif",
      "--pos-theme-app-pattern": "radial-gradient(circle at 15% 12%, rgba(181, 94, 135, 0.12), transparent 24%), radial-gradient(circle at 86% 14%, rgba(119, 146, 190, 0.14), transparent 23%), radial-gradient(circle at 70% 92%, rgba(220, 178, 137, 0.10), transparent 28%)",
      "--pos-theme-panel-gradient": "linear-gradient(145deg, rgba(255, 252, 255, 0.98), rgba(246, 239, 249, 0.96))",
      "--pos-theme-card-gradient": "linear-gradient(180deg, #ffffff 0%, #faf2fb 100%)",
      "--pos-theme-control-gradient": "linear-gradient(180deg, #ffffff 0%, #f1e7f7 100%)",
    },
  },
  dark: {
    id: "dark",
    label: "Dark Night Shift",
    shortLabel: "Dark",
    description: "Deep charcoal layers, luminous status accents, and a high-contrast night mode.",
    mood: "Focused · cinematic · high contrast",
    variables: {
      ...shared,
      "--pos-theme-bg": "#10161c",
      "--pos-theme-surface": "#171f27",
      "--pos-theme-surface-panel": "#1d2730",
      "--pos-theme-surface-raised": "#24303a",
      "--pos-theme-sidebar": "#141c23",
      "--pos-theme-border": "#34434e",
      "--pos-theme-border-strong": "#546875",
      "--pos-theme-text": "#eff6f7",
      "--pos-theme-text-muted": "#a8b9c0",
      "--pos-theme-text-subtle": "#78909a",
      "--pos-theme-primary-soft": "#2c3c46",
      "--pos-theme-secondary": "#263540",
      "--pos-theme-secondary-hover": "#344653",
      "--pos-theme-highlight": "#71d0bd",
      "--pos-theme-highlight-soft": "#1d4c4a",
      "--pos-theme-topbar": "#0a1117",
      "--pos-theme-topbar-text": "#f4fbfb",
      "--pos-theme-radius-card": "12px",
      "--pos-theme-radius-btn": "9px",
      "--pos-theme-shadow-card": "0 9px 26px rgba(0, 0, 0, 0.24)",
      "--pos-theme-shadow-pop": "0 24px 50px rgba(0, 0, 0, 0.42)",
      "--pos-theme-font": "Inter, ui-sans-serif, system-ui, sans-serif",
      "--pos-theme-app-pattern": "radial-gradient(circle at 76% 8%, rgba(113, 208, 189, 0.10), transparent 25%), linear-gradient(135deg, rgba(255, 255, 255, 0.018) 25%, transparent 25%) 0 0 / 12px 12px",
      "--pos-theme-panel-gradient": "linear-gradient(145deg, rgba(35, 47, 57, 0.98), rgba(18, 26, 33, 0.98))",
      "--pos-theme-card-gradient": "linear-gradient(180deg, #24303a 0%, #1c2730 100%)",
      "--pos-theme-control-gradient": "linear-gradient(180deg, #2d3d48 0%, #202d36 100%)",
    },
  },
  bold: {
    id: "bold",
    label: "Bold Market",
    shortLabel: "Bold",
    description: "Electric contrast, expressive labels, and bright blocks built for fast service.",
    mood: "Energetic · expressive · fast",
    variables: {
      ...shared,
      "--pos-theme-bg": "#fff0eb",
      "--pos-theme-surface": "#fffdfb",
      "--pos-theme-surface-panel": "#ffe8df",
      "--pos-theme-surface-raised": "#ffffff",
      "--pos-theme-sidebar": "#eaf4ff",
      "--pos-theme-border": "#f0c9bc",
      "--pos-theme-border-strong": "#dc8c79",
      "--pos-theme-text": "#241929",
      "--pos-theme-text-muted": "#765e6d",
      "--pos-theme-text-subtle": "#a98d9a",
      "--pos-theme-primary-soft": "#ffe0d5",
      "--pos-theme-secondary": "#e9f4ff",
      "--pos-theme-secondary-hover": "#d2e9fb",
      "--pos-theme-highlight": "#f05a43",
      "--pos-theme-highlight-soft": "#ffd2c6",
      "--pos-theme-topbar": "#241b39",
      "--pos-theme-topbar-text": "#fffaff",
      "--pos-theme-radius-card": "10px",
      "--pos-theme-radius-btn": "10px",
      "--pos-theme-shadow-card": "0 8px 0 rgba(74, 35, 73, 0.08), 0 14px 24px rgba(224, 99, 73, 0.10)",
      "--pos-theme-shadow-pop": "0 22px 44px rgba(74, 35, 73, 0.22)",
      "--pos-theme-font": "Arial, Helvetica, sans-serif",
      "--pos-theme-weight": "750",
      "--pos-theme-letter-spacing": "0.018em",
      "--pos-theme-app-pattern": "linear-gradient(135deg, rgba(240, 90, 67, 0.12) 0 12%, transparent 12% 24%, rgba(55, 124, 190, 0.08) 24% 36%, transparent 36% 100%) 0 0 / 94px 94px",
      "--pos-theme-panel-gradient": "linear-gradient(145deg, #fffdfb 0%, #ffe5dc 100%)",
      "--pos-theme-card-gradient": "linear-gradient(180deg, #ffffff 0%, #fff2ed 100%)",
      "--pos-theme-control-gradient": "linear-gradient(180deg, #ffffff 0%, #e9f4ff 100%)",
    },
  },
};

export const POS_THEME_OPTIONS = Object.values(POS_THEME_DEFINITIONS);

export function getPosTheme(value: string | null | undefined): PosThemeDefinition {
  if (value && Object.prototype.hasOwnProperty.call(POS_THEME_DEFINITIONS, value)) {
    return POS_THEME_DEFINITIONS[value as PosThemeId];
  }
  return POS_THEME_DEFINITIONS.modern;
}
