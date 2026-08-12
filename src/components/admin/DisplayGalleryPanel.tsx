"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDisplayGalleryItem,
  deleteDisplayGalleryItem,
  updateDisplayGalleryItem,
} from "@/app/admin/pos/actions";
import { ProductImageUpload } from "@/components/admin/ProductImageUpload";
import {
  DISPLAY_GALLERY_FALLBACK_IMAGE_SIDE,
  DISPLAY_GALLERY_KIND_OPTIONS,
  DISPLAY_GALLERY_MAX_BYTES,
  DISPLAY_GALLERY_MAX_IMAGE_SIDE,
  DISPLAY_GALLERY_OVERLAY_OPTIONS,
  DISPLAY_GALLERY_RECOMMENDED_SIZE,
  type DisplayGalleryKind,
  type DisplayMenuItem,
  type DisplayGalleryRecord,
} from "@/lib/display-gallery";
import type { DisplaySettings } from "@/lib/display";

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

function galleryKindLabel(kind: DisplayGalleryKind) {
  return kind === "menu" ? "Menu item" : "Marketing poster";
}

function GalleryTile({ item, onOpen }: { item: DisplayGalleryRecord; onOpen: (item: DisplayGalleryRecord) => void }) {
  return (
    <button type="button" className="pos-display-gallery-tile" onClick={() => onOpen(item)} aria-label={`Edit ${item.title} gallery image`}>
      <span className="pos-display-gallery-tile__media">
        <Image src={item.imageUrl} alt="" fill sizes="(max-width: 760px) 50vw, 220px" />
        <span className={`pos-display-gallery-tile__overlay${item.overlayPosition === "right" ? " is-right" : ""}`} aria-hidden="true">
          <span>{item.title}</span>
        </span>
      </span>
      <span className="pos-display-gallery-tile__body">
        <span className="pos-display-gallery-tile__meta">
          <span className={`pos-display-status${item.isActive ? " is-live" : ""}`}>{item.isActive ? "Live" : "Off"}</span>
          <span>{galleryKindLabel(item.kind)}</span>
        </span>
        <strong>{item.title}</strong>
        <span>Title {item.overlayPosition === "right" ? "bottom right" : "bottom left"} · Order {item.sortOrder}</span>
      </span>
    </button>
  );
}

function MenuGalleryTile({ item }: { item: DisplayMenuItem }) {
  const overlayPosition = item.sortOrder % 2 === 0 ? "left" : "right";
  return (
    <div className="pos-display-gallery-tile is-readonly" role="group" aria-label={`${item.title} from POS catalog`}>
      <span className="pos-display-gallery-tile__media">
        <Image src={item.imageUrl} alt="" fill sizes="(max-width: 760px) 50vw, 220px" />
        <span className={`pos-display-gallery-tile__overlay${overlayPosition === "right" ? " is-right" : ""}`} aria-hidden="true">
          <span>{item.title}</span>
        </span>
      </span>
      <span className="pos-display-gallery-tile__body">
        <span className="pos-display-gallery-tile__meta">
          <span className="pos-display-status is-live">Synced</span>
          <span>{item.categoryName || "POS product"}</span>
        </span>
        <strong>{item.title}</strong>
        <span>Uses the current POS product photo</span>
      </span>
    </div>
  );
}

function GalleryModal({
  item,
  storeId,
  canWrite,
  galleryUnavailable,
  onClose,
}: {
  item: DisplayGalleryRecord | null;
  storeId: string;
  canWrite: boolean;
  galleryUnavailable: boolean;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const isNew = item === null;
  const formId = `display-gallery-form-${item?.id ?? "new"}`;
  const imageUrl = item?.imageUrl ?? "/food/whole-lechon-medium.png";
  const kind = item?.kind ?? "marketing";

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    modalRef.current?.querySelector<HTMLElement>("[data-gallery-autofocus]")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const disabled = !canWrite || galleryUnavailable;

  return (
    <div className="pos-display-gallery-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={modalRef} className="pos-display-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="display-gallery-modal-title">
        <header className="pos-display-gallery-modal__header">
          <div>
            <div className="pos-display-gallery-modal__eyebrow"><span className={`pos-display-status${item?.isActive ? " is-live" : ""}`}>{isNew ? "New image" : item.isActive ? "Live" : "Off"}</span><span>{galleryKindLabel(kind)}</span></div>
            <h2 id="display-gallery-modal-title">{isNew ? "Add a full-screen image" : `Edit ${item.title}`}</h2>
            <p>Upload a clean 16:9 marketing photo. Menu Showcase syncs directly from your active POS products.</p>
          </div>
          <button type="button" className="pos-display-gallery-modal__close" onClick={onClose} aria-label="Close gallery editor">Close</button>
        </header>

        <form id={formId} action={isNew ? createDisplayGalleryItem : updateDisplayGalleryItem} className="pos-display-gallery-modal__form">
          <input type="hidden" name="store_id" value={storeId} />
          <input type="hidden" name="kind" value="marketing" />
          {item ? <input type="hidden" name="item_id" value={item.id} /> : null}

          <div className={`pos-display-gallery-modal__preview${item?.overlayPosition === "right" ? " is-right" : ""}`}>
            <Image src={imageUrl} alt="" fill sizes="(max-width: 760px) 100vw, 560px" />
            <span className="pos-display-gallery-modal__preview-scrim" aria-hidden="true" />
            <span className="pos-display-gallery-modal__preview-title">{item?.title ?? "Your image title"}</span>
            <span className="pos-display-gallery-modal__preview-note">Customer display preview</span>
          </div>

          <div className="pos-display-gallery-modal__form-grid">
            <label className="pos-config-field"><span>{kind === "menu" ? "Menu item name" : "Poster title"}</span><input data-gallery-autofocus name="title" defaultValue={item?.title ?? ""} maxLength={120} required disabled={disabled} placeholder={kind === "menu" ? "Lechon belly" : "Weekend family bundle"} /></label>
            <label className="pos-config-field"><span>Title position</span><select name="overlay_position" defaultValue={item?.overlayPosition ?? "left"} disabled={disabled}>{DISPLAY_GALLERY_OVERLAY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="pos-config-field"><span>Display order</span><input name="sort_order" type="number" inputMode="numeric" step="1" min="-1000" max="1000" defaultValue={item?.sortOrder ?? 0} disabled={disabled} /></label>
          </div>

          <ProductImageUpload
            existingImageUrl={item?.imageUrl}
            canWrite={canWrite && !galleryUnavailable}
            prefix={`display-gallery-${item?.id ?? "new"}`}
            fieldName="image_file"
            label="Full-screen photo"
            uploadLabel="Upload photo"
            replaceLabel="Replace photo"
            previewLabel="Full-screen gallery photo preview"
            assetLabel="gallery photo"
            maxImageSide={DISPLAY_GALLERY_MAX_IMAGE_SIDE}
            fallbackImageSide={DISPLAY_GALLERY_FALLBACK_IMAGE_SIDE}
            maxBytes={DISPLAY_GALLERY_MAX_BYTES}
            recommendedText={`JPG, PNG, or WebP · recommended ${DISPLAY_GALLERY_RECOMMENDED_SIZE} · optimized under 1.8 MB`}
            required={isNew}
          />

          <label className="pos-display-gallery-modal__active"><input type="checkbox" name="is_active" defaultChecked={item?.isActive ?? true} disabled={disabled} /><span><strong>{item?.isActive === false ? "Keep this image off the display" : "Show this image on the display"}</strong><small>Active images rotate during the standby screen when Full-screen gallery is enabled.</small></span></label>
        </form>

        <footer className="pos-display-gallery-modal__footer">
          <small>Recommended: {DISPLAY_GALLERY_RECOMMENDED_SIZE}. Images are resized only when needed and keep a high-quality WebP/JPEG export.</small>
          <div>
            {item ? (
              <form action={deleteDisplayGalleryItem} onSubmit={(event) => { if (!window.confirm(`Remove ${item.title} from the gallery?`)) event.preventDefault(); }}>
                <input type="hidden" name="store_id" value={storeId} />
                <input type="hidden" name="item_id" value={item.id} />
                <button type="submit" className="pos-display-gallery-modal__delete" disabled={disabled}>Remove</button>
              </form>
            ) : null}
            <button type="button" className="pos-outline-button" onClick={onClose}>Cancel</button>
            <button type="submit" form={formId} className="pos-save-button" disabled={disabled}>{isNew ? "Add image" : "Save image"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function DisplayGalleryPanel({
  storeId,
  canWrite,
  settings,
  onToggleAll,
  onToggleSource,
  initialItems,
  menuItems,
  galleryUnavailable,
}: {
  storeId: string;
  canWrite: boolean;
  settings: DisplaySettings;
  onToggleAll: (enabled: boolean) => void;
  onToggleSource: (kind: "marketing" | "menu", enabled: boolean) => void;
  initialItems: DisplayGalleryRecord[];
  menuItems: DisplayMenuItem[];
  galleryUnavailable: boolean;
}) {
  const [activeKind, setActiveKind] = useState<DisplayGalleryKind>("marketing");
  const [editingItem, setEditingItem] = useState<DisplayGalleryRecord | "new" | null>(null);
  const visibleItems = useMemo(() => initialItems.filter((item) => item.kind === activeKind), [activeKind, initialItems]);
  const galleryEnabled = settings.showMarketingGallery || settings.showMenuGallery;
  const marketingEnabled = settings.showMarketingGallery;
  const menuEnabled = settings.showMenuGallery;
  const activeCount = (marketingEnabled ? initialItems.filter((item) => item.isActive).length : 0) + (menuEnabled ? menuItems.length : 0);
  const closeModal = () => setEditingItem(null);

  function openItem(item: DisplayGalleryRecord) {
    setActiveKind(item.kind);
    setEditingItem(item);
  }

  return (
    <section className="pos-display-gallery" aria-labelledby="display-gallery-title">
      {galleryUnavailable ? <div className="pos-display-schema-note" role="status"><strong>Marketing uploads are waiting for the database migration.</strong><span>Apply <code>0043_display_gallery.sql</code> before uploading poster photos. Menu Showcase still syncs from active POS products.</span></div> : null}
      <div className="pos-display-gallery__heading">
        <div>
          <p>Marketing / Menu gallery</p>
          <h3 id="display-gallery-title">Full-screen photos on standby</h3>
          <span>Show a marketing poster or your current POS menu while the counter is between orders. Menu images and names stay synced with the product catalog.</span>
        </div>
        <div className="pos-display-gallery__heading-actions">
          <button
            type="button"
            role="switch"
            aria-checked={galleryEnabled}
            aria-label={`${galleryEnabled ? "Turn off" : "Turn on"} all gallery sources`}
            className={`pos-display-gallery__state${galleryEnabled ? " is-live" : ""}`}
            onClick={() => onToggleAll(!galleryEnabled)}
            disabled={!canWrite}
          >{galleryEnabled ? "Gallery on" : "Gallery off"}</button>
          <button
            type="button"
            role="switch"
            aria-checked={marketingEnabled}
            aria-label={`${marketingEnabled ? "Turn off" : "Turn on"} marketing posters`}
            className={`pos-display-gallery__source-toggle${marketingEnabled ? " is-on" : ""}`}
            onClick={() => onToggleSource("marketing", !marketingEnabled)}
            disabled={!canWrite}
          >Posters {marketingEnabled ? "on" : "off"}</button>
          <button
            type="button"
            role="switch"
            aria-checked={menuEnabled}
            aria-label={`${menuEnabled ? "Turn off" : "Turn on"} menu showcase`}
            className={`pos-display-gallery__source-toggle${menuEnabled ? " is-on" : ""}`}
            onClick={() => onToggleSource("menu", !menuEnabled)}
            disabled={!canWrite}
          >Menu {menuEnabled ? "on" : "off"}</button>
          <span className="pos-display-gallery__count">{activeCount} live</span>
          <span className="pos-display-gallery__save-hint">Save Changes above to apply</span>
          {activeKind === "marketing" ? <button type="button" className="pos-outline-button" onClick={() => setEditingItem("new")} disabled={!canWrite || galleryUnavailable}>Add poster</button> : null}
        </div>
      </div>

      <div className="pos-display-gallery__tabs" role="tablist" aria-label="Gallery content type">
        {DISPLAY_GALLERY_KIND_OPTIONS.map((option) => {
          const count = option.value === "menu" ? menuItems.length : initialItems.filter((item) => item.kind === option.value).length;
          return <button key={option.value} type="button" role="tab" aria-selected={activeKind === option.value} className={`pos-display-gallery__tab${activeKind === option.value ? " is-active" : ""}`} onClick={() => setActiveKind(option.value)}>{option.value === "menu" ? "Menu showcase" : "Marketing posters"}<span>{count}</span></button>;
        })}
      </div>

      {activeKind === "menu" ? (
        menuItems.length ? <div className="pos-display-gallery__grid">{menuItems.map((item) => <MenuGalleryTile key={item.id} item={item} />)}</div> : <div className="pos-display-gallery__empty"><div><strong>No active POS products yet.</strong><span>Menu Showcase syncs automatically from products currently visible in the POS. Add a product photo from the catalog to change its display image.</span></div><a href="/products?pos=1" className="pos-outline-button">Open Products</a></div>
      ) : visibleItems.length ? (
        <div className="pos-display-gallery__grid">
          {visibleItems.map((item) => <GalleryTile key={item.id} item={item} onOpen={openItem} />)}
        </div>
      ) : (
        <div className="pos-display-gallery__empty">
          <div><strong>No marketing posters yet.</strong><span>Upload a poster or campaign image to start the marketing rotation.</span></div>
          <button type="button" className="pos-outline-button" onClick={() => setEditingItem("new")} disabled={!canWrite || galleryUnavailable}>Add poster</button>
        </div>
      )}

      {editingItem ? <GalleryModal item={editingItem === "new" ? null : editingItem} storeId={storeId} canWrite={canWrite} galleryUnavailable={galleryUnavailable} onClose={closeModal} /> : null}
    </section>
  );
}
