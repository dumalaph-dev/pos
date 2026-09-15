"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  ONLINE_ORDERING_WEEKDAYS,
  ONLINE_ORDERING_WEEKDAY_LABELS,
  type OnlineOrderingSettings,
  type OnlineOrderingWeekday,
} from "@/lib/online-ordering";
import { updateOnlineOrderingSettings } from "./actions";

export function OnlineFulfillmentSettings({
  storeId,
  settings,
  enabled,
  onEnabledChange,
  deliveryEnabled,
  onDeliveryEnabledChange,
}: {
  storeId: string;
  settings: OnlineOrderingSettings;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  deliveryEnabled: boolean;
  onDeliveryEnabledChange: (value: boolean) => void;
}) {
  const [closedDays, setClosedDays] = useState<Record<OnlineOrderingWeekday, boolean>>(() => Object.fromEntries(
    ONLINE_ORDERING_WEEKDAYS.map((day) => [day, !settings.schedule.businessHours[day].enabled]),
  ) as Record<OnlineOrderingWeekday, boolean>);

  function setDayClosed(day: OnlineOrderingWeekday, closed: boolean) {
    setClosedDays((current) => ({ ...current, [day]: closed }));
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="fulfillment-settings-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Fulfillment settings</p>
            <h2 id="fulfillment-settings-heading" className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-ink">Set promises your team can keep.</h2>
            <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Choose when customers can order, how much notice the team needs, and which fulfillment methods appear at checkout.</p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="clock" size={17} /></span>
        </div>
      </div>

      <form action={updateOnlineOrderingSettings} className="p-5 sm:p-6">
        <input type="hidden" name="store_id" value={storeId} />
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-raised px-3.5 py-3">
          <span><strong className="block text-sm font-extrabold text-ink">Accept online orders</strong><small className="mt-0.5 block text-xs text-ink-muted">Customers can place pickup or delivery orders now</small></span>
          <span className="relative inline-flex shrink-0">
            <input type="checkbox" name="enabled" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} className="peer sr-only" />
            <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
            <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
          </span>
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SettingField label="Average prep time" name="average_prep_minutes" defaultValue={settings.averagePrepMinutes} suffix="min" min={5} max={180} />
          <SettingField label="Lead time" name="order_lead_minutes" defaultValue={settings.orderLeadMinutes} suffix="min" min={0} max={180} />
          <SettingField label="Minimum order" name="minimum_order_amount" defaultValue={settings.minimumOrderCentavos / 100} suffix="₱" min={0} max={1000000} step={0.01} />
          <SettingField label="Max quantity per item" name="max_item_quantity" defaultValue={settings.maxItemQuantity} suffix="items" min={1} max={100} />
        </div>

        <label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor="pickup-note">Pickup note
          <textarea id="pickup-note" name="pickup_note" defaultValue={settings.pickupNote} rows={3} maxLength={240} className="mt-1.5 block w-full resize-y rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
        </label>

        <div className="mt-4 rounded-2xl border border-line bg-raised p-3.5">
          <label className="flex items-center justify-between gap-4">
            <span><strong className="block text-sm font-extrabold text-ink">Offer delivery</strong><small className="mt-0.5 block text-xs text-ink-muted">Add a delivery choice to the customer checkout</small></span>
            <span className="relative inline-flex shrink-0">
              <input type="checkbox" name="delivery_enabled" checked={deliveryEnabled} onChange={(event) => onDeliveryEnabledChange(event.target.checked)} className="peer sr-only" />
              <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
              <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
            </span>
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SettingField label="Delivery fee" name="delivery_fee" defaultValue={settings.delivery.feeCentavos / 100} suffix="₱" min={0} max={10000} step={0.01} />
            <SettingField label="Delivery ETA buffer" name="delivery_eta_minutes" defaultValue={settings.delivery.etaMinutes} suffix="min" min={15} max={180} />
          </div>
          <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor="delivery-note">Delivery note
            <textarea id="delivery-note" name="delivery_note" defaultValue={settings.delivery.note} rows={2} maxLength={240} className="mt-1.5 block w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor="delivery-service-area">Delivery service area <span className="font-semibold normal-case tracking-normal text-ink-subtle">(comma-separated places)</span>
            <textarea id="delivery-service-area" name="delivery_service_area" defaultValue={settings.delivery.serviceArea} rows={2} maxLength={240} placeholder="Makati, Poblacion, Salcedo" className="mt-1.5 block w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <p className="mt-2 text-[11px] leading-4 text-ink-muted">Delivery uses pay-on-delivery for now. Online payments can be added later.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-raised p-3.5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Business hours</p><p className="mt-1 text-xs leading-5 text-ink-muted">Closed days are removed from the customer&apos;s pickup and delivery date choices. Save each day&apos;s own opening window.</p></div><AdminIcon name="calendar" size={17} /></div>
          <div className="mt-3 grid gap-2">
            {ONLINE_ORDERING_WEEKDAYS.map((day) => (
              <BusinessHoursRow
                key={day}
                day={day}
                closed={closedDays[day]}
                openingTime={settings.schedule.businessHours[day].openingTime}
                closingTime={settings.schedule.businessHours[day].closingTime}
                onClosedChange={(closed) => setDayClosed(day, closed)}
              />
            ))}
          </div>
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <SettingField label="Slot interval" name="slot_interval_minutes" defaultValue={settings.schedule.slotIntervalMinutes} suffix="min" min={5} max={120} />
            <SettingField label="Days ahead" name="max_days_ahead" defaultValue={settings.schedule.maxDaysAhead} suffix="days" min={0} max={14} />
          </div>
        </div>

        <label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor="cancellation-policy">Cancellation policy
          <textarea id="cancellation-policy" name="cancellation_policy" defaultValue={settings.cancellationPolicy} rows={3} maxLength={360} className="mt-1.5 block w-full resize-y rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="max-w-[28ch] text-[11px] leading-4 text-ink-muted">ETAs use active orders, prep time, and the delivery buffer when applicable.</p>
          <SettingsSaveButton />
        </div>
      </form>
    </section>
  );
}

function BusinessHoursRow({ day, closed, openingTime, closingTime, onClosedChange }: { day: OnlineOrderingWeekday; closed: boolean; openingTime: string; closingTime: string; onClosedChange: (closed: boolean) => void }) {
  const openingFieldName = `business_hours_${day}_opening_time`;
  const closingFieldName = `business_hours_${day}_closing_time`;
  return (
    <div className={`rounded-xl border px-3 py-3 transition ${closed ? "border-line bg-surface/60" : "border-line-strong bg-surface"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs font-extrabold text-ink">{ONLINE_ORDERING_WEEKDAY_LABELS[day]}</strong>
        <label className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
          <input type="checkbox" name={`business_hours_${day}_closed`} checked={closed} onChange={(event) => onClosedChange(event.target.checked)} className="h-4 w-4 accent-primary" />
          Closed
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <TimeField label="Opens" name={openingFieldName} defaultValue={openingTime} disabled={closed} />
        <TimeField label="Closes" name={closingFieldName} defaultValue={closingTime} disabled={closed} />
      </div>
      {closed && <p className="mt-2 text-[10px] leading-4 text-ink-subtle">Customers cannot choose this day until it is reopened.</p>}
    </div>
  );
}

function SettingField({ label, name, defaultValue, suffix, min, max, step = 1 }: { label: string; name: string; defaultValue: number; suffix: string; min: number; max: number; step?: number }) {
  return <label className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor={name}>{label}<span className="relative mt-1.5 block"><input id={name} name={name} type="number" defaultValue={defaultValue} min={min} max={max} step={step} required className="block w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 pr-12 text-sm font-extrabold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /><span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[10px] font-bold normal-case tracking-normal text-ink-muted">{suffix}</span></span></label>;
}

function TimeField({ label, name, defaultValue, disabled = false }: { label: string; name: string; defaultValue: string; disabled?: boolean }) {
  return <label className={`block text-[9px] font-extrabold uppercase tracking-[0.1em] text-ink-muted ${disabled ? "opacity-45" : ""}`} htmlFor={name}>{label}<input id={name} name={name} type="time" defaultValue={defaultValue} required={!disabled} disabled={disabled} className="mt-1 block w-full rounded-lg border border-line-strong bg-raised px-2.5 py-2 text-sm font-extrabold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed" /></label>;
}

function SettingsSaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save settings"}<AdminIcon name="check" size={14} /></button>;
}
