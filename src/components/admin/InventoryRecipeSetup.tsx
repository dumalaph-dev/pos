"use client";

import { useState, useTransition } from "react";
import { createInventoryItemInline } from "@/app/admin/inventory/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  inventoryItemTypeLabel,
  inventoryModeDescription,
  inventoryModeLabel,
  type InventoryItemOption,
  type InventoryMode,
  type InventoryItemType,
  type RecipeLineRecord,
} from "@/lib/inventory-recipes";

type SupplierRecord = { id: string; name: string; is_active: boolean };

const modeOptions: Array<{ value: InventoryMode; eyebrow: string }> = [
  { value: "recipe", eyebrow: "Recommended for meals and drinks" },
  { value: "direct", eyebrow: "For ready-to-sell stock" },
  { value: "none", eyebrow: "For services or non-stock items" },
];

const itemTypes: Array<{ value: InventoryItemType; label: string }> = [
  { value: "ingredient", label: "Ingredient" },
  { value: "packaging", label: "Packaging" },
  { value: "finished_good", label: "Finished good" },
];

function normalizeLines(lines: RecipeLineRecord[]) {
  return lines.map((line, index) => ({
    inventory_item_id: line.inventory_item_id,
    quantity_per_unit: Number(line.quantity_per_unit) || 1,
    waste_percent: Number(line.waste_percent) || 0,
    note: line.note ?? "",
    sort_order: index,
  }));
}

export function InventoryRecipeSetup({
  inventoryItems: initialItems,
  suppliers,
  defaultStoreId,
  initialMode = "recipe",
  initialLines = [],
  canWrite,
  prefix,
}: {
  inventoryItems: InventoryItemOption[];
  suppliers: SupplierRecord[];
  defaultStoreId: string;
  initialMode?: InventoryMode;
  initialLines?: RecipeLineRecord[];
  canWrite: boolean;
  prefix: string;
}) {
  const [mode, setMode] = useState<InventoryMode>(initialMode);
  const [items, setItems] = useState(initialItems);
  const [lines, setLines] = useState(() => normalizeLines(initialLines));
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState("1");
  const [newItemName, setNewItemName] = useState("");
  const [newItemType, setNewItemType] = useState<InventoryItemType>("ingredient");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemMinimum, setNewItemMinimum] = useState("0");
  const [newItemSupplier, setNewItemSupplier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isCreating, startCreating] = useTransition();

  const availableItems = items.filter((item) => item.is_active && !lines.some((line) => line.inventory_item_id === item.id));

  function addLine() {
    const item = items.find((candidate) => candidate.id === selectedItemId);
    const quantity = Number(selectedQuantity);
    if (!item || !Number.isFinite(quantity) || quantity <= 0) {
      setMessage("Choose an inventory item and enter a quantity greater than zero.");
      return;
    }
    setLines((current) => [...current, {
      inventory_item_id: item.id,
      quantity_per_unit: quantity,
      waste_percent: 0,
      note: "",
      sort_order: current.length,
    }]);
    setSelectedItemId("");
    setSelectedQuantity("1");
    setMessage(null);
  }

  function updateLine(index: number, field: "quantity_per_unit" | "waste_percent" | "note", value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index
      ? { ...line, [field]: field === "note" ? value : Number(value) }
      : line));
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index).map((line, lineIndex) => ({ ...line, sort_order: lineIndex })));
  }

  function createItem() {
    const name = newItemName.trim();
    if (!defaultStoreId || name.length < 2) {
      setMessage("Enter an ingredient name with at least two characters.");
      return;
    }
    const formData = new FormData();
    formData.set("store_id", defaultStoreId);
    formData.set("name", name);
    formData.set("item_type", newItemType);
    formData.set("unit", newItemUnit.trim());
    formData.set("cost_per_unit", newItemCost);
    formData.set("min_stock", newItemMinimum);
    formData.set("supplier_id", newItemSupplier);
    setMessage(null);
    startCreating(async () => {
      const result = await createInventoryItemInline(formData);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setItems((current) => [...current, result.item]);
      setLines((current) => [...current, {
        inventory_item_id: result.item.id,
        quantity_per_unit: 1,
        waste_percent: 0,
        note: "",
        sort_order: current.length,
      }]);
      setNewItemName("");
      setNewItemCost("");
      setMessage(`${result.item.name} was created and added to this recipe.`);
    });
  }

  return <section className="products-form-section" aria-labelledby={`${prefix}-inventory-heading`}>
    <div className="products-form-section__header">
      <div><p>Inventory behavior</p><h3 id={`${prefix}-inventory-heading`}>Connect this product to stock</h3></div>
      <small>Choose what the POS should deduct when this product is sold. Shared ingredients can be used by many products.</small>
    </div>
    <input type="hidden" name="inventory_mode" value={mode} />
    <input type="hidden" name="track_stock" value={mode === "direct" ? "true" : "false"} />
    <input type="hidden" name="recipe_lines" value={JSON.stringify(lines)} readOnly />

    <div className="products-inventory-mode-grid" role="radiogroup" aria-label="Inventory behavior">
      {modeOptions.map((option) => <label key={option.value} className={`products-inventory-mode-card ${mode === option.value ? "is-selected" : ""}`}>
        <input type="radio" name={`${prefix}-inventory-mode-choice`} value={option.value} checked={mode === option.value} onChange={() => { setMode(option.value); setMessage(null); }} disabled={!canWrite} />
        <span className="products-inventory-mode-card__dot" aria-hidden="true" />
        <span><strong>{inventoryModeLabel(option.value)}</strong><small>{option.eyebrow}. {inventoryModeDescription(option.value)}</small></span>
      </label>)}
    </div>

    {mode === "recipe" && <div className="products-recipe-builder">
      <div className="products-recipe-builder__header">
        <div><p className="products-form-section__eyebrow">Recipe ingredients</p><h4>What gets used for one sale?</h4></div>
        <span className="products-recipe-builder__count">{lines.length} item{lines.length === 1 ? "" : "s"}</span>
      </div>

      {lines.length > 0 ? <div className="products-recipe-lines">
        {lines.map((line, index) => {
          const item = items.find((candidate) => candidate.id === line.inventory_item_id);
          return <div key={line.inventory_item_id} className="products-recipe-line">
            <div className="products-recipe-line__name"><span className="products-recipe-line__number">{index + 1}</span><span><strong>{item?.name ?? "Unavailable item"}</strong><small>{item ? `${inventoryItemTypeLabel(item.item_type)} · ${item.unit}` : "Choose another inventory item"}</small></span></div>
            <label><span>Qty / sale</span><input type="number" min="0.000001" step="0.001" value={line.quantity_per_unit} onChange={(event) => updateLine(index, "quantity_per_unit", event.target.value)} disabled={!canWrite} className="inventory-input inventory-input--compact tnums" /></label>
            <label><span>Waste %</span><input type="number" min="0" max="100" step="0.1" value={line.waste_percent} onChange={(event) => updateLine(index, "waste_percent", event.target.value)} disabled={!canWrite} className="inventory-input inventory-input--compact tnums" /></label>
            <label className="products-recipe-line__note"><span>Note</span><input value={line.note} onChange={(event) => updateLine(index, "note", event.target.value)} placeholder="Optional" maxLength={180} disabled={!canWrite} className="inventory-input inventory-input--compact" /></label>
            <button type="button" onClick={() => removeLine(index)} disabled={!canWrite} className="products-icon-button" aria-label={`Remove ${item?.name ?? "ingredient"}`}><AdminIcon name="close" size={14} /></button>
          </div>;
        })}
      </div> : <div className="products-recipe-empty"><AdminIcon name="box" size={18} /><span><strong>No ingredients added yet</strong><small>Add the items used to make one serving, cup, box, or pizza.</small></span></div>}

      <div className="products-recipe-add-row">
        <label className="products-recipe-add-row__item"><span>Inventory item</span><select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} disabled={!canWrite || availableItems.length === 0} className="inventory-input inventory-input--compact"><option value="">{availableItems.length ? "Choose an ingredient" : "All active items are already added"}</option>{availableItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
        <label><span>Quantity per sale</span><input type="number" min="0.000001" step="0.001" value={selectedQuantity} onChange={(event) => setSelectedQuantity(event.target.value)} disabled={!canWrite} className="inventory-input inventory-input--compact tnums" /></label>
        <button type="button" onClick={addLine} disabled={!canWrite || availableItems.length === 0} className="products-secondary-button"><AdminIcon name="plus" size={14} /> Add ingredient</button>
      </div>

      <details className="products-recipe-create-item">
        <summary><AdminIcon name="plus" size={14} /> Create a new inventory item</summary>
        <div className="products-recipe-create-item__grid">
          <label><span>Name</span><input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="e.g. Chicken breast" disabled={!canWrite || isCreating} className="inventory-input inventory-input--compact" /></label>
          <label><span>Type</span><select value={newItemType} onChange={(event) => setNewItemType(event.target.value as InventoryItemType)} disabled={!canWrite || isCreating} className="inventory-input inventory-input--compact">{itemTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Unit</span><input value={newItemUnit} onChange={(event) => setNewItemUnit(event.target.value)} placeholder="kg, L, pcs" disabled={!canWrite || isCreating} className="inventory-input inventory-input--compact" /></label>
          <label><span>Cost / unit - PHP</span><input type="number" min="0" step="0.01" value={newItemCost} onChange={(event) => setNewItemCost(event.target.value)} placeholder="Optional" disabled={!canWrite || isCreating} className="inventory-input inventory-input--compact tnums" /></label>
          <label><span>Minimum stock</span><input type="number" min="0" step="0.001" value={newItemMinimum} onChange={(event) => setNewItemMinimum(event.target.value)} disabled={!canWrite || isCreating} className="inventory-input inventory-input--compact tnums" /></label>
          <label><span>Supplier</span><select value={newItemSupplier} onChange={(event) => setNewItemSupplier(event.target.value)} disabled={!canWrite || isCreating} className="inventory-input inventory-input--compact"><option value="">Unassigned</option>{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <button type="button" onClick={createItem} disabled={!canWrite || isCreating} className="products-small-primary">{isCreating ? "Creating..." : "Create and add"}</button>
        </div>
      </details>
      {message && <p className="products-category-picker__message" aria-live="polite">{message}</p>}
    </div>}

    {mode === "direct" && <div className="products-inventory-explanation"><AdminIcon name="box" size={18} /><span><strong>Finished-stock tracking</strong><small>Use Inventory to receive the ready-made item and record waste or adjustments. POS sales will reduce this balance.</small></span></div>}
    {mode === "none" && <div className="products-inventory-explanation"><AdminIcon name="check" size={18} /><span><strong>No stock ledger</strong><small>This product remains available in POS without changing ingredient or finished-stock balances.</small></span></div>}
  </section>;
}
