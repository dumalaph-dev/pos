"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useFormStatus } from "react-dom";
import { createBranch, updateBranch } from "@/app/admin/branches/actions";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";

export type AdminBranchRecord = {
  id: string;
  name: string;
  address: string | null;
  tin: string | null;
  vat_registered: boolean;
  vat_rate: number;
  currency: string;
  is_active: boolean;
  created_at: string;
};
type DeviceRecord = { store_id: string; is_active: boolean };
type StaffRecord = { store_id: string | null; is_active: boolean };

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(date);
}

function vatPercent(value: number) {
  const percent = Number(value) * 100;
  return Number.isFinite(percent) ? percent.toFixed(2).replace(/\.00$/, "") : "12";
}

export function BranchesLocalWorkspace({
  branches,
  devices,
  staff,
  initialEditId,
  canWrite,
  notice,
}: {
  branches: AdminBranchRecord[];
  devices: DeviceRecord[];
  staff: StaffRecord[];
  initialEditId: string | null;
  canWrite: boolean;
  notice?: { kind: "success" | "error" | "warning"; message: string; action?: { href: string; label: string } };
}) {
  const activeBranches = branches.filter((branch) => branch.is_active);
  const activeDevices = devices.filter((device) => device.is_active).length;
  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);
  const assignedStaff = staff.filter((member) => member.store_id && branchById.has(member.store_id)).length;

  return (
    <UrlLocalDialogController
      className="branch-dialog-controller"
      records={branches}
      initialId={initialEditId}
      queryKey="edit"
      triggerSelector="[data-branch-trigger]"
      readTriggerId={(trigger) => trigger.dataset.branchTrigger ?? null}
      getRecordId={(branch) => branch.id}
      performanceSurface="branches"
      renderDialog={(branch, onClose) => (
        <AdminDialog
          key={branch.id}
          onClose={onClose}
          titleId={`branch-dialog-heading-${branch.id}`}
          descriptionId={`branch-dialog-description-${branch.id}`}
          bodyClassName="admin-dialog-open"
          backdropClassName="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
          dialogClassName="relative my-4 w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-pop)] sm:p-6"
        >
          <BranchEditorDialog branch={branch} canWrite={canWrite} onClose={onClose} />
        </AdminDialog>
      )}
    >
      <div className="admin-directory-workspace">
        {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3 text-sm font-semibold ${notice.kind === "success" ? "border-success/25 bg-success/10 text-success" : notice.kind === "error" ? "border-danger/25 bg-danger-soft text-danger" : "border-warning/30 bg-warning/10 text-ink"}`}><span>{notice.message}</span>{notice.action && <a href={notice.action.href} className="shrink-0 rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">{notice.action.label}</a>}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><BranchMetric label="Total branches" value={String(branches.length)} detail="In this organization" tone="bg-primary text-primary-fg" /><BranchMetric label="Active locations" value={String(activeBranches.length)} detail="Available for daily work" tone="bg-success text-white" /><BranchMetric label="Live terminals" value={String(activeDevices)} detail="Active POS devices" tone="bg-secondary text-primary" /><BranchMetric label="Assigned staff" value={String(assignedStaff)} detail="Linked to a branch" tone="bg-primary-soft text-primary" /></div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(300px,0.68fr)_minmax(0,1.32fr)]"><BranchCreateForm cloneBranches={activeBranches} canWrite={canWrite} /><section aria-labelledby="branches-list-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Organization directory</p><h2 id="branches-list-heading" className="admin-panel__title">Your branches</h2><p className="admin-panel__subtitle">{branches.length} location{branches.length === 1 ? "" : "s"}. Inactive branches stay in history and can be reactivated later.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">RLS protected</span></div>{branches.length === 0 ? <EmptyBranches canWrite={canWrite} /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[820px]"><thead><tr><th>Branch</th><th>Receipt identity</th><th>People</th><th>Terminals</th><th>Status</th><th>Action</th></tr></thead><tbody>{branches.map((branch) => { const branchDevices = devices.filter((device) => device.store_id === branch.id); const branchStaff = staff.filter((member) => member.store_id === branch.id); return <tr key={branch.id} className={!branch.is_active ? "opacity-65" : undefined}><td><strong className="font-extrabold">{branch.name}</strong><small className="mt-1 block max-w-[220px] truncate text-[10px] text-ink-muted">{branch.address || "No address saved"}</small><small className="mt-1 block text-[10px] text-ink-muted">Added {formatCreatedAt(branch.created_at)}</small></td><td><span className="block whitespace-nowrap">{branch.tin || "TIN not set"}</span><small className="mt-1 block text-[10px] text-ink-muted">{branch.vat_registered ? `VAT ${vatPercent(Number(branch.vat_rate))}% · ${branch.currency}` : `VAT exempt · ${branch.currency}`}</small></td><td className="whitespace-nowrap">{branchStaff.length} staff</td><td className="whitespace-nowrap">{branchDevices.filter((device) => device.is_active).length} active <span className="text-ink-muted">/ {branchDevices.length}</span></td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${branch.is_active ? "bg-success/10 text-success" : "bg-secondary text-ink-muted"}`}>{branch.is_active ? "Active" : "Inactive"}</span></td><td><a data-branch-trigger={branch.id} href={`/admin/branches?edit=${encodeURIComponent(branch.id)}`} className="inline-flex items-center gap-1 font-extrabold text-primary hover:underline">Edit <AdminIcon name="edit" size={13} /></a></td></tr>; })}</tbody></table></div>}</section></div>
      </div>
    </UrlLocalDialogController>
  );
}

function BranchCreateForm({ cloneBranches, canWrite }: { cloneBranches: AdminBranchRecord[]; canWrite: boolean }) {
  return <section id="branch-editor" aria-labelledby="branch-editor-heading" className="admin-panel self-start p-5"><div><p className="admin-panel__eyebrow">New location</p><h2 id="branch-editor-heading" className="admin-panel__title">Add a branch</h2><p className="admin-panel__subtitle">Start with the location identity, then optionally copy an active branch menu.</p></div>{cloneBranches.length > 0 && <p className="mt-4 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-ink">Additional active branches are billed through your plan. <a href="/admin/billing?reason=additional_branch" className="font-extrabold text-primary underline underline-offset-2">Review Billing &amp; Plan</a> before adding another location.</p>}<form action={createBranch} className="mt-5 space-y-3"><BranchFields cloneBranches={cloneBranches} canWrite={canWrite} /><SubmitButton disabled={!canWrite}>Create branch</SubmitButton></form></section>;
}

function BranchEditorDialog({ branch, canWrite, onClose }: { branch: AdminBranchRecord; canWrite: boolean; onClose: () => void }) {
  return <section aria-labelledby={`branch-dialog-heading-${branch.id}`}><header className="flex items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">Location editor</p><h2 id={`branch-dialog-heading-${branch.id}`} className="admin-panel__title">Edit branch</h2><p id={`branch-dialog-description-${branch.id}`} className="admin-panel__subtitle">Update the identity used by receipts and branch-scoped work.</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close branch editor">&times;</button></header><form action={updateBranch} className="mt-5 space-y-3"><input type="hidden" name="branch_id" value={branch.id} /><BranchFields branch={branch} canWrite={canWrite} /><div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-btn bg-secondary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Cancel</button><SubmitButton disabled={!canWrite}>Save branch</SubmitButton></div></form></section>;
}

function BranchFields({ branch, cloneBranches, canWrite }: { branch?: AdminBranchRecord; cloneBranches?: AdminBranchRecord[]; canWrite: boolean }) {
  const id = branch?.id ?? "new";
  return <><Field label="Branch name" htmlFor={`branch-name-${id}`}><input id={`branch-name-${id}`} name="name" defaultValue={branch?.name ?? ""} placeholder="e.g. Main Branch" required maxLength={120} disabled={!canWrite} className="inventory-input" /></Field><Field label="Address" htmlFor={`branch-address-${id}`}><textarea id={`branch-address-${id}`} name="address" defaultValue={branch?.address ?? ""} placeholder="Street, barangay, city" maxLength={240} disabled={!canWrite} className="inventory-input min-h-20 resize-y" /></Field><Field label="TIN" htmlFor={`branch-tin-${id}`}><input id={`branch-tin-${id}`} name="tin" defaultValue={branch?.tin ?? ""} placeholder="Optional tax identification number" maxLength={80} disabled={!canWrite} className="inventory-input" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="VAT rate (%)" htmlFor={`branch-vat-rate-${id}`}><input id={`branch-vat-rate-${id}`} name="vat_rate" type="number" min="0" max="100" step="0.01" defaultValue={vatPercent(Number(branch?.vat_rate ?? 0.12))} required disabled={!canWrite} className="inventory-input" /></Field><Field label="Currency" htmlFor={`branch-currency-${id}`}><select id={`branch-currency-${id}`} name="currency" defaultValue={branch?.currency ?? "PHP"} disabled={!canWrite} className="inventory-input"><option value="PHP">PHP · Philippine peso</option><option value="USD">USD · US dollar</option><option value="SGD">SGD · Singapore dollar</option></select></Field></div><label className="flex min-h-11 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="vat_registered" defaultChecked={branch?.vat_registered ?? true} disabled={!canWrite} className="h-4 w-4 accent-primary" />VAT registered</label>{!branch && cloneBranches && <Field label="Clone menu from" htmlFor="clone-from"><select id="clone-from" name="clone_from_store_id" defaultValue="" disabled={!canWrite} className="inventory-input"><option value="">Start with an empty menu</option>{cloneBranches.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><span className="mt-1 block text-[11px] leading-5 text-ink-muted">Categories, prices, stock settings, and supplier links are copied.</span></Field>}{branch && <label className="flex min-h-11 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="is_active" defaultChecked={branch.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" />Branch is active</label>}</>;
}

function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="mt-2 flex-1 rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving..." : children}</button>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function BranchMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`rounded-card border border-line p-4 shadow-[var(--shadow-card)] ${tone}`}><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] opacity-80">{label}</p><strong className="mt-2 block text-2xl font-extrabold tracking-[-0.03em]">{value}</strong><span className="mt-1 block text-[10px] font-semibold opacity-75">{detail}</span></article>;
}

function EmptyBranches({ canWrite }: { canWrite: boolean }) {
  return <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="branches" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">No branches found</p><p className="mt-1 text-xs text-ink-muted">{canWrite ? "Create the first branch to give your POS data a home." : "Ask an organization admin to create your first branch."}</p></div>;
}

