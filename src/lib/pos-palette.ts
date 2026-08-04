export type PosPaletteId = "brown" | "blue" | "green" | "purple" | "custom";

export type PosPaletteDefinition = {
  id: PosPaletteId;
  label: string;
  description: string;
  color: string;
  primary: string;
  hover: string;
  deep: string;
  soft: string;
  tint: string;
  glow: string;
  contrast: string;
  gradient: string;
};

export const POS_PALETTE_IDS = ["brown", "blue", "green", "purple", "custom"] as const;

const PALETTE_DEFINITIONS: Record<Exclude<PosPaletteId, "custom">, PosPaletteDefinition> = {
  brown: {
    id: "brown",
    label: "Brown",
    description: "Warm roasted-caramel accents that keep the Rico's brand character.",
    color: "#5b2a0a",
    primary: "#5b2a0a",
    hover: "#4a2208",
    deep: "#351804",
    soft: "#f3e7dc",
    tint: "#ead7c7",
    glow: "#d8bca9",
    contrast: "#ffffff",
    gradient: "linear-gradient(135deg, #6f3510 0%, #4a2208 100%)",
  },
  blue: {
    id: "blue",
    label: "Blue",
    description: "Cool, dependable accents with clear contrast for high-volume service.",
    color: "#2f6fb3",
    primary: "#2f6fb3",
    hover: "#245b96",
    deep: "#194575",
    soft: "#e4effb",
    tint: "#cfe1f3",
    glow: "#a8c9e7",
    contrast: "#ffffff",
    gradient: "linear-gradient(135deg, #3c82c8 0%, #245b96 100%)",
  },
  green: {
    id: "green",
    label: "Green",
    description: "Fresh, grounded accents that pair naturally with food and inventory states.",
    color: "#2f7344",
    primary: "#2f7344",
    hover: "#255c36",
    deep: "#19452a",
    soft: "#e7f2e9",
    tint: "#d1e5d5",
    glow: "#a9c9b0",
    contrast: "#ffffff",
    gradient: "linear-gradient(135deg, #3c8954 0%, #255c36 100%)",
  },
  purple: {
    id: "purple",
    label: "Purple",
    description: "Expressive violet accents for a more distinctive, creative counter feel.",
    color: "#7450b5",
    primary: "#7450b5",
    hover: "#5e3e96",
    deep: "#452c75",
    soft: "#eee8fa",
    tint: "#ded2f0",
    glow: "#b7a4dc",
    contrast: "#ffffff",
    gradient: "linear-gradient(135deg, #8863c8 0%, #5e3e96 100%)",
  },
};

function normalizeHex(value: string | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

function hexChannels(value: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function toHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function mixHex(from: string, to: string, amount: number) {
  const fromChannels = hexChannels(from);
  const toChannels = hexChannels(to);
  return `#${fromChannels.map((channel, index) => toHex(channel + (toChannels[index] - channel) * amount)).join("")}`;
}

function contrastFor(value: string) {
  const [red, green, blue] = hexChannels(value).map((channel) => channel / 255);
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.58 ? "#20262b" : "#ffffff";
}

function customPalette(value: string | undefined): PosPaletteDefinition {
  const primary = normalizeHex(value) ?? PALETTE_DEFINITIONS.brown.primary;
  const hover = mixHex(primary, "#000000", 0.14);
  return {
    id: "custom",
    label: "Custom color",
    description: "Your own accent applied across the full POS interaction system.",
    color: primary,
    primary,
    hover,
    deep: mixHex(primary, "#000000", 0.28),
    soft: mixHex(primary, "#ffffff", 0.91),
    tint: mixHex(primary, "#ffffff", 0.79),
    glow: mixHex(primary, "#ffffff", 0.62),
    contrast: contrastFor(primary),
    gradient: `linear-gradient(135deg, ${mixHex(primary, "#ffffff", 0.1)} 0%, ${hover} 100%)`,
  };
}

export const POS_PALETTE_OPTIONS = Object.values(PALETTE_DEFINITIONS).concat({
  id: "custom",
  label: "Custom color",
  description: "Use your own accent across the full POS interaction system.",
  color: "",
  primary: "",
  hover: "",
  deep: "",
  soft: "",
  tint: "",
  glow: "",
  contrast: "",
  gradient: "",
});

export function isPosPaletteId(value: unknown): value is PosPaletteId {
  return typeof value === "string" && POS_PALETTE_IDS.includes(value as PosPaletteId);
}

export function getPosPalette(value: string | null | undefined, customColor?: string): PosPaletteDefinition {
  if (value === "custom") return customPalette(customColor);
  if (value && isPosPaletteId(value) && value !== "custom") return PALETTE_DEFINITIONS[value];
  return PALETTE_DEFINITIONS.brown;
}
