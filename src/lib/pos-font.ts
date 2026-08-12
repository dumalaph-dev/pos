export const POS_FONT_IDS = ["theme", "plex", "rounded", "serif", "clean", "mono"] as const;

export type PosFontId = (typeof POS_FONT_IDS)[number];

export type PosFontDefinition = {
  id: PosFontId;
  label: string;
  description: string;
  family: string;
};

const POS_FONT_DEFINITIONS: Record<Exclude<PosFontId, "theme">, PosFontDefinition> = {
  plex: {
    id: "plex",
    label: "IBM Plex Sans",
    description: "The Dumala system font: clear, compact, and easy to scan.",
    family: "var(--font-ui), ui-sans-serif, system-ui, sans-serif",
  },
  rounded: {
    id: "rounded",
    label: "Rounded Counter",
    description: "A friendlier rounded sans for welcoming service moments.",
    family: "ui-rounded, 'Trebuchet MS', system-ui, sans-serif",
  },
  serif: {
    id: "serif",
    label: "Editorial Serif",
    description: "A warm serif style with a more crafted, classic character.",
    family: "Georgia, 'Times New Roman', serif",
  },
  clean: {
    id: "clean",
    label: "Clean Sans",
    description: "A familiar, neutral sans-serif for straightforward operations.",
    family: "Arial, Helvetica, sans-serif",
  },
  mono: {
    id: "mono",
    label: "Ledger Mono",
    description: "A precise monospaced style inspired by printed counter ledgers.",
    family: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
};

export const POS_FONT_OPTIONS: PosFontDefinition[] = [
  {
    id: "theme",
    label: "Theme default",
    description: "Use the font paired with the selected interface theme.",
    family: "",
  },
  ...Object.values(POS_FONT_DEFINITIONS),
];

export function isPosFontId(value: unknown): value is PosFontId {
  return typeof value === "string" && POS_FONT_IDS.includes(value as PosFontId);
}

export function getPosFont(value: string | null | undefined, themeFamily: string): PosFontDefinition {
  if (value === "theme" || !value) {
    return { ...POS_FONT_OPTIONS[0], family: themeFamily };
  }
  if (isPosFontId(value) && value !== "theme") return POS_FONT_DEFINITIONS[value];
  return { ...POS_FONT_OPTIONS[0], family: themeFamily };
}

export function readPosFontColor(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export function readPosFontColorWithFallback(value: unknown, fallback: unknown): string | null {
  if (value === null) return null;
  return readPosFontColor(value) ?? readPosFontColor(fallback);
}
