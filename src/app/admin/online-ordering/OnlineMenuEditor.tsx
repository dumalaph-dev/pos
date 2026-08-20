"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { PosThemePicker } from "@/components/admin/PosThemePicker";
import { getPosTheme, type PosThemeId } from "@/lib/pos-theme";
import { formatPeso } from "@/lib/money";
import { getPublicMenuThemeVariables } from "@/lib/online-ordering-theme";
import { isOnlineOrderingHexColor, resolveOnlineOrderingBranding, type OnlineOrderingBrandDefaults, type OnlineOrderingBranding, type OnlineOrderingCopy, type OnlineOrderingSettings } from "@/lib/online-ordering";
import { updateOnlineOrderingPresentation } from "./actions";
import { useFormStatus } from "react-dom";

type PreviewProduct = { name: string; price: string; tone: string };

const PREVIEW_PRODUCTS: PreviewProduct[] = [
  { name: "House favorite", price: "₱190", tone: "linear-gradient(145deg, #d7b07a, #8a5b3d)" },
  { name: "Freshly brewed", price: "₱150", tone: "linear-gradient(145deg, #8a9f8d, #315947)" },
  { name: "Morning pastry", price: "₱135", tone: "linear-gradient(145deg, #e3b88a, #a65f46)" },
  { name: "Something cold", price: "₱170", tone: "linear-gradient(145deg, #9db8c2, #416a78)" },
];

const BRAND_PALETTE_PRESETS = [
  { id: "forest-gold", label: "Forest & gold", primary: "#173a2b", accent: "#e4b34f" },
  { id: "cocoa-cream", label: "Cocoa & cream", primary: "#5c321f", accent: "#d28b4c" },
  { id: "ocean-coral", label: "Ocean & coral", primary: "#145467", accent: "#f07d68" },
  { id: "plum-peach", label: "Plum & peach", primary: "#542d50", accent: "#e89b88" },
] as const;

export function OnlineMenuEditor({
  store,
  settings,
  onlineBrandDefaults,
  canManage,
  canUploadLogo,
}: {
  store: { id: string; name: string; address: string | null };
  settings: OnlineOrderingSettings;
  onlineBrandDefaults: OnlineOrderingBrandDefaults;
  canManage: boolean;
  canUploadLogo: boolean;
}) {
  const [theme, setTheme] = useState<PosThemeId>(settings.theme);
  const [copy, setCopy] = useState<OnlineOrderingCopy>(settings.copy);
  const initialBranding = useMemo(() => resolveOnlineOrderingBranding(settings.branding, onlineBrandDefaults), [onlineBrandDefaults, settings.branding]);
  const [branding, setBranding] = useState<OnlineOrderingBranding>(initialBranding);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const initialValue = useMemo(() => JSON.stringify({ theme: settings.theme, copy: settings.copy, branding: initialBranding }), [initialBranding, settings.copy, settings.theme]);
  const hasChanges = logoFile !== null || JSON.stringify({ theme, copy, branding }) !== initialValue;
  const selectedTheme = getPosTheme(theme);
  const previewBranding = logoPreviewUrl ? { ...branding, logoUrl: logoPreviewUrl } : branding;

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  function updateCopy(patch: Partial<OnlineOrderingCopy>) {
    setCopy((current) => ({ ...current, ...patch }));
  }

  function updateBranding(patch: Partial<OnlineOrderingBranding>) {
    setBranding((current) => ({ ...current, ...patch }));
  }

  function toggleOrganizationBranding(useOrganizationBranding: boolean) {
    if (useOrganizationBranding) {
      handleLogoChange(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
    updateBranding({
      useOrganizationBranding,
      ...(useOrganizationBranding ? {
        brandName: onlineBrandDefaults.brandName ?? branding.brandName,
        brandTagline: onlineBrandDefaults.brandTagline ?? branding.brandTagline,
        logoUrl: onlineBrandDefaults.logoUrl !== undefined ? onlineBrandDefaults.logoUrl : branding.logoUrl,
      } : {}),
    });
  }

  function handleLogoChange(file: File | null) {
    setLogoFile(file);
    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
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
          <form action={updateOnlineOrderingPresentation} encType="multipart/form-data" className="space-y-5">
            <input type="hidden" name="store_id" value={store.id} />
            <input type="hidden" name="theme" value={theme} />
            <input type="hidden" name="brand_logo_url" value={branding.logoUrl ?? ""} />
            {branding.colorMode !== "brand" && <><input type="hidden" name="primary_color" value={branding.primaryColor} /><input type="hidden" name="accent_color" value={branding.accentColor} /></>}

            <fieldset disabled={!canManage} className="min-w-0">
              <legend className="text-sm font-extrabold text-ink">Store branding</legend>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">Give the public menu a recognizable storefront identity. It starts with your organization brand, then you can switch this branch to its own logo, name, and palette.</p>

              <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-line bg-raised px-3.5 py-3">
                <span><strong className="block text-sm font-extrabold text-ink">Use organization branding</strong><small className="mt-0.5 block text-xs text-ink-muted">Keep this menu aligned with the branding in Admin Settings</small></span>
                <span className="relative inline-flex shrink-0">
                  <input type="checkbox" name="use_organization_branding" checked={branding.useOrganizationBranding} onChange={(event) => toggleOrganizationBranding(event.target.checked)} className="peer sr-only" />
                  <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
                  <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                </span>
              </label>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                <div className="rounded-2xl border border-line bg-raised p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line-strong bg-surface text-lg font-black text-primary" style={logoPreviewUrl || branding.logoUrl ? { backgroundImage: `url(${JSON.stringify(logoPreviewUrl || branding.logoUrl)})`, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" } : undefined}>
                      {!logoPreviewUrl && !branding.logoUrl && (branding.brandName || store.name).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Menu logo</p>
                      <p className="mt-1 truncate text-sm font-extrabold text-ink">{logoFile ? logoFile.name : branding.logoUrl ? "Logo connected" : "Use a clear mark"}</p>
                      <p className="mt-1 text-[11px] leading-4 text-ink-muted">{branding.useOrganizationBranding ? "Turn off organization branding to add a branch logo" : canUploadLogo ? "Transparent PNG, JPG, or WebP · up to 900 KB" : "Ask an organization admin to upload a logo"}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <label className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-primary-soft ${branding.useOrganizationBranding || !canManage || !canUploadLogo ? "pointer-events-none opacity-45" : ""}`}>
                          {logoFile || branding.logoUrl ? "Replace logo" : "Upload logo"}
                          <input ref={logoInputRef} type="file" name="brand_logo_file" accept="image/jpeg,image/png,image/webp" disabled={branding.useOrganizationBranding || !canManage || !canUploadLogo} onChange={(event) => handleLogoChange(event.target.files?.[0] ?? null)} className="sr-only" />
                        </label>
                        {!branding.useOrganizationBranding && (logoFile || branding.logoUrl) && <button type="button" onClick={() => { handleLogoChange(null); updateBranding({ logoUrl: null }); if (logoInputRef.current) logoInputRef.current.value = ""; }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-wide text-danger transition hover:bg-danger-soft">Remove</button>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-line bg-raised p-3.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Color direction</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">Keep the POS theme or bring your own primary and accent colors.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className={`cursor-pointer rounded-xl border p-2.5 transition ${branding.colorMode === "theme" ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong"}`}>
                      <input type="radio" name="color_mode" value="theme" checked={branding.colorMode === "theme"} onChange={() => updateBranding({ colorMode: "theme" })} className="sr-only" />
                      <strong className="block text-[11px] font-extrabold text-ink">Use POS theme</strong>
                      <small className="mt-0.5 block text-[10px] leading-4 text-ink-muted">Same visual system</small>
                    </label>
                    <label className={`cursor-pointer rounded-xl border p-2.5 transition ${branding.colorMode === "brand" ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong"}`}>
                      <input type="radio" name="color_mode" value="brand" checked={branding.colorMode === "brand"} onChange={() => updateBranding({ colorMode: "brand" })} className="sr-only" />
                      <strong className="block text-[11px] font-extrabold text-ink">Use brand colors</strong>
                      <small className="mt-0.5 block text-[10px] leading-4 text-ink-muted">Your own palette</small>
                    </label>
                  </div>
                  {branding.colorMode === "brand" && <BrandPaletteControls branding={branding} onChange={updateBranding} />}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <EditorField label="Menu brand name" name="brand_name" value={branding.brandName || store.name} onChange={(value) => updateBranding({ brandName: value })} maxLength={80} readOnly={branding.useOrganizationBranding} />
                <EditorField label="Menu brand tagline" name="brand_tagline" value={branding.brandTagline} onChange={(value) => updateBranding({ brandTagline: value })} maxLength={80} readOnly={branding.useOrganizationBranding} />
              </div>
            </fieldset>

            <fieldset disabled={!canManage} className="min-w-0">
              <legend className="text-sm font-extrabold text-ink">Theme</legend>
              <div className="mt-1 flex items-start justify-between gap-3">
                <p className="max-w-xl text-xs leading-5 text-ink-muted">These are the live POS interface themes, adapted to the customer ordering surface.</p>
                <span className="hidden shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold text-primary sm:inline-flex">{selectedTheme.label}</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-line bg-raised px-3 py-2.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">POS theme collection</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-ink-subtle"><AdminIcon name="chevron" size={12} /> Scroll to browse</span>
                </div>
                <div className="online-menu__theme-scroll p-2 sm:p-3">
                  <PosThemePicker value={theme} onChange={setTheme} ariaLabel="Public menu theme" />
                </div>
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
            <PublicMenuPreview store={store} settings={settings} branding={previewBranding} theme={theme} copy={copy} />
          </div>
        </aside>
      </div>
    </section>
  );
}

function EditorField({ label, name, value, onChange, maxLength, readOnly = false }: { label: string; name: string; value: string; onChange: (value: string) => void; maxLength: number; readOnly?: boolean }) {
  return <label className="block text-[10px] font-extrabold uppercase tracking-[0.11em] text-ink-muted" htmlFor={`online-${name}`}>{label}<input id={`online-${name}`} name={name} value={value} maxLength={maxLength} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} className={`mt-1.5 block h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10 ${readOnly ? "cursor-default opacity-70" : ""}`} /></label>;
}

function EditorTextarea({ label, name, value, onChange, maxLength }: { label: string; name: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return <label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.11em] text-ink-muted" htmlFor={`online-${name}`}>{label}<textarea id={`online-${name}`} name={name} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1.5 block min-h-24 w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>;
}

function BrandPaletteControls({ branding, onChange }: { branding: OnlineOrderingBranding; onChange: (patch: Partial<OnlineOrderingBranding>) => void }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-ink-muted">Brand palette</p>
        <span className="text-[10px] font-semibold text-ink-subtle">Pick a starting point</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {BRAND_PALETTE_PRESETS.map((preset) => {
          const selected = branding.primaryColor === preset.primary && branding.accentColor === preset.accent;
          return <button key={preset.id} type="button" aria-pressed={selected} onClick={() => onChange({ primaryColor: preset.primary, accentColor: preset.accent })} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition ${selected ? "border-primary bg-primary-soft text-primary" : "border-line-strong text-ink-muted hover:bg-raised hover:text-primary"}`}><span className="flex -space-x-1"><i className="h-3 w-3 rounded-full border border-white" style={{ background: preset.primary }} /><i className="h-3 w-3 rounded-full border border-white" style={{ background: preset.accent }} /></span>{preset.label}</button>;
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <BrandColorField label="Primary" name="primary_color" value={branding.primaryColor} onChange={(value) => onChange({ primaryColor: value })} />
        <BrandColorField label="Accent" name="accent_color" value={branding.accentColor} onChange={(value) => onChange({ accentColor: value })} />
      </div>
    </div>
  );
}

function BrandColorField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (value: string) => void }) {
  const safeValue = isOnlineOrderingHexColor(value) ? value : "#173a2b";
  return <label className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-muted" htmlFor={`online-${name}`}><span>{label}</span><span className="flex items-center gap-2"><code className="text-[9px] font-bold normal-case tracking-normal text-ink-subtle">{safeValue.toUpperCase()}</code><input id={`online-${name}`} name={name} type="color" value={safeValue} onChange={(event) => onChange(event.target.value)} className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0" /></span></label>;
}

function PresentationSaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Publishing…" : "Publish menu appearance"}<AdminIcon name={pending ? "refresh" : "check"} size={14} /></button>;
}

function PublicMenuPreview({ store, settings, branding, theme, copy }: { store: { name: string; address: string | null }; settings: OnlineOrderingSettings; branding: OnlineOrderingBranding; theme: PosThemeId; copy: OnlineOrderingCopy }) {
  const themeDefinition = getPosTheme(theme);
  const themeStyle = getPublicMenuThemeVariables(theme, branding) as CSSProperties;
  const previewFont = themeDefinition.variables["--pos-theme-font"];
  const previewProducts = PREVIEW_PRODUCTS.slice(0, 4);
  const brandName = branding.brandName || store.name;

  return (
    <div className="relative isolate mx-auto w-full max-w-[340px] rounded-[34px] bg-[#10261f] p-[7px] shadow-[var(--shadow-pop)] ring-1 ring-black/10" style={{ fontFamily: previewFont }}>
      <div className="relative z-0 overflow-hidden rounded-[26px]" style={{ ...themeStyle, clipPath: "inset(0 round 26px)" }}>
        <div className="public-menu__scrollbar-hidden max-h-[620px] overflow-y-auto overscroll-contain">
          <div className="min-h-[620px]" style={{ background: "var(--public-menu-bg)", color: "var(--public-menu-text)", backgroundImage: "var(--public-menu-pattern)" }}>
          <div className="sticky top-0 z-10 border-b px-3 py-2.5 backdrop-blur" style={{ borderColor: "var(--public-menu-border)", background: "color-mix(in srgb, var(--public-menu-surface) 94%, transparent)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl text-xs font-black" style={branding.logoUrl ? { backgroundColor: "var(--public-menu-primary-soft)", backgroundImage: `url(${JSON.stringify(branding.logoUrl)})`, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" } : { background: "var(--public-menu-primary)", color: "var(--public-menu-primary-text)" }}>{!branding.logoUrl && brandName.charAt(0).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-[11px]">{brandName}</strong><small className="block truncate text-[8px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--public-menu-subtle)" }}>{branding.brandTagline || copy.headerTagline}</small></span></div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[8px] font-extrabold" style={{ background: "var(--public-menu-primary-soft)", color: "var(--public-menu-primary-soft-text)" }}><i className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--public-menu-success)" }} />Open</span>
            </div>
          </div>

          <div className="relative overflow-hidden border-b px-3 py-5" style={{ borderColor: "var(--public-menu-border)", background: "var(--public-menu-panel-gradient)" }}>
            <span className="inline-flex rounded-full px-2.5 py-1 text-[8px] font-extrabold uppercase tracking-[0.12em]" style={{ background: "var(--public-menu-primary)", color: "var(--public-menu-primary-text)" }}>{copy.heroEyebrow}</span>
            <h3 className="mt-3 text-[1.55rem] font-black leading-[0.98] tracking-[-0.06em]" style={{ color: "var(--public-menu-heading)" }}>{copy.heroTitle}<br /><span style={{ color: "var(--public-menu-accent-ink)" }}>{copy.heroAccent}</span></h3>
            <p className="mt-3 text-[10px] leading-4" style={{ color: "var(--public-menu-muted)" }}>{copy.heroDescription}</p>
            <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: "var(--public-menu-border-strong)", background: "color-mix(in srgb, var(--public-menu-raised) 82%, transparent)" }}><p className="text-[8px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--public-menu-accent-ink)" }}>{copy.pickupTitle}</p><strong className="mt-1 block text-[11px]" style={{ color: "var(--public-menu-heading)" }}>{store.address || "Pickup at the counter"}</strong><span className="mt-1 block text-[9px] leading-3.5" style={{ color: "var(--public-menu-muted)" }}>{settings.pickupNote}</span>{settings.delivery.enabled && <span className="mt-2 block text-[8px] font-bold" style={{ color: "var(--public-menu-heading)" }}>Delivery · {formatPeso(settings.delivery.feeCentavos)} fee</span>}</div>
          </div>

          <div className="mx-3 mt-3 flex items-start gap-2 rounded-2xl border px-2.5 py-2" style={{ borderColor: "var(--public-menu-danger-soft)", background: "var(--public-menu-danger-soft)", color: "var(--public-menu-danger-text)" }}><AdminIcon name="lock" size={11} /><span className="text-[8px] leading-3.5"><strong className="font-extrabold">Order carefully.</strong> Use accurate details and place only genuine orders.</span></div>

          <div className="px-3 py-4">
            <p className="text-[8px] font-extrabold uppercase tracking-[0.13em]" style={{ color: "var(--public-menu-accent-ink)" }}>{copy.menuEyebrow}</p>
            <h4 className="mt-1 text-lg font-black tracking-[-0.04em]" style={{ color: "var(--public-menu-heading)" }}>{copy.menuHeading}</h4>
            <div className="mt-3 flex h-9 items-center rounded-xl border px-3 text-[10px]" style={{ borderColor: "var(--public-menu-border-strong)", background: "var(--public-menu-raised)", color: "var(--public-menu-subtle)" }}><AdminIcon name="search" size={12} /> <span className="ml-1.5">{copy.searchPlaceholder}</span></div>
            <div className="mt-3 flex gap-1.5 overflow-hidden"><span className="rounded-full px-3 py-1.5 text-[9px] font-extrabold" style={{ background: "var(--public-menu-primary)", color: "var(--public-menu-primary-text)" }}>All items</span><span className="rounded-full px-3 py-1.5 text-[9px] font-extrabold" style={{ background: "var(--public-menu-raised)", color: "var(--public-menu-muted)" }}>Coffee</span><span className="rounded-full px-3 py-1.5 text-[9px] font-extrabold" style={{ background: "var(--public-menu-raised)", color: "var(--public-menu-muted)" }}>Pastries</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {previewProducts.map((product) => <div key={product.name} className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--public-menu-border)", background: "var(--public-menu-card-gradient)", boxShadow: "var(--public-menu-shadow-card)" }}><div className="aspect-square" style={{ background: product.tone }} /><div className="p-2"><strong className="block truncate text-[10px]" style={{ color: "var(--public-menu-heading)" }}>{product.name}</strong><span className="mt-1 block text-[9px] font-bold" style={{ color: "var(--public-menu-accent-ink)" }}>{product.price}</span></div></div>)}
            </div>
          </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 z-20 rounded-[34px] border-[7px] border-[#10261f] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]" aria-hidden="true" />
    </div>
  );
}
