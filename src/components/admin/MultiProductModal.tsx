"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { createProductBundle } from "@/app/admin/catalog/actions";
import { CATALOG_PRESETS, getCatalogPreset, type CatalogPreset, type CatalogPresetProduct } from "@/lib/catalog-presets";

type BundleDraft = {
  price: string;
  openingStock: string;
  minStock: string;
};

type DraftField = keyof BundleDraft;

type Feedback = {
  kind: "success" | "error";
  text: string;
};

export type MultiProductModalProps = {
  storeId: string;
  branchName?: string;
  branches: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; store_id?: string }>;
  canWrite: boolean;
  orgName?: string;
  initialPresetId?: string;
  onPreviewSelectionChange?: (selection: { presetId: string; productIds: string[] }) => void;
  triggerLabel?: string;
  triggerClassName?: string;
};

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

function iconName(value: string): AdminIconName {
  if (value === "pig") return "pig";
  if (value === "plus") return "plus";
  if (value === "box" || value === "package") return "box";
  return "box";
}

function buildDrafts(preset: CatalogPreset) {
  return Object.fromEntries(
    preset.products.map((product) => [
      product.id,
      {
        price: product.price.toFixed(2),
        openingStock: String(product.openingStock),
        minStock: String(product.minStock),
      },
    ]),
  ) as Record<string, BundleDraft>;
}

function buildSelection(preset: CatalogPreset) {
  return Object.fromEntries(preset.products.map((product) => [product.id, true])) as Record<string, boolean>;
}

export function MultiProductModal({
  storeId,
  branchName,
  branches,
  categories,
  canWrite,
  orgName,
  initialPresetId,
  onPreviewSelectionChange,
  triggerLabel = "Starter catalog",
  triggerClassName = "products-secondary-button",
}: MultiProductModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState(storeId || branches[0]?.id || "");
  const [presetId, setPresetId] = useState(() => getCatalogPreset(initialPresetId)?.id ?? CATALOG_PRESETS[0].id);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => buildSelection(getCatalogPreset(initialPresetId) ?? CATALOG_PRESETS[0]));
  const [drafts, setDrafts] = useState<Record<string, BundleDraft>>(() => buildDrafts(getCatalogPreset(initialPresetId) ?? CATALOG_PRESETS[0]));
  const [useStockPhotos, setUseStockPhotos] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLElement | null>(null);
  const selectedPreset = getCatalogPreset(presetId) ?? CATALOG_PRESETS[0];

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement;
    document.body.classList.add("products-modal-open");
    const focusFirstControl = window.setTimeout(() => {
      modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusFirstControl);
      document.body.classList.remove("products-modal-open");
      document.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus();
    };
  }, [open]);

  const branchCategoryNames = useMemo(() => {
    return new Set(
      categories
        .filter((category) => !category.store_id || category.store_id === selectedStoreId)
        .map((category) => category.name.trim().toLowerCase()),
    );
  }, [categories, selectedStoreId]);

  const existingCategoryCount = selectedPreset.categories.filter((category) => branchCategoryNames.has(category.name.toLowerCase())).length;
  const selectedProducts = selectedPreset.products.filter((product) => selected[product.id]);
  const selectedCount = selectedProducts.length;

  function openModal() {
    if (!canWrite || !selectedStoreId) return;
    const nextPreset = getCatalogPreset(initialPresetId);
    const previewPreset = nextPreset ?? selectedPreset;
    if (nextPreset && nextPreset.id !== presetId) {
      setPresetId(nextPreset.id);
      setSelected(buildSelection(nextPreset));
      setDrafts(buildDrafts(nextPreset));
    }
    onPreviewSelectionChange?.({ presetId: previewPreset.id, productIds: previewPreset.products.map((product) => product.id) });
    setFeedback(null);
    setOpen(true);
  }

  function closeModal() {
    if (isPending) return;
    setOpen(false);
  }

  function choosePreset(nextPreset: CatalogPreset) {
    const nextSelection = buildSelection(nextPreset);
    setPresetId(nextPreset.id);
    setSelected(nextSelection);
    setDrafts(buildDrafts(nextPreset));
    setFeedback(null);
    onPreviewSelectionChange?.({ presetId: nextPreset.id, productIds: nextPreset.products.map((product) => product.id) });
  }

  function toggleProduct(productId: string) {
    const nextSelection = { ...selected, [productId]: !selected[productId] };
    setSelected(nextSelection);
    setFeedback(null);
    onPreviewSelectionChange?.({
      presetId: selectedPreset.id,
      productIds: selectedPreset.products.filter((product) => nextSelection[product.id]).map((product) => product.id),
    });
  }

  function updateDraft(productId: string, field: DraftField, value: string) {
    setDrafts((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        [field]: value,
      },
    }));
    setFeedback(null);
  }

  function handleNumberChange(event: ChangeEvent<HTMLInputElement>, product: CatalogPresetProduct, field: DraftField) {
    updateDraft(product.id, field, event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCount) {
      setFeedback({ kind: "error", text: "Select at least one product to add." });
      return;
    }

    const formData = new FormData();
    formData.set("store_id", selectedStoreId);
    formData.set("preset_id", selectedPreset.id);
    formData.set("use_stock_photos", useStockPhotos ? "true" : "false");
    formData.set(
      "products",
      JSON.stringify(
        selectedProducts.map((product) => ({
          templateId: product.id,
          price: drafts[product.id]?.price ?? String(product.price),
          openingStock: drafts[product.id]?.openingStock ?? String(product.openingStock),
          minStock: drafts[product.id]?.minStock ?? String(product.minStock),
        })),
      ),
    );

    startTransition(async () => {
      const result = await createProductBundle(formData);
      setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      <button type="button" className={triggerClassName} onClick={openModal} disabled={!canWrite || !selectedStoreId}>
        <AdminIcon name="box" size={15} />
        {triggerLabel}
      </button>

      {open ? (
        <div className="products-dialog__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
          <section ref={modalRef} className="products-dialog multi-product-dialog" role="dialog" aria-modal="true" aria-labelledby="multi-product-dialog-title">
            <header className="products-dialog__header">
              <div>
                <p className="products-dialog__eyebrow">Starter catalog{orgName ? " · " + orgName : ""}</p>
                <h2 id="multi-product-dialog-title">Build your {selectedPreset.shortLabel} menu</h2>
                <p>Choose a business preset, keep the products you sell, then tune price and opening stock before adding them to the catalog.</p>
              </div>
              <button type="button" className="products-dialog__close" onClick={closeModal} aria-label="Close starter catalog">
                <AdminIcon name="close" size={18} />
              </button>
            </header>

            <form onSubmit={handleSubmit}>
              <div className="multi-product-dialog__body">
                <section className="multi-product-dialog__preset-section" aria-labelledby="preset-heading">
                  <div className="multi-product-dialog__section-heading">
                    <div>
                      <p className="products-dialog__eyebrow">01 · Choose a business</p>
                      <h3 id="preset-heading">Ready-made categories</h3>
                    </div>
                    <span>{selectedPreset.products.length} starter items</span>
                  </div>
                  <div className="multi-product-dialog__preset-grid" role="radiogroup" aria-label="Business catalog presets">
                    {CATALOG_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={preset.id === selectedPreset.id}
                        className={"multi-product-dialog__preset " + (preset.id === selectedPreset.id ? "is-selected" : "")}
                        onClick={() => choosePreset(preset)}
                      >
                        <span className="multi-product-dialog__preset-icon"><AdminIcon name={iconName(preset.icon)} size={17} /></span>
                        <span><strong>{preset.label}</strong><small>{preset.categories.length} categories · {preset.products.length} products</small></span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="multi-product-dialog__setup" aria-label="Starter catalog setup">
                  <div>
                    <p className="products-dialog__eyebrow">02 · Set up the branch</p>
                    <h3>{selectedPreset.label}</h3>
                    <p>{selectedPreset.description}</p>
                  </div>
                  <div className="multi-product-dialog__setup-controls">
                    {branches.length > 1 ? (
                      <label className="multi-product-dialog__select">
                        <span>Branch</span>
                        <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}>
                          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                        </select>
                      </label>
                    ) : (
                      <div className="multi-product-dialog__branch-note"><span>Branch</span><strong>{branchName || branches[0]?.name || "Current branch"}</strong></div>
                    )}
                    <label className="multi-product-dialog__photo-toggle">
                      <input type="checkbox" checked={useStockPhotos} onChange={(event) => setUseStockPhotos(event.target.checked)} />
                      <span><strong>Use ready-made stock photos</strong><small>Local menu images will be attached to the new products.</small></span>
                    </label>
                  </div>
                  <p className="multi-product-dialog__existing-note">{existingCategoryCount ? existingCategoryCount + " category" + (existingCategoryCount === 1 ? "" : "ies") + " already exist in this branch; they will be reused." : "Categories will be created for this branch and reused by every selected product."}</p>
                </section>

                <section className="multi-product-dialog__products-section" aria-labelledby="product-selection-heading">
                  <div className="multi-product-dialog__section-heading">
                    <div>
                      <p className="products-dialog__eyebrow">03 · Select what you sell</p>
                      <h3 id="product-selection-heading">Starter products</h3>
                    </div>
                    <span>{selectedCount} of {selectedPreset.products.length} selected</span>
                  </div>
                  <div className="multi-product-dialog__products">
                    {selectedPreset.products.map((product) => {
                      const isSelected = Boolean(selected[product.id]);
                      const draft = drafts[product.id] ?? { price: String(product.price), openingStock: String(product.openingStock), minStock: String(product.minStock) };
                      return (
                        <div key={product.id} className={"multi-product-dialog__product " + (isSelected ? "is-selected" : "")}>
                          <label className="multi-product-dialog__product-check">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleProduct(product.id)} />
                            <span className="multi-product-dialog__checkbox" aria-hidden="true"><AdminIcon name="check" size={12} /></span>
                          </label>
                          <span className="multi-product-dialog__product-image"><Image src={product.imageUrl} alt="" fill sizes="64px" /></span>
                          <span className="multi-product-dialog__product-copy"><strong>{product.name}</strong><small>{product.category} · sold per {product.unit}{product.pricingMode === "per_kg" ? " · per kg pricing" : ""}</small></span>
                          <label className="multi-product-dialog__field"><span>Price</span><span className="multi-product-dialog__currency"><b>₱</b><input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => handleNumberChange(event, product, "price")} disabled={!isSelected} aria-label={product.name + " price"} /></span></label>
                          <label className="multi-product-dialog__field"><span>Opening stock</span><input type="number" min="0" step="0.01" value={draft.openingStock} onChange={(event) => handleNumberChange(event, product, "openingStock")} disabled={!isSelected} aria-label={product.name + " opening stock"} /></label>
                          <label className="multi-product-dialog__field"><span>Min stock</span><input type="number" min="0" step="0.01" value={draft.minStock} onChange={(event) => handleNumberChange(event, product, "minStock")} disabled={!isSelected} aria-label={product.name + " minimum stock"} /></label>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {feedback ? <p className={"multi-product-dialog__feedback " + (feedback.kind === "success" ? "is-success" : "is-error")} role={feedback.kind === "success" ? "status" : "alert"}>{feedback.text}</p> : null}
              </div>

              <footer className="products-dialog__footer multi-product-dialog__footer">
                <div><strong>{selectedCount} product{selectedCount === 1 ? "" : "s"} ready</strong><span>Prices and stock can still be edited from Products and Inventory.</span></div>
                <div className="products-dialog__footer-actions">
                  <button type="button" className="products-dialog__cancel" onClick={closeModal} disabled={isPending}>Cancel</button>
                  <button type="submit" className="products-primary-button" disabled={isPending || !selectedCount || !selectedStoreId}>
                    <AdminIcon name={isPending ? "refresh" : "check"} size={15} />
                    {isPending ? "Adding products..." : "Add selected products"}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
