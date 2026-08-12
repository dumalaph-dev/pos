"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createDisplayPromotion,
  updateDisplayPromotion,
} from "@/app/admin/pos/actions";
import {
  DISPLAY_IMAGE_OPTIONS,
  resolveDisplayCopy,
  type DisplayPromotionRecord,
} from "@/lib/display-config";
import {
  displayPairingUrl,
  normalizeDisplayPairingToken,
  type DisplaySettings,
} from "@/lib/display";
import DisplayGalleryPanel from "@/components/admin/DisplayGalleryPanel";
import type { DisplayGalleryRecord, DisplayMenuItem } from "@/lib/display-gallery";

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

function DisplayToggle({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="pos-toggle-row pos-display-setting-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        className={`pos-toggle ${checked ? "is-on" : ""}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      ><span /></button>
    </div>
  );
}

function ImageOptions({ current, disabled = false }: { current: string | null; disabled?: boolean }) {
  const hasCustomImage = current && !DISPLAY_IMAGE_OPTIONS.some((option) => option.value === current);
  return (
    <select name="image_url" defaultValue={current ?? ""} disabled={disabled}>
      <option value="">Use the shop fallback image</option>
      {hasCustomImage ? <option value={current}>{current}</option> : null}
      {DISPLAY_IMAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function PromotionCard({ promotion, onOpen }: { promotion: DisplayPromotionRecord; onOpen: (promotion: DisplayPromotionRecord) => void }) {
  const imageUrl = promotion.imageUrl ?? DISPLAY_IMAGE_OPTIONS[0].value;

  return (
    <button type="button" className="pos-display-promotion-card" onClick={() => onOpen(promotion)} aria-label={`Edit ${promotion.title} promotion`}>
      <span className="pos-display-promotion-card__media"><Image src={imageUrl} alt="" width={640} height={360} /></span>
      <span className="pos-display-promotion-card__content">
        <span className="pos-display-promotion-card__meta">
          <span className={`pos-display-status${promotion.isActive ? " is-live" : ""}`}>{promotion.isActive ? "Live" : "Off"}</span>
          <span className="pos-display-promotion-card__order">Card {promotion.sortOrder}</span>
        </span>
        <strong>{promotion.title}</strong>
        <span className="pos-display-promotion-card__eyebrow">{promotion.eyebrow || "Customer display card"}</span>
        <span className="pos-display-promotion-card__detail">{promotion.detail || "Add a short message for customers while they wait."}</span>
        <span className="pos-display-promotion-card__footer"><span>{promotion.tagline || "No callout added"}</span><span className="pos-display-promotion-card__edit">Edit</span></span>
      </span>
    </button>
  );
}

function PromotionModal({
  promotion,
  storeId,
  canWrite,
  promotionsUnavailable,
  onClose,
}: {
  promotion: DisplayPromotionRecord | null;
  storeId: string;
  canWrite: boolean;
  promotionsUnavailable: boolean;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const isNew = promotion === null;
  const imageUrl = promotion?.imageUrl ?? DISPLAY_IMAGE_OPTIONS[0].value;
  const modalLabel = isNew ? "New promotion" : promotion.isActive ? "Live promotion" : "Archived promotion";

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    const firstInput = modalRef.current?.querySelector<HTMLElement>("[data-promotion-autofocus]");
    firstInput?.focus();

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

  return (
    <div className="pos-display-promotion-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={modalRef} className="pos-display-promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-modal-title">
        <header className="pos-display-promotion-modal__header">
          <div>
            <div className="pos-display-promotion-modal__eyebrow"><span className={`pos-display-status${promotion?.isActive ? " is-live" : ""}`}>{modalLabel}</span><span>{isNew ? "Customer display card" : `Card ${promotion.sortOrder}`}</span></div>
            <h2 id="promotion-modal-title">{isNew ? "Create a promotion card" : promotion.title}</h2>
            <p>{isNew ? "Give customers something useful to look at while their order is being prepared." : "Update the message, image, and visibility for this customer display card."}</p>
          </div>
          <button type="button" className="pos-display-promotion-modal__close" onClick={onClose} aria-label="Close promotion editor">Close</button>
        </header>

        <form action={promotion ? updateDisplayPromotion : createDisplayPromotion} className="pos-display-promotion-modal__form">
          <input type="hidden" name="store_id" value={storeId} />
          {promotion ? <input type="hidden" name="promotion_id" value={promotion.id} /> : null}

          <div className="pos-display-promotion-modal__preview">
            <span className="pos-display-promotion-modal__preview-media"><Image src={imageUrl} alt="" width={240} height={140} /></span>
            <span className="pos-display-promotion-modal__preview-copy"><strong>{promotion?.title ?? "Your next customer message"}</strong><span>{promotion?.detail ?? "A short, friendly reason to add something to the order."}</span></span>
          </div>

          <div className="pos-display-promotion-modal__form-grid">
            <label className="pos-config-field"><span>Eyebrow</span><input data-promotion-autofocus name="eyebrow" defaultValue={promotion?.eyebrow ?? ""} maxLength={80} disabled={!canWrite || promotionsUnavailable} placeholder="Made for the table" /></label>
            <label className="pos-config-field"><span>Image asset</span><ImageOptions current={imageUrl} disabled={!canWrite || promotionsUnavailable} /></label>
            <label className="pos-config-field"><span>Headline</span><input name="title" defaultValue={promotion?.title ?? ""} maxLength={120} required disabled={!canWrite || promotionsUnavailable} placeholder="Bring home the good stuff." /></label>
            <label className="pos-config-field"><span>Callout</span><input name="tagline" defaultValue={promotion?.tagline ?? ""} maxLength={120} disabled={!canWrite || promotionsUnavailable} placeholder="Ask our team for a pairing." /></label>
            <label className="pos-config-field"><span>Supporting copy</span><textarea name="detail" defaultValue={promotion?.detail ?? ""} maxLength={240} disabled={!canWrite || promotionsUnavailable} placeholder="A short reason to add this to the order." /></label>
            <label className="pos-config-field"><span>Display order</span><input name="sort_order" type="number" inputMode="numeric" step="1" min="-1000" max="1000" defaultValue={promotion?.sortOrder ?? 0} disabled={!canWrite || promotionsUnavailable} /></label>
          </div>

          <label className="pos-display-promotion-modal__active"><input type="checkbox" name="is_active" defaultChecked={promotion?.isActive ?? true} disabled={!canWrite || promotionsUnavailable} /><span><strong>{promotion?.isActive ? "Live on the paired display" : "Turn this card on"}</strong><small>{isNew ? "Publish immediately after creating the card." : "Inactive cards stay saved but will not rotate on the customer display."}</small></span></label>

          <footer className="pos-display-promotion-modal__footer">
            <small>{promotion?.startsAt || promotion?.endsAt ? "This card has a scheduled window." : "Shown while active; schedule controls can be added later."}</small>
            <div><button type="button" className="pos-outline-button" onClick={onClose}>Cancel</button><button type="submit" className="pos-save-button" disabled={!canWrite || promotionsUnavailable}>{isNew ? "Add promotion" : "Save promotion"}</button></div>
          </footer>
        </form>
      </div>
    </div>
  );
}

function DisplayLinkCard({ branchName, token }: { branchName: string; token: string | null }) {
  const normalizedToken = normalizeDisplayPairingToken(token);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState(false);

  const displayUrl = useMemo(
    () => normalizedToken ? displayPairingUrl(normalizedToken, origin) : "",
    [normalizedToken, origin],
  );

  async function copyLink() {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="pos-display-link-card" aria-labelledby="display-link-title">
      <div className="pos-display-card-heading">
        <div>
          <p>Pairing</p>
          <h3 id="display-link-title">Connect a second screen</h3>
        </div>
        <span className={`pos-display-status${normalizedToken ? " is-live" : ""}`}>{normalizedToken ? "Paired" : "Not paired"}</span>
      </div>

      <div className="pos-display-connection-state">
        <span className={`pos-display-connection-dot${normalizedToken ? " is-live" : ""}`} aria-hidden="true" />
        <div>
          <strong>{normalizedToken ? `${branchName} display is ready` : "No display link yet"}</strong>
          <p>{normalizedToken ? "Open the link below on the customer-facing tablet or monitor." : "Open the POS screen's Display tool to create a secure pairing token for this branch."}</p>
        </div>
      </div>

      {normalizedToken ? (
        <div className="pos-display-link-fields">
          <label className="pos-config-field"><span>Pairing token</span><input readOnly value={normalizedToken} aria-label="Customer display pairing token" onFocus={(event) => event.currentTarget.select()} /></label>
          <label className="pos-config-field"><span>Display link</span><input readOnly value={displayUrl} aria-label="Customer display link" onFocus={(event) => event.currentTarget.select()} /></label>
          <div className="pos-display-link-actions">
            <button type="button" className="pos-save-button" onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</button>
            <a className="pos-outline-button" href={displayUrl} target="_blank" rel="noopener noreferrer">Open display</a>
          </div>
        </div>
      ) : (
        <p className="pos-display-link-empty">Pairing is saved on the POS terminal, so this dashboard only shows the link once a token has been created.</p>
      )}
    </section>
  );
}

export default function DisplayPromotionsPanel({
  storeId,
  branchName,
  themeLabel,
  displayPairingToken,
  canWrite,
  initialPromotions,
  initialGalleryItems,
  initialMenuItems,
  settings,
  onSettingsChange,
  promotionsUnavailable,
  galleryUnavailable,
}: {
  storeId: string;
  branchName: string;
  themeLabel: string;
  displayPairingToken: string | null;
  canWrite: boolean;
  initialPromotions: DisplayPromotionRecord[];
  initialGalleryItems: DisplayGalleryRecord[];
  initialMenuItems: DisplayMenuItem[];
  settings: DisplaySettings;
  onSettingsChange: (settings: DisplaySettings) => void;
  promotionsUnavailable: boolean;
  galleryUnavailable: boolean;
}) {
  const [editingPromotion, setEditingPromotion] = useState<DisplayPromotionRecord | "new" | null>(null);
  const activePromotionCount = initialPromotions.filter((promotion) => promotion.isActive).length;
  const closePromotionModal = useCallback(() => setEditingPromotion(null), []);
  const updateSetting = <Key extends keyof DisplaySettings>(key: Key, value: DisplaySettings[Key]) => {
    onSettingsChange({ ...settings, [key]: value });
  };
  const updateAllGallerySources = (enabled: boolean) => {
    onSettingsChange({
      ...settings,
      showGallery: enabled,
      showMarketingGallery: enabled,
      showMenuGallery: enabled,
    });
  };
  const updateGallerySource = (kind: "marketing" | "menu", enabled: boolean) => {
    const showMarketingGallery = kind === "marketing" ? enabled : settings.showMarketingGallery;
    const showMenuGallery = kind === "menu" ? enabled : settings.showMenuGallery;
    onSettingsChange({
      ...settings,
      showGallery: showMarketingGallery || showMenuGallery,
      showMarketingGallery,
      showMenuGallery,
    });
  };

  return (
    <div className="pos-config-panel pos-display-config-panel">
      <div className="pos-display-intro">
        <div className="pos-config-heading">
          <p>Customer display</p>
          <h2>Make the second screen work for {branchName}.</h2>
          <span>Keep the order summary clear, make the total easy to see, and turn idle time into a helpful message for your customers.</span>
        </div>
        <div className="pos-display-intro-stats" aria-label="Customer display summary">
          <span><strong>{activePromotionCount}</strong> live card{activePromotionCount === 1 ? "" : "s"}</span>
          <span><strong>{Object.values(settings).filter((value) => value === true).length}</strong> display options on</span>
          <span><strong>Theme</strong> {themeLabel}</span>
        </div>
      </div>

      <div className="pos-display-overview-grid">
        <div className="pos-display-link-stack">
          <DisplayLinkCard branchName={branchName} token={displayPairingToken} />
          <section className="pos-display-completed-order-card" aria-labelledby="completed-order-title">
            <div className="pos-display-card-heading">
              <div>
                <p>Completed order</p>
                <h3 id="completed-order-title">Thank-you screen</h3>
              </div>
              <span className="pos-display-card-note">After payment</span>
            </div>
            <div className="pos-display-completed-order-preview">
              <span>Preview</span>
              <strong>{settings.completedOrderTitle || "Salamat po!"}</strong>
              <p>{resolveDisplayCopy(settings.completedOrderMessage || "Your order is being prepared.", branchName)}</p>
            </div>
            <div className="pos-display-completed-order-fields">
              <label className="pos-config-field">
                <span>Headline</span>
                <input value={settings.completedOrderTitle} maxLength={100} disabled={!canWrite} onChange={(event) => updateSetting("completedOrderTitle", event.target.value)} placeholder="Salamat po!" />
              </label>
              <label className="pos-config-field">
                <span>Message</span>
                <input value={settings.completedOrderMessage} maxLength={180} disabled={!canWrite} onChange={(event) => updateSetting("completedOrderMessage", event.target.value)} placeholder="Your order is being prepared." />
                <small>Use <code>{"{branch}"}</code> if you want to include the branch name.</small>
              </label>
            </div>
          </section>
        </div>

        <div className="pos-display-settings-card">
          <div className="pos-display-card-heading">
            <div>
              <p>Display preferences</p>
              <h3>What customers see</h3>
            </div>
            <span className="pos-display-card-note">Updates after save</span>
          </div>
          <div className="pos-display-default-screen">
            <div className="pos-display-default-screen__heading">
              <div>
                <p>Default screen</p>
                <h4>Standby message</h4>
              </div>
              <span>Shown between orders</span>
            </div>
            <div className="pos-display-default-screen__body">
              <div className="pos-display-default-screen__preview" aria-label="Standby message preview">
                <span>Preview</span>
                <strong>{settings.idleTitle || "Freshly made for you."}</strong>
                <p>{resolveDisplayCopy(settings.idleSubtitle || "Salamat for supporting {branch}.", branchName)}</p>
              </div>
              <div className="pos-display-default-screen__fields">
                <label className="pos-config-field">
                  <span>Headline</span>
                  <input value={settings.idleTitle} maxLength={100} disabled={!canWrite} onChange={(event) => updateSetting("idleTitle", event.target.value)} placeholder="Freshly made for you." />
                </label>
                <label className="pos-config-field">
                  <span>Supporting message</span>
                  <input value={settings.idleSubtitle} maxLength={180} disabled={!canWrite} onChange={(event) => updateSetting("idleSubtitle", event.target.value)} placeholder="Salamat for supporting {branch}." />
                  <small>Use <code>{"{branch}"}</code> to insert the branch name automatically.</small>
                </label>
              </div>
            </div>
          </div>
          <div className="pos-display-setting-grid">
            <DisplayToggle title="Shop promotions" description="Rotate cards while the display is idle." checked={settings.showPromotions} disabled={!canWrite} onChange={(value) => updateSetting("showPromotions", value)} />
            <DisplayToggle title="Gallery playback" description="Use the source pills below to choose what rotates." checked={settings.showMarketingGallery || settings.showMenuGallery} disabled={!canWrite} onChange={updateAllGallerySources} />
            <DisplayToggle title="Item quantities" description="Show quantities and weights in the order." checked={settings.showQuantity} disabled={!canWrite} onChange={(value) => updateSetting("showQuantity", value)} />
            <DisplayToggle title="Subtotal" description="Show the pre-discount subtotal." checked={settings.showSubtotal} disabled={!canWrite} onChange={(value) => updateSetting("showSubtotal", value)} />
            <DisplayToggle title="Discounts" description="Show applied discounts before payment." checked={settings.showDiscount} disabled={!canWrite} onChange={(value) => updateSetting("showDiscount", value)} />
            <DisplayToggle title="Order number" description="Show the order number after payment." checked={settings.showOrderNumber} disabled={!canWrite} onChange={(value) => updateSetting("showOrderNumber", value)} />
          </div>
          <div className="pos-display-rotation">
            <label className="pos-config-field"><span>Promotion rotation</span><small>How long each card stays on screen.</small><select value={settings.rotationSeconds} disabled={!canWrite} onChange={(event) => updateSetting("rotationSeconds", Number(event.target.value))}><option value={5}>5 seconds</option><option value={7}>7 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option><option value={20}>20 seconds</option></select></label>
            <div className="pos-display-settings-footer"><small>Use Save Changes above to apply display settings to {branchName}&apos;s paired display.</small></div>
          </div>
        </div>
      </div>

      <DisplayGalleryPanel
        storeId={storeId}
        canWrite={canWrite}
        settings={settings}
        onToggleAll={updateAllGallerySources}
        onToggleSource={updateGallerySource}
        initialItems={initialGalleryItems}
        menuItems={initialMenuItems}
        galleryUnavailable={galleryUnavailable}
      />

      <section className="pos-display-promotions" aria-labelledby="display-promotions-title">
        {promotionsUnavailable ? <div className="pos-display-schema-note" role="status"><strong>Saved promotion cards are waiting for the database migration.</strong><span>Apply <code>0042_display_promotions.sql</code> before creating or editing branch cards. Display preferences can still be saved now.</span></div> : null}
        <div className="pos-display-promotions__heading">
          <div><p>Promotional cards</p><h3 id="display-promotions-title">Your shop&apos;s message between orders</h3><span>Choose a card to edit its copy, image, order, or live status. The full editor opens only when you need it.</span></div>
          <div className="pos-display-promotions__heading-actions"><span className="pos-display-promotions__count">{activePromotionCount} live</span><button type="button" className="pos-outline-button" onClick={() => setEditingPromotion("new")} disabled={!canWrite || promotionsUnavailable}>Add card</button></div>
        </div>
        <div className="pos-display-promotion-card-grid">
          {initialPromotions.length ? initialPromotions.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion} onOpen={setEditingPromotion} />) : <div className="pos-display-empty"><strong>No custom cards yet.</strong><span>The customer display will use the local Dumala preview cards until you add your first branch promotion.</span><button type="button" className="pos-outline-button" onClick={() => setEditingPromotion("new")} disabled={!canWrite || promotionsUnavailable}>Create first card</button></div>}
        </div>
      </section>

      {editingPromotion ? <PromotionModal key={editingPromotion === "new" ? "new-promotion" : editingPromotion.id} promotion={editingPromotion === "new" ? null : editingPromotion} storeId={storeId} canWrite={canWrite} promotionsUnavailable={promotionsUnavailable} onClose={closePromotionModal} /> : null}
    </div>
  );
}
