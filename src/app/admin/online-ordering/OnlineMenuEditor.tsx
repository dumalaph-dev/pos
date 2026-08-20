"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { PosThemePicker } from "@/components/admin/PosThemePicker";
import { getPosTheme, type PosThemeId } from "@/lib/pos-theme";
import { getPublicMenuThemeVariables } from "@/lib/online-ordering-theme";
import { type OnlineOrderingCopy, type OnlineOrderingSettings } from "@/lib/online-ordering";
import { updateOnlineOrderingPresentation } from "./actions";
import { useFormStatus } from "react-dom";

type PreviewProduct = { name: string; price: string; tone: string };

const PREVIEW_PRODUCTS: PreviewProduct[] = [
  { name: "House favorite", price: "₱190", tone: "linear-gradient(145deg, #d7b07a, #8a5b3d)" },
  { name: "Freshly brewed", price: "₱150", tone: "linear-gradient(145deg, #8a9f8d, #315947)" },
  { name: "Morning pastry", price: "₱135", tone: "linear-gradient(145deg, #e3b88a, #a65f46)" },
  { name: "Something cold", price: "₱170", tone: "linear-gradient(145deg, #9db8c2, #416a78)" },
];

export function OnlineMenuEditor({
  store,
  settings,
  canManage,
}: {
  store: { id: string; name: string; address: string | null };
  settings: OnlineOrderingSettings;
  canManage: boolean;
}) {
  const [theme, setTheme] = useState<PosThemeId>(settings.theme);
  const [copy, setCopy] = useState<OnlineOrderingCopy>(settings.copy);
  const initialValue = useMemo(() => JSON.stringify({ theme: settings.theme, copy: settings.copy }), [settings.copy, settings.theme]);
  const hasChanges = JSON.stringify({ theme, copy }) !== initialValue;

  function updateCopy(patch: Partial<OnlineOrderingCopy>) {
    setCopy((current) => ({ ...current, ...patch }));
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="public-menu-editor-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Public menu editor</p>
            <h2 id="public-menu-editor-heading" className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-ink">Make the customer view feel like your store.</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Edit the welcome copy and use the same interface themes as the POS. The phone preview updates instantly before you publish.</p>
          </div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold ${hasChanges ? "bg-accent/15 text-accent-hover" : "bg-success/10 text-success"}`} aria-live="polite"><i className={`h-1.5 w-1.5 rounded-full ${hasChanges ? "bg-accent" : "bg-success"}`} />{hasChanges ? "Unsaved changes" : "Published appearance"}</span>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="order-2 min-w-0 xl:order-1">
          <form action={updateOnlineOrderingPresentation} className="space-y-5">
            <input type="hidden" name="store_id" value={store.id} />
            <input type="hidden" name="theme" value={theme} />

            <fieldset disabled={!canManage} className="min-w-0">
              <legend className="text-sm font-extrabold text-ink">Theme</legend>
              <p className="mt-1 text-xs leading-5 text-ink-muted">These are the live POS interface themes, adapted to the customer ordering surface.</p>
              <div className="mt-3">
                <PosThemePicker value={theme} onChange={setTheme} ariaLabel="Public menu theme" />
              </div>
            </fieldset>

            <fieldset disabled={!canManage} className="min-w-0 rounded-2xl border border-line bg-raised p-4">
              <legend className="px-1 text-sm font-extrabold text-ink">Customer-facing copy</legend>
              <p className="mt-1 text-xs leading-5 text-ink-muted">Keep the words short enough to scan comfortably on a phone.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <EditorField label="Header tagline" name="header_tagline" value={copy.headerTagline} onChange={(value) => updateCopy({ headerTagline: value })} maxLength={80} />
                <EditorField label="Hero eyebrow" name="hero_eyebrow" value={copy.heroEyebrow} onChange={(value) => updateCopy({ heroEyebrow: value })} maxLength={80} />
                <EditorField label="Hero title" name="hero_title" value={copy.heroTitle} onChange={(value) => updateCopy({ heroTitle: value })} maxLength={80} />
                <EditorField label="Hero accent line" name="hero_accent" value={copy.heroAccent} onChange={(value) => updateCopy({ heroAccent: value })} maxLength={100} />
                <EditorField label="Pickup card title" name="pickup_title" value={copy.pickupTitle} onChange={(value) => updateCopy({ pickupTitle: value })} maxLength={80} />
                <EditorField label="Menu eyebrow" name="menu_eyebrow" value={copy.menuEyebrow} onChange={(value) => updateCopy({ menuEyebrow: value })} maxLength={80} />
                <EditorField label="Menu heading" name="menu_heading" value={copy.menuHeading} onChange={(value) => updateCopy({ menuHeading: value })} maxLength={100} />
                <EditorField label="Search placeholder" name="search_placeholder" value={copy.searchPlaceholder} onChange={(value) => updateCopy({ searchPlaceholder: value })} maxLength={60} />
              </div>
              <EditorTextarea label="Hero description" name="hero_description" value={copy.heroDescription} onChange={(value) => updateCopy({ heroDescription: value })} maxLength={240} />
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-[11px] leading-4 text-ink-muted"><AdminIcon name="eye" size={14} /><span>Changes publish to the QR menu after saving.</span></p>
              <PresentationSaveButton disabled={!canManage || !hasChanges} />
            </div>
          </form>
        </div>

        <aside className="order-1 min-w-0 xl:order-2" aria-label="Public menu mobile preview">
          <div className="sticky top-4 rounded-2xl border border-line bg-panel p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">Live preview</p><p className="mt-0.5 text-sm font-extrabold text-ink">Customer mobile view</p></div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-[9px] font-extrabold text-primary"><i className="h-1.5 w-1.5 rounded-full bg-success" />Phone</span>
            </div>
            <PublicMenuPreview store={store} settings={settings} theme={theme} copy={copy} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function EditorField({ label, name, value, onChange, maxLength }: { label: string; name: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return <label className="block text-[10px] font-extrabold uppercase tracking-[0.11em] text-ink-muted" htmlFor={`online-${name}`}>{label}<input id={`online-${name}`} name={name} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className="mt-1.5 block h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>;
}

function EditorTextarea({ label, name, value, onChange, maxLength }: { label: string; name: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return <label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.11em] text-ink-muted" htmlFor={`online-${name}`}>{label}<textarea id={`online-${name}`} name={name} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1.5 block min-h-24 w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>;
}

function PresentationSaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Publishing…" : "Publish menu appearance"}<AdminIcon name={pending ? "refresh" : "check"} size={14} /></button>;
}

function PublicMenuPreview({ store, settings, theme, copy }: { store: { name: string; address: string | null }; settings: OnlineOrderingSettings; theme: PosThemeId; copy: OnlineOrderingCopy }) {
  const themeDefinition = getPosTheme(theme);
  const themeStyle = getPublicMenuThemeVariables(theme) as CSSProperties;
  const previewFont = themeDefinition.variables["--pos-theme-font"];
  const previewProducts = PREVIEW_PRODUCTS.slice(0, 4);

  return (
    <div className="mx-auto max-w-[340px] overflow-hidden rounded-[26px] border-[7px] border-ink/80 bg-black shadow-[var(--shadow-pop)]" style={{ fontFamily: previewFont }}>
      <div className="max-h-[620px] overflow-y-auto" style={themeStyle}>
        <div className="min-h-[620px]" style={{ background: "var(--public-menu-bg)", color: "var(--public-menu-text)", backgroundImage: "var(--public-menu-pattern)" }}>
          <div className="sticky top-0 z-10 border-b px-3 py-2.5 backdrop-blur" style={{ borderColor: "var(--public-menu-border)", background: "color-mix(in srgb, var(--public-menu-surface) 94%, transparent)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-black" style={{ background: "var(--public-menu-primary)", color: "var(--public-menu-primary-text)" }}>{store.name.charAt(0).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-[11px]">{store.name}</strong><small className="block truncate text-[8px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--public-menu-subtle)" }}>{copy.headerTagline}</small></span></div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-extrabold" style={{ background: "var(--public-menu-primary-soft)", color: "var(--public-menu-primary)" }}><i className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--public-menu-success)" }} />Open</span>
            </div>
          </div>

          <div className="relative overflow-hidden border-b px-3 py-5" style={{ borderColor: "var(--public-menu-border)", background: "var(--public-menu-panel-gradient)" }}>
            <span className="inline-flex rounded-full px-2.5 py-1 text-[8px] font-extrabold uppercase tracking-[0.12em]" style={{ background: "var(--public-menu-primary)", color: "var(--public-menu-primary-text)" }}>{copy.heroEyebrow}</span>
            <h3 className="mt-3 text-[1.55rem] font-black leading-[0.98] tracking-[-0.06em]">{copy.heroTitle}<br /><span style={{ color: "var(--public-menu-accent)" }}>{copy.heroAccent}</span></h3>
            <p className="mt-3 text-[10px] leading-4" style={{ color: "var(--public-menu-muted)" }}>{copy.heroDescription}</p>
            <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: "var(--public-menu-border-strong)", background: "color-mix(in srgb, var(--public-menu-raised) 82%, transparent)" }}><p className="text-[8px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--public-menu-accent)" }}>{copy.pickupTitle}</p><strong className="mt-1 block text-[11px]">{store.address || "Pickup at the counter"}</strong><span className="mt-1 block text-[9px] leading-3.5" style={{ color: "var(--public-menu-muted)" }}>{settings.pickupNote}</span></div>
          </div>

          <div className="px-3 py-4">
            <p className="text-[8px] font-extrabold uppercase tracking-[0.13em]" style={{ color: "var(--public-menu-accent)" }}>{copy.menuEyebrow}</p>
            <h4 className="mt-1 text-lg font-black tracking-[-0.04em]">{copy.menuHeading}</h4>
            <div className="mt-3 flex h-9 items-center rounded-xl border px-3 text-[10px]" style={{ borderColor: "var(--public-menu-border-strong)", background: "var(--public-menu-raised)", color: "var(--public-menu-subtle)" }}><AdminIcon name="search" size={12} /> <span className="ml-1.5">{copy.searchPlaceholder}</span></div>
            <div className="mt-3 flex gap-1.5 overflow-hidden"><span className="rounded-full px-3 py-1.5 text-[9px] font-extrabold" style={{ background: "var(--public-menu-primary)", color: "var(--public-menu-primary-text)" }}>All items</span><span className="rounded-full px-3 py-1.5 text-[9px] font-extrabold" style={{ background: "var(--public-menu-raised)", color: "var(--public-menu-muted)" }}>Coffee</span><span className="rounded-full px-3 py-1.5 text-[9px] font-extrabold" style={{ background: "var(--public-menu-raised)", color: "var(--public-menu-muted)" }}>Pastries</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {previewProducts.map((product) => <div key={product.name} className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--public-menu-border)", background: "var(--public-menu-card-gradient)", boxShadow: "var(--public-menu-shadow-card)" }}><div className="aspect-square" style={{ background: product.tone }} /><div className="p-2"><strong className="block truncate text-[10px]">{product.name}</strong><span className="mt-1 block text-[9px] font-bold" style={{ color: "var(--public-menu-accent)" }}>{product.price}</span></div></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
