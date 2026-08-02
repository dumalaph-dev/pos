import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { createDeviceSettings, updateBranchSettings, updateDeviceSettings, updateOrganizationSettings } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";
type PrinterTransport = "network" | "bluetooth" | "usb";
type JsonRecord = Record<string, unknown>;

type CurrentProfile = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
};

type OrganizationRecord = {
  id: string;
  name: string;
  currency: string;
  settings: JsonRecord;
};

type BranchRecord = {
  id: string;
  name: string;
  address: string | null;
  tin: string | null;
  vat_registered: boolean;
  vat_rate: number;
  settings: JsonRecord;
  is_active: boolean;
};

type DeviceRecord = {
  id: string;
  store_id: string;
  name: string;
  device_prefix: string;
  printer_transport: PrinterTransport | null;
  printer_config: JsonRecord;
  is_active: boolean;
  last_seen_at: string | null;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function settingText(settings: JsonRecord, key: string) {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

function configText(config: JsonRecord, key: string, fallback = "") {
  const value = config[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function configPaperWidth(config: JsonRecord) {
  return configText(config, "paper_width", "58") === "80" ? "80" : "58";
}

function transportLabel(transport: PrinterTransport | null) {
  if (transport === "bluetooth") return "Bluetooth";
  if (transport === "usb") return "USB";
  return "Network";
}

function formatLastSeen(value: string | null) {
  if (!value) return "Never connected";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id")
    .eq("id", user.id)
    .single();
  const profile = profileData as CurrentProfile | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <SettingsProfileMissing />;

  const [organizationResult, branchesResult, devicesResult] = await Promise.all([
    supabase.from("organizations").select("id, name, currency, settings").eq("id", profile.org_id).single(),
    supabase.from("stores").select("id, name, address, tin, vat_registered, vat_rate, settings, is_active").eq("org_id", profile.org_id).order("name"),
    supabase.from("devices").select("id, store_id, name, device_prefix, printer_transport, printer_config, is_active, last_seen_at").eq("org_id", profile.org_id).order("name"),
  ]);

  const organization = organizationResult.data as OrganizationRecord | null;
  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const devices = (devicesResult.data ?? []) as DeviceRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const queryWarning = Boolean(organizationResult.error || branchesResult.error || devicesResult.error);
  const canWrite = profile.role === "admin";
  const currentBranchName = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const activeDevices = devices.filter((device) => device.is_active).length;
  const vatBranches = branches.filter((branch) => branch.vat_registered).length;
  const defaultDeviceBranch = profile.store_id ?? branches[0]?.id ?? "";
  const saved = readParam(params.saved);
  const savedMessage = saved === "organization" ? "Organization settings saved." : saved === "branch" ? "Branch receipt settings saved." : saved === "device" ? "Terminal settings saved." : "";

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="settings" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3"><Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="settings" size={20} /></Link><div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p><h1 className="truncate text-lg font-extrabold text-primary">Settings</h1></div></div>
            <div className="ml-auto flex items-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link><Link href="/pos" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Open POS</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Configuration &middot; {currentBranchName}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Make every receipt feel like your business.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">Manage organization identity, branch receipt details, and the terminals that connect your POS to printers, {firstName}.</p></div><span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span></div>

          {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
          {readParam(params.error) && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{readParam(params.error)}</div>}
          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some settings could not refresh. The page is showing the configuration that was available.</div>}
          {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This page is read-only for your role. Ask an organization admin to change configuration.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SettingsMetric label="Branches" value={String(branches.length)} detail="Organization locations" tone="bg-primary text-primary-fg" icon="inventory" /><SettingsMetric label="Terminals" value={String(devices.length)} detail="Registered POS devices" tone="bg-secondary text-primary" icon="pos" /><SettingsMetric label="Active terminals" value={String(activeDevices)} detail="Available to use" tone="bg-success text-white" icon="dashboard" /><SettingsMetric label="VAT branches" value={String(vatBranches)} detail="Receipt tax enabled" tone="bg-warning/15 text-warning" icon="reports" /></div>

          <nav aria-label="Settings sections" className="mt-6 flex flex-wrap gap-2"><a href="#organization" className="rounded-btn border border-line bg-surface px-3 py-2 text-xs font-extrabold text-primary transition hover:bg-primary-soft">Organization</a><a href="#branches" className="rounded-btn border border-line bg-surface px-3 py-2 text-xs font-extrabold text-primary transition hover:bg-primary-soft">Branches</a><a href="#devices" className="rounded-btn border border-line bg-surface px-3 py-2 text-xs font-extrabold text-primary transition hover:bg-primary-soft">Devices &amp; printers</a></nav>

          <section id="organization" aria-labelledby="organization-heading" className="admin-panel mt-4 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Organization</p><h2 id="organization-heading" className="admin-panel__title">Business identity</h2><p className="admin-panel__subtitle">Used as the account-level name across the backoffice.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{organization?.currency ?? "PHP"}</span></div><form action={updateOrganizationSettings} className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.4fr)_180px_auto] md:items-end"><SettingsField label="Organization name" htmlFor="organization-name"><input id="organization-name" name="name" defaultValue={organization?.name ?? DEFAULT_STORE_NAME} disabled={!canWrite} required maxLength={120} className="inventory-input" /></SettingsField><SettingsField label="Currency" htmlFor="organization-currency"><select id="organization-currency" name="currency" defaultValue={organization?.currency ?? "PHP"} disabled={!canWrite} className="inventory-input"><option value="PHP">PHP</option><option value="USD">USD</option><option value="SGD">SGD</option></select></SettingsField><button type="submit" disabled={!canWrite || !organization} className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save identity</button></form></section>

          <section id="branches" aria-labelledby="branches-heading" className="mt-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="admin-panel__eyebrow">Branch configuration</p><h2 id="branches-heading" className="admin-panel__title">Receipt and tax details</h2><p className="admin-panel__subtitle">These details are stored per branch and can be used by receipt output.</p></div></div>{branches.length === 0 ? <SettingsEmpty title="No branches found" detail="Create a branch before configuring receipts." /> : <div className="grid gap-4">{branches.map((branch) => <BranchSettingsForm key={branch.id} branch={branch} canWrite={canWrite} />)}</div>}</section>

          <section id="devices" aria-labelledby="devices-heading" className="mt-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="admin-panel__eyebrow">Device configuration</p><h2 id="devices-heading" className="admin-panel__title">POS terminals and printers</h2><p className="admin-panel__subtitle">Printer configuration is kept with each physical terminal. The POS also mirrors these values locally for offline use.</p></div></div><div className="grid gap-4 xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]"><CreateDeviceForm branches={branches} defaultBranch={defaultDeviceBranch} canWrite={canWrite} /><div className="grid gap-3">{devices.length === 0 ? <div className="admin-panel p-5"><SettingsEmpty title="No terminals registered" detail="Create the first terminal here or open POS on a branch tablet to register it." /></div> : devices.map((device) => <DeviceSettingsForm key={device.id} device={device} branches={branches} branchName={branchById.get(device.store_id)?.name ?? "Unknown branch"} canWrite={canWrite} />)}</div></div></section>
        </div>
      </div>
    </main>
  );
}

function BranchSettingsForm({ branch, canWrite }: { branch: BranchRecord; canWrite: boolean }) {
  return <form action={updateBranchSettings} className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Branch</p><h3 className="admin-panel__title">{branch.name}</h3><p className="admin-panel__subtitle">{branch.is_active ? "Active location" : "Inactive location"}</p></div><span className={`rounded-pill px-3 py-1.5 text-xs font-extrabold ${branch.vat_registered ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{branch.vat_registered ? "VAT registered" : "VAT not enabled"}</span></div><input type="hidden" name="store_id" value={branch.id} /><div className="mt-5 grid gap-4 md:grid-cols-2"><SettingsField label="Branch name" htmlFor={`branch-name-${branch.id}`}><input id={`branch-name-${branch.id}`} name="name" defaultValue={branch.name} disabled={!canWrite} required maxLength={120} className="inventory-input" /></SettingsField><SettingsField label="TIN" htmlFor={`branch-tin-${branch.id}`}><input id={`branch-tin-${branch.id}`} name="tin" defaultValue={branch.tin ?? ""} disabled={!canWrite} maxLength={80} placeholder="Optional tax ID" className="inventory-input" /></SettingsField><SettingsField label="Address" htmlFor={`branch-address-${branch.id}`}><input id={`branch-address-${branch.id}`} name="address" defaultValue={branch.address ?? ""} disabled={!canWrite} maxLength={240} placeholder="Branch address" className="inventory-input" /></SettingsField><SettingsField label="VAT rate (%)" htmlFor={`branch-vat-${branch.id}`}><input id={`branch-vat-${branch.id}`} name="vat_rate" type="number" inputMode="decimal" min="0" max="100" step="0.01" defaultValue={(Number(branch.vat_rate) * 100).toFixed(2)} disabled={!canWrite} className="inventory-input tnums" /></SettingsField></div><div className="mt-4 grid gap-4 md:grid-cols-2"><SettingsField label="Receipt header" htmlFor={`branch-header-${branch.id}`}><textarea id={`branch-header-${branch.id}`} name="receipt_header" defaultValue={settingText(branch.settings, "receipt_header")} disabled={!canWrite} maxLength={200} rows={3} placeholder="Optional line below the branch name" className="inventory-input min-h-20 resize-y" /></SettingsField><SettingsField label="Receipt footer" htmlFor={`branch-footer-${branch.id}`}><textarea id={`branch-footer-${branch.id}`} name="receipt_footer" defaultValue={settingText(branch.settings, "receipt_footer")} disabled={!canWrite} maxLength={200} rows={3} placeholder="Thank you message or return policy" className="inventory-input min-h-20 resize-y" /></SettingsField></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="vat_registered" defaultChecked={branch.vat_registered} disabled={!canWrite} className="h-4 w-4 accent-primary" /> Include VAT on receipts</label><button type="submit" disabled={!canWrite} className="min-h-10 rounded-btn bg-primary px-4 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save branch details</button></div></form>;
}

function CreateDeviceForm({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <form action={createDeviceSettings} className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">New terminal</p><h3 className="admin-panel__title">Register a POS device</h3><p className="admin-panel__subtitle">Give each counter a unique prefix for order numbers.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Admin only</span></div><div className="mt-5 grid gap-4"><SettingsField label="Branch" htmlFor="new-device-store"><select id="new-device-store" name="store_id" defaultValue={defaultBranch} disabled={!canWrite || branches.length === 0} required className="inventory-input"><option value="">Choose branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></SettingsField><div className="grid gap-3 sm:grid-cols-2"><SettingsField label="Terminal name" htmlFor="new-device-name"><input id="new-device-name" name="name" defaultValue="Counter 1" disabled={!canWrite} required maxLength={80} className="inventory-input" /></SettingsField><SettingsField label="Device prefix" htmlFor="new-device-prefix"><input id="new-device-prefix" name="device_prefix" defaultValue="T1" disabled={!canWrite} required maxLength={12} className="inventory-input" /></SettingsField></div><PrinterFields prefix="new-device" canWrite={canWrite} /><button type="submit" disabled={!canWrite || branches.length === 0} className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Register terminal</button></div></form>;
}

function DeviceSettingsForm({ device, branches, branchName, canWrite }: { device: DeviceRecord; branches: BranchRecord[]; branchName: string; canWrite: boolean }) {
  return <form action={updateDeviceSettings} className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Terminal &middot; {branchName}</p><h3 className="admin-panel__title">{device.name}</h3><p className="admin-panel__subtitle">{device.is_active ? "Active" : "Inactive"} &middot; {transportLabel(device.printer_transport)} printer &middot; Last seen {formatLastSeen(device.last_seen_at)}</p></div><span className={`rounded-pill px-3 py-1.5 text-xs font-extrabold ${device.is_active ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{device.is_active ? "Active" : "Disabled"}</span></div><input type="hidden" name="device_id" value={device.id} /><div className="mt-5 grid gap-4 sm:grid-cols-2"><SettingsField label="Branch" htmlFor={`device-store-${device.id}`}><select id={`device-store-${device.id}`} name="store_id" defaultValue={device.store_id} disabled={!canWrite} required className="inventory-input">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></SettingsField><SettingsField label="Terminal name" htmlFor={`device-name-${device.id}`}><input id={`device-name-${device.id}`} name="name" defaultValue={device.name} disabled={!canWrite} required maxLength={80} className="inventory-input" /></SettingsField><SettingsField label="Device prefix" htmlFor={`device-prefix-${device.id}`}><input id={`device-prefix-${device.id}`} name="device_prefix" defaultValue={device.device_prefix} disabled={!canWrite} required maxLength={12} className="inventory-input" /></SettingsField></div><div className="mt-4"><PrinterFields prefix={`device-${device.id}`} config={device.printer_config} transport={device.printer_transport ?? "network"} canWrite={canWrite} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="is_active" defaultChecked={device.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" /> Terminal active</label><button type="submit" disabled={!canWrite} className="min-h-10 rounded-btn bg-primary px-4 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save terminal settings</button></div></form>;
}

function PrinterFields({ prefix, config = {}, transport = "network", canWrite }: { prefix: string; config?: JsonRecord; transport?: PrinterTransport; canWrite: boolean }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SettingsField label="Printer transport" htmlFor={`${prefix}-transport`}>
          <select id={`${prefix}-transport`} name="printer_transport" defaultValue={transport} disabled={!canWrite} className="inventory-input">
            <option value="network">Network / bridge</option>
            <option value="bluetooth">Bluetooth</option>
            <option value="usb">USB</option>
          </select>
        </SettingsField>
        <SettingsField label="Paper width" htmlFor={`${prefix}-paper`}>
          <select id={`${prefix}-paper`} name="paper_width" defaultValue={configPaperWidth(config)} disabled={!canWrite} className="inventory-input">
            <option value="58">58mm</option>
            <option value="80">80mm</option>
          </select>
        </SettingsField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SettingsField label="Printer IP" htmlFor={`${prefix}-ip`}>
          <input id={`${prefix}-ip`} name="ip" defaultValue={configText(config, "ip")} disabled={!canWrite} placeholder="192.168.1.50" className="inventory-input" />
        </SettingsField>
        <SettingsField label="Printer port" htmlFor={`${prefix}-port`}>
          <input id={`${prefix}-port`} name="port" type="number" inputMode="numeric" min="1" max="65535" defaultValue={configText(config, "port", "9100")} disabled={!canWrite} className="inventory-input tnums" />
        </SettingsField>
      </div>
      <SettingsField label="Bridge host" htmlFor={`${prefix}-bridge`}>
        <input id={`${prefix}-bridge`} name="bridge_host" defaultValue={configText(config, "bridge_host", "127.0.0.1")} disabled={!canWrite} placeholder="127.0.0.1" className="inventory-input" />
      </SettingsField>
      <p className="text-[10px] leading-5 text-ink-muted">Network printers use the local WebSocket bridge on port 8787. Bluetooth and USB require browser support on the POS device.</p>
    </div>
  );
}

function SettingsMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "inventory" | "pos" | "dashboard" | "reports" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function SettingsField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function SettingsEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-9 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="settings" size={21} /></span><p className="mt-3 text-sm font-extrabold text-ink">{title}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}

function SettingsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton /></div></div></main>;
}
