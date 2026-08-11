"use client";

import { useState } from "react";
import {
  createDisplayPromotion,
  saveDisplaySettings,
  updateDisplayPromotion,
} from "@/app/admin/pos/actions";
import {
  DISPLAY_IMAGE_OPTIONS,
  type DisplayPromotionRecord,
} from "@/lib/display-config";
import type { DisplaySettings } from "@/lib/display";

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
    <div className="pos-toggle-row">
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

function PromotionEditor({ promotion, storeId, canWrite }: { promotion: DisplayPromotionRecord; storeId: string; canWrite: boolean }) {
  return (
    <form action={updateDisplayPromotion} className="pos-display-promotion-editor">
      <input type="hidden" name="promotion_id" value={promotion.id} />
      <input type="hidden" name="store_id" value={storeId} />
      <div className="pos-display-promotion-editor__header">
        <div>
          <strong>{promotion.isActive ? "Live promotion" : "Archived promotion"}</strong>
          <small>Card order {promotion.sortOrder} · {promotion.id.slice(0, 8)}</small>
        </div>
        <label className="pos-checkbox"><input type="checkbox" name="is_active" defaultChecked={promotion.isActive} disabled={!canWrite} /><span>{promotion.isActive ? "Active" : "Turn on"}</span></label>
      </div>
      <div className="pos-config-grid">
        <label className="pos-config-field"><span>Eyebrow</span><input name="eyebrow" defaultValue={promotion.eyebrow} maxLength={80} disabled={!canWrite} placeholder="Made for the table" /></label>
        <label className="pos-config-field"><span>Image asset</span><ImageOptions current={promotion.imageUrl} disabled={!canWrite} /></label>
        <label className="pos-config-field pos-config-field--full"><span>Headline</span><input name="title" defaultValue={promotion.title} maxLength={120} required disabled={!canWrite} /></label>
        <label className="pos-config-field pos-config-field--full"><span>Supporting copy</span><textarea name="detail" defaultValue={promotion.detail} maxLength={240} disabled={!canWrite} placeholder="A short reason to add this to the order." /></label>
        <label className="pos-config-field"><span>Callout</span><input name="tagline" defaultValue={promotion.tagline} maxLength={120} disabled={!canWrite} placeholder="Ask our team for a pairing." /></label>
        <label className="pos-config-field"><span>Display order</span><input name="sort_order" type="number" inputMode="numeric" step="1" min="-1000" max="1000" defaultValue={promotion.sortOrder} disabled={!canWrite} /></label>
      </div>
      <div className="pos-display-promotion-editor__footer">
        <small>{promotion.startsAt || promotion.endsAt ? "This card has a scheduled window." : "Shown while active; schedule controls can be added later."}</small>
        <button type="submit" className="pos-outline-button" disabled={!canWrite}>Save promotion</button>
      </div>
    </form>
  );
}

export default function DisplayPromotionsPanel({
  storeId,
  branchName,
  canWrite,
  initialPromotions,
  initialSettings,
  promotionsUnavailable,
}: {
  storeId: string;
  branchName: string;
  canWrite: boolean;
  initialPromotions: DisplayPromotionRecord[];
  initialSettings: DisplaySettings;
  promotionsUnavailable: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const updateSetting = <Key extends keyof DisplaySettings>(key: Key, value: DisplaySettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="pos-config-panel pos-display-config-panel">
      <div className="pos-config-heading">
        <p>Customer display</p>
        <h2>Make the second screen work for {branchName}.</h2>
        <span>Owners can control what customers see while they wait: the order summary, the total, and your shop&apos;s own promotional cards.</span>
      </div>

      <form action={saveDisplaySettings} className="pos-display-settings-form">
        <input type="hidden" name="store_id" value={storeId} />
        <input type="hidden" name="settings" value={JSON.stringify(settings)} readOnly />
        <div className="pos-config-list">
          <DisplayToggle title="Show shop promotions" description="Rotate your promotional cards while the display is idle or an order is being built." checked={settings.showPromotions} disabled={!canWrite} onChange={(value) => updateSetting("showPromotions", value)} />
          <DisplayToggle title="Show item quantities" description="Keep quantities and weights visible in the customer-facing order list." checked={settings.showQuantity} disabled={!canWrite} onChange={(value) => updateSetting("showQuantity", value)} />
          <DisplayToggle title="Show subtotal" description="Show the pre-discount subtotal before the customer pays." checked={settings.showSubtotal} disabled={!canWrite} onChange={(value) => updateSetting("showSubtotal", value)} />
          <DisplayToggle title="Show discounts" description="Show the discount line when a cashier applies a discount." checked={settings.showDiscount} disabled={!canWrite} onChange={(value) => updateSetting("showDiscount", value)} />
          <DisplayToggle title="Show order number after payment" description="Include the order number in the short thank-you screen." checked={settings.showOrderNumber} disabled={!canWrite} onChange={(value) => updateSetting("showOrderNumber", value)} />
        </div>
        <div className="pos-config-grid pos-display-settings-grid">
          <label className="pos-config-field"><span>Promotion rotation</span><small>How long each card stays on screen.</small><select value={settings.rotationSeconds} disabled={!canWrite} onChange={(event) => updateSetting("rotationSeconds", Number(event.target.value))}><option value={5}>5 seconds</option><option value={7}>7 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option><option value={20}>20 seconds</option></select></label>
        </div>
        <div className="pos-display-settings-footer"><small>These settings apply to the selected branch&apos;s paired display.</small><button type="submit" className="pos-save-button" disabled={!canWrite}>Save display preferences</button></div>
      </form>

      <section className="pos-display-promotions" aria-labelledby="display-promotions-title">
        {promotionsUnavailable ? <div className="pos-display-schema-note" role="status"><strong>Saved promotion cards are waiting for the database migration.</strong><span>Apply <code>0042_display_promotions.sql</code> before creating or editing branch cards. Display preferences can still be saved now.</span></div> : null}
        <div className="pos-display-promotions__heading">
          <div><p>Promotional cards</p><h3 id="display-promotions-title">Your shop&apos;s message between orders</h3><span>Use existing food imagery for now. Each card can be edited, reordered, or archived without changing the cashier flow.</span></div>
          <span className="pos-display-promotions__count">{initialPromotions.filter((promotion) => promotion.isActive).length} active</span>
        </div>
        <div className="pos-display-promotion-list">
          {initialPromotions.length ? initialPromotions.map((promotion) => <PromotionEditor key={promotion.id} promotion={promotion} storeId={storeId} canWrite={canWrite && !promotionsUnavailable} />) : <div className="pos-display-empty"><strong>No custom cards yet.</strong><span>The customer display will use the local Dumala preview cards until you add your first branch promotion.</span></div>}
        </div>

        <form action={createDisplayPromotion} className="pos-display-promotion-editor pos-display-promotion-editor--new">
          <input type="hidden" name="store_id" value={storeId} />
          <div className="pos-display-promotion-editor__header"><div><strong>Add a promotion</strong><small>Create a card for this branch&apos;s customer display.</small></div></div>
          <div className="pos-config-grid">
            <label className="pos-config-field"><span>Eyebrow</span><input name="eyebrow" maxLength={80} disabled={!canWrite || promotionsUnavailable} placeholder="Made for the table" /></label>
            <label className="pos-config-field"><span>Image asset</span><ImageOptions current={DISPLAY_IMAGE_OPTIONS[0].value} disabled={!canWrite || promotionsUnavailable} /></label>
            <label className="pos-config-field pos-config-field--full"><span>Headline</span><input name="title" maxLength={120} required disabled={!canWrite || promotionsUnavailable} placeholder="Bring home the good stuff." /></label>
            <label className="pos-config-field pos-config-field--full"><span>Supporting copy</span><textarea name="detail" maxLength={240} disabled={!canWrite || promotionsUnavailable} placeholder="Our lechon cuts are crisp, savory, and ready to share." /></label>
            <label className="pos-config-field"><span>Callout</span><input name="tagline" maxLength={120} disabled={!canWrite || promotionsUnavailable} placeholder="Ask our team for a pairing." /></label>
            <label className="pos-config-field"><span>Display order</span><input name="sort_order" type="number" inputMode="numeric" step="1" min="-1000" max="1000" defaultValue="0" disabled={!canWrite || promotionsUnavailable} /></label>
          </div>
          <label className="pos-checkbox pos-display-new-active"><input type="checkbox" name="is_active" defaultChecked disabled={!canWrite || promotionsUnavailable} /><span>Publish immediately on the paired display</span></label>
          <div className="pos-display-promotion-editor__footer"><span /><button type="submit" className="pos-outline-button" disabled={!canWrite || promotionsUnavailable}>Add promotion</button></div>
        </form>
      </section>
    </div>
  );
}
