export const INVENTORY_MODES = ["none", "direct", "recipe"] as const;
export type InventoryMode = (typeof INVENTORY_MODES)[number];

export const INVENTORY_ITEM_TYPES = ["ingredient", "packaging", "finished_good"] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

export type InventoryItemOption = {
  id: string;
  store_id: string;
  linked_product_id?: string | null;
  name: string;
  item_type: InventoryItemType;
  unit: string;
  cost_per_unit: number | null;
  min_stock: number;
  supplier_id?: string | null;
  is_active: boolean;
};

export type RecipeLineDraft = {
  inventory_item_id: string;
  quantity_per_unit: number;
  waste_percent: number;
  note: string;
  sort_order: number;
};

export type RecipeLineRecord = RecipeLineDraft & {
  id?: string;
  recipe_id?: string;
};

export function isInventoryMode(value: string): value is InventoryMode {
  return (INVENTORY_MODES as readonly string[]).includes(value);
}

export function isInventoryItemType(value: string): value is InventoryItemType {
  return (INVENTORY_ITEM_TYPES as readonly string[]).includes(value);
}

export function inventoryModeLabel(mode: InventoryMode) {
  if (mode === "recipe") return "Track ingredients";
  if (mode === "direct") return "Track finished stock";
  return "Do not track";
}

export function inventoryModeDescription(mode: InventoryMode) {
  if (mode === "recipe") return "Selling this product uses the ingredients in its recipe.";
  if (mode === "direct") return "Selling this product reduces a finished stock balance.";
  return "Selling this product does not change inventory.";
}

export function inventoryItemTypeLabel(type: InventoryItemType) {
  if (type === "finished_good") return "Finished good";
  if (type === "packaging") return "Packaging";
  return "Ingredient";
}

export function recipeStatus(mode: InventoryMode, lineCount: number) {
  if (mode === "recipe") return lineCount > 0 ? "ready" : "needs_recipe";
  return mode;
}

export function recipeStatusLabel(mode: InventoryMode, lineCount: number) {
  if (mode === "recipe") return lineCount > 0 ? `Recipe ready · ${lineCount} item${lineCount === 1 ? "" : "s"}` : "Needs recipe";
  return inventoryModeLabel(mode);
}

export function formatInventoryQuantity(value: number | string | null | undefined) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "—";
  if (Number.isInteger(numberValue)) return String(numberValue);
  return numberValue.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function parseRecipeLines(value: string): RecipeLineDraft[] {
  if (!value.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length > 100) return [];

  const lines: RecipeLineDraft[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const inventoryItemId = typeof record.inventory_item_id === "string"
      ? record.inventory_item_id.trim()
      : typeof record.inventoryItemId === "string"
        ? record.inventoryItemId.trim()
        : "";
    const quantity = Number(record.quantity_per_unit ?? record.quantityPerUnit);
    const waste = Number(record.waste_percent ?? record.wastePercent ?? 0);
    const note = typeof record.note === "string" ? record.note.trim().slice(0, 180) : "";
    if (
      !inventoryItemId ||
      seen.has(inventoryItemId) ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(waste) ||
      waste < 0 ||
      waste > 100
    ) {
      continue;
    }
    seen.add(inventoryItemId);
    lines.push({
      inventory_item_id: inventoryItemId,
      quantity_per_unit: quantity,
      waste_percent: waste,
      note,
      sort_order: lines.length,
    });
  }
  return lines;
}
