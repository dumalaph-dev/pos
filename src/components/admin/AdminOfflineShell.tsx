"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { clearOfflineCaches } from "@/lib/offline-cache";
import {
  clearOfflineSession,
  getOfflineAdminScope,
  type OfflineCredential,
  type OfflineAdminScope,
} from "@/lib/offline";
import {
  clearAdminLocalFirstCache,
  getAdminCacheRecords,
  getAdminOfflineCacheStatus,
  type AdminCacheRecord,
  type AdminCacheScope,
} from "@/lib/admin/local-first-store";
import type { AuditEventReadModel } from "@/lib/admin/audit-read-models";
import type {
  InventoryMovementReadModel,
  InventoryStockSnapshot,
  InventoryVarianceReadModel,
} from "@/lib/admin/inventory-read-models";
import type { OrderReceiptData } from "@/lib/admin/order-receipts";
import type { ShiftDialogReadModel, ShiftZReadingRecord } from "@/lib/admin/shift-readings";
import { formatShiftDuration, formatShiftTime, shiftLabel, varianceLabel } from "@/lib/shifts";
import { formatPeso } from "@/lib/money";

type OfflineSection = "overview" | "orders" | "shifts" | "inventory" | "variance" | "audit";

type OfflineAdminData = {
  orders: Array<AdminCacheRecord<OrderReceiptData>>;
  shifts: Array<AdminCacheRecord<ShiftDialogReadModel>>;
  zReadings: Array<AdminCacheRecord<ShiftZReadingRecord>>;
  inventory: Array<AdminCacheRecord<InventoryStockSnapshot>>;
  movements: Array<AdminCacheRecord<InventoryMovementReadModel>>;
  variance: Array<AdminCacheRecord<InventoryVarianceReadModel>>;
  audit: Array<AdminCacheRecord<AuditEventReadModel>>;
  lastSyncedAt: string | null;
};

const EMPTY_DATA: OfflineAdminData = {
  orders: [],
  shifts: [],
  zReadings: [],
  inventory: [],
  movements: [],
  variance: [],
  audit: [],
  lastSyncedAt: null,
};

const NAV_ITEMS: Array<{ id: OfflineSection; label: string; path: string }> = [
  { id: "overview", label: "Dashboard", path: "/admin" },
  { id: "orders", label: "Orders", path: "/admin/orders" },
  { id: "shifts", label: "Shifts & Z", path: "/admin/shifts" },
  { id: "inventory", label: "Inventory", path: "/admin/inventory" },
  { id: "variance", label: "Variance", path: "/admin/inventory/variance" },
  { id: "audit", label: "Audit", path: "/admin/audit" },
];

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(date);
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function orderStatusClass(status: OrderReceiptData["order"]["status"]) {
  if (status === "voided") return "border-danger/25 bg-danger-soft text-danger";
  if (status === "refunded") return "border-warning/25 bg-warning/10 text-warning";
  return "border-success/25 bg-success/10 text-success";
}

function getSection(pathname: string): OfflineSection {
  if (pathname.startsWith("/admin/orders") || pathname.startsWith("/admin/sales")) return "orders";
  if (pathname.startsWith("/admin/shifts")) return "shifts";
  if (pathname.startsWith("/admin/inventory/variance")) return "variance";
  if (pathname.startsWith("/admin/inventory")) return "inventory";
  if (pathname.startsWith("/admin/audit")) return "audit";
  return "overview";
}

function createScope(adminScope: OfflineAdminScope, credential: OfflineCredential): AdminCacheScope {
  return {
    userId: credential.user_id,
    orgId: adminScope.org_id,
    storeId: adminScope.store_id,
    role: adminScope.role,
  };
}

async function loadOfflineAdminData(scope: AdminCacheScope): Promise<OfflineAdminData> {
  const [status, orders, shifts, zReadings, inventory, movements, variance, audit] = await Promise.all([
    getAdminOfflineCacheStatus(scope),
    getAdminCacheRecords<OrderReceiptData>(scope, "order_receipts"),
    getAdminCacheRecords<ShiftDialogReadModel>(scope, "shifts"),
    getAdminCacheRecords<ShiftZReadingRecord>(scope, "z_readings"),
    getAdminCacheRecords<InventoryStockSnapshot>(scope, "inventory"),
    getAdminCacheRecords<InventoryMovementReadModel>(scope, "inventory_movements"),
    getAdminCacheRecords<InventoryVarianceReadModel>(scope, "inventory_variance"),
    getAdminCacheRecords<AuditEventReadModel>(scope, "audit"),
  ]);
  return { orders, shifts, zReadings, inventory, movements, variance, audit, lastSyncedAt: status.lastSyncedAt };
}

export default function AdminOfflineShell({ credential }: { credential: OfflineCredential }) {
  const router = useRouter();
  const adminScope = getOfflineAdminScope(credential);
  const cacheScope = useMemo(
    () => adminScope ? createScope(adminScope, credential) : null,
    [adminScope, credential],
  );
  const [pathname, setPathname] = useState(() => typeof window === "undefined" ? "/admin" : window.location.pathname);
  const [data, setData] = useState<OfflineAdminData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderReceiptData | null>(null);
  const [selectedShift, setSelectedShift] = useState<ShiftDialogReadModel | null>(null);
  const section = getSection(pathname);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!cacheScope) {
      return () => { active = false; };
    }
    void loadOfflineAdminData(cacheScope)
      .then((nextData) => {
        if (!active) return;
        setData(nextData);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setError("The cached admin read models could not be opened in this browser.");
      });
    return () => {
      active = false;
    };
  }, [cacheScope]);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function signOutOffline() {
    await Promise.allSettled([clearOfflineSession(), clearAdminLocalFirstCache(), clearOfflineCaches()]);
    router.replace("/login?signed-out=1");
  }

  if (!adminScope) {
    return (
      <main className="min-h-screen bg-bg p-5 text-ink sm:p-8">
        <div className="mx-auto max-w-xl rounded-card border border-warning/30 bg-surface p-6 shadow-[var(--shadow-card)]">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-warning">Offline admin unavailable</p>
          <h1 className="mt-2 text-2xl font-extrabold">This device is not enabled for admin recovery.</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Sign in online as an admin or manager, open the admin workspace, and enable read-only offline access before using this device offline.</p>
          <button type="button" onClick={() => void signOutOffline()} className="mt-5 rounded-btn bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-fg">Return to sign in</button>
        </div>
      </main>
    );
  }

  const branchLabel = adminScope.store_id ? "Selected branch" : "All branches";
  const lowStockCount = data.inventory.filter((record) => record.data.status !== "in_stock").length;
  const openShiftCount = data.shifts.filter((record) => record.data.reading.isOpen).length;
  const recentOrders = data.orders.slice().sort((left, right) => right.data.order.created_at.localeCompare(left.data.order.created_at)).slice(0, 8);

  return (
    <main data-admin-theme="default" className="min-h-screen bg-bg text-ink">
      <div className="mx-auto min-h-screen w-full max-w-[1440px] px-4 pb-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Dumala POS · offline workspace</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] sm:text-3xl">Admin recovery</h1>
            <p className="mt-1 text-xs text-ink-muted">{credential.profile.full_name || "Admin"} · {adminScope.role} · {branchLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-extrabold text-ink">{online ? "Online · read-only until sign-in" : "Offline · read-only"}</span>
            <button type="button" onClick={() => void signOutOffline()} className="rounded-btn border border-line bg-surface px-3 py-2 text-xs font-extrabold text-primary hover:bg-primary-soft">Sign out device</button>
          </div>
        </header>

        <nav aria-label="Offline admin navigation" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              className={`whitespace-nowrap rounded-btn px-3 py-2 text-xs font-extrabold transition ${section === item.id ? "bg-primary text-primary-fg" : "border border-line bg-surface text-primary hover:bg-primary-soft"}`}
              aria-current={section === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div role="status" className="mt-4 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-xs font-semibold text-ink">
          Cached read-only data · last synced {formatDateTime(data.lastSyncedAt)}. No void, refund, reprint, inventory, shift, or audit mutations are available in this shell.
        </div>

        {loading ? (
          <div className="mt-6 rounded-card border border-line bg-surface p-8 text-center text-sm text-ink-muted">Opening the device cache…</div>
        ) : error ? (
          <div role="alert" className="mt-6 rounded-card border border-danger/25 bg-danger-soft p-5 text-sm font-semibold text-danger">{error}</div>
        ) : (
          <>
            {section === "overview" && <Overview data={data} recentOrders={recentOrders} lowStockCount={lowStockCount} openShiftCount={openShiftCount} onOrder={setSelectedOrder} onNavigate={navigate} />}
            {section === "orders" && <OrdersSection records={data.orders} onOrder={setSelectedOrder} />}
            {section === "shifts" && <ShiftsSection records={data.shifts} zReadings={data.zReadings} onShift={setSelectedShift} />}
            {section === "inventory" && <InventorySection records={data.inventory} movements={data.movements} />}
            {section === "variance" && <VarianceSection records={data.variance} />}
            {section === "audit" && <AuditSection records={data.audit} />}
          </>
        )}
      </div>

      {selectedOrder && <OfflineReceiptDialog receipt={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {selectedShift && <OfflineShiftDialog shift={selectedShift} onClose={() => setSelectedShift(null)} />}
    </main>
  );
}

function Overview({
  data,
  recentOrders,
  lowStockCount,
  openShiftCount,
  onOrder,
  onNavigate,
}: {
  data: OfflineAdminData;
  recentOrders: Array<AdminCacheRecord<OrderReceiptData>>;
  lowStockCount: number;
  openShiftCount: number;
  onOrder: (receipt: OrderReceiptData) => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OfflineMetric label="Cached orders" value={data.orders.length.toLocaleString("en-PH")} detail="Receipt views available" />
        <OfflineMetric label="Open tills" value={String(openShiftCount)} detail="Cached live readings" />
        <OfflineMetric label="Stock alerts" value={String(lowStockCount)} detail="Low or out of stock" />
        <OfflineMetric label="Audit events" value={data.audit.length.toLocaleString("en-PH")} detail="Cached append-only records" />
      </div>
      <section className="mt-4 rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Recent receipts</p><h2 className="mt-1 text-lg font-extrabold">Open a cached receipt</h2></div>
          <button type="button" onClick={() => onNavigate("/admin/orders")} className="rounded-btn border border-line px-3 py-2 text-xs font-extrabold text-primary hover:bg-primary-soft">View all orders</button>
        </div>
        <OrderRows records={recentOrders} onOrder={onOrder} />
      </section>
    </section>
  );
}

function OfflineMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)]"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</p><p className="mt-2 text-2xl font-extrabold tracking-[-0.04em]">{value}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></article>;
}

function OrdersSection({ records, onOrder }: { records: Array<AdminCacheRecord<OrderReceiptData>>; onOrder: (receipt: OrderReceiptData) => void }) {
  return <OfflineSectionFrame eyebrow="Cached order register" title="Orders" detail="Every receipt below is read-only and remains on this device until the session is cleared."><OrderRows records={records} onOrder={onOrder} /></OfflineSectionFrame>;
}

function OrderRows({ records, onOrder }: { records: Array<AdminCacheRecord<OrderReceiptData>>; onOrder: (receipt: OrderReceiptData) => void }) {
  if (records.length === 0) return <EmptyState text="No cached order receipts are available for this scope." />;
  const sorted = records.slice().sort((left, right) => right.data.order.created_at.localeCompare(left.data.order.created_at));
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th className="px-2 py-2">Receipt</th><th className="px-2 py-2">Date</th><th className="px-2 py-2">Cashier</th><th className="px-2 py-2">Status</th><th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right">Open</th></tr></thead>
        <tbody>{sorted.map((record) => <tr key={record.id} className="border-b border-line/70 last:border-0"><td className="px-2 py-3 font-extrabold text-primary">{record.data.order.order_no}</td><td className="whitespace-nowrap px-2 py-3 text-ink-muted">{formatDateTime(record.data.order.created_at)}</td><td className="px-2 py-3">{record.data.cashierName}</td><td className="px-2 py-3"><span className={`rounded-pill border px-2 py-1 text-[10px] font-extrabold ${orderStatusClass(record.data.order.status)}`}>{record.data.order.status}</span></td><td className="px-2 py-3 text-right font-extrabold">{displayPeso(record.data.order.total)}</td><td className="px-2 py-3 text-right"><button type="button" onClick={() => onOrder(record.data)} className="rounded-btn border border-line px-2.5 py-1.5 font-extrabold text-primary hover:bg-primary-soft" aria-haspopup="dialog">Receipt</button></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ShiftsSection({ records, zReadings, onShift }: { records: Array<AdminCacheRecord<ShiftDialogReadModel>>; zReadings: Array<AdminCacheRecord<ShiftZReadingRecord>>; onShift: (shift: ShiftDialogReadModel) => void }) {
  const zByShiftId = new Map(zReadings.map((record) => [record.data.shift_id, record.data]));
  const merged = records.map((record) => ({ ...record.data, zReading: record.data.zReading ?? zByShiftId.get(record.data.reading.shiftId) ?? null }));
  return <OfflineSectionFrame eyebrow="Cached till register" title="Shifts & Z-readings" detail="X-readings, closed shifts, and sealed Z snapshots are view-only while offline."><div className="mt-4 overflow-x-auto">{merged.length === 0 ? <EmptyState text="No cached shift readings are available for this scope." /> : <table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th className="px-2 py-2">Shift</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Cashier</th><th className="px-2 py-2">Window</th><th className="px-2 py-2">Orders</th><th className="px-2 py-2 text-right">Net sales</th><th className="px-2 py-2 text-right">Open</th></tr></thead><tbody>{merged.map((record) => <tr key={record.reading.shiftId} className="border-b border-line/70 last:border-0"><td className="px-2 py-3 font-extrabold text-primary">{shiftLabel(record.reading)}</td><td className="px-2 py-3">{record.reading.isOpen ? "X-reading · live" : record.zReading ? `Z #${record.zReading.z_number}` : "Closed shift"}</td><td className="px-2 py-3">{record.cashierName}</td><td className="whitespace-nowrap px-2 py-3 text-ink-muted">{formatShiftTime(record.reading.openedAt)} · {formatShiftDuration(record.reading.openedAt, record.reading.closedAt)}</td><td className="px-2 py-3">{record.reading.orderCount}</td><td className="px-2 py-3 text-right font-extrabold">{displayPeso(record.reading.netSales)}</td><td className="px-2 py-3 text-right"><button type="button" onClick={() => onShift(record)} className="rounded-btn border border-line px-2.5 py-1.5 font-extrabold text-primary hover:bg-primary-soft" aria-haspopup="dialog">Reading</button></td></tr>)}</tbody></table>}</div></OfflineSectionFrame>;
}

function InventorySection({ records, movements }: { records: Array<AdminCacheRecord<InventoryStockSnapshot>>; movements: Array<AdminCacheRecord<InventoryMovementReadModel>> }) {
  return <OfflineSectionFrame eyebrow="Cached stock snapshot" title="Inventory" detail={`${records.length} stock rows · ${movements.length} movement records. Stock changes are unavailable until the connection returns.`}><div className="mt-4 overflow-x-auto">{records.length === 0 ? <EmptyState text="No cached inventory snapshot is available for this scope." /> : <table className="w-full min-w-[780px] text-left text-xs"><thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th className="px-2 py-2">Product</th><th className="px-2 py-2">Branch</th><th className="px-2 py-2">Category</th><th className="px-2 py-2 text-right">On hand</th><th className="px-2 py-2 text-right">Minimum</th><th className="px-2 py-2">Status</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-b border-line/70 last:border-0"><td className="px-2 py-3 font-extrabold">{record.data.productName}<small className="mt-1 block text-[10px] font-normal text-ink-muted">{record.data.unit}</small></td><td className="px-2 py-3">{record.data.branchName}</td><td className="px-2 py-3 text-ink-muted">{record.data.categoryName}</td><td className="px-2 py-3 text-right font-extrabold">{formatQuantity(record.data.onHand)}</td><td className="px-2 py-3 text-right">{formatQuantity(record.data.minimum)}</td><td className="px-2 py-3"><span className={`rounded-pill px-2 py-1 text-[10px] font-extrabold ${record.data.status === "out" ? "bg-danger-soft text-danger" : record.data.status === "low" ? "bg-warning/15 text-warning" : "bg-success/10 text-success"}`}>{record.data.status.replace("_", " ")}</span></td></tr>)}</tbody></table>}</div></OfflineSectionFrame>;
}

function VarianceSection({ records }: { records: Array<AdminCacheRecord<InventoryVarianceReadModel>> }) {
  return <OfflineSectionFrame eyebrow="Cached end-of-day counts" title="Inventory variance" detail="Physical counts are snapshots only. Saving a count requires the online admin workflow."><div className="mt-4 overflow-x-auto">{records.length === 0 ? <EmptyState text="No cached inventory variance is available for this scope." /> : <table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th className="px-2 py-2">Product</th><th className="px-2 py-2">Date</th><th className="px-2 py-2 text-right">Expected</th><th className="px-2 py-2 text-right">Counted</th><th className="px-2 py-2 text-right">Variance</th><th className="px-2 py-2">Status</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-b border-line/70 last:border-0"><td className="px-2 py-3 font-extrabold">{record.data.productName}<small className="mt-1 block text-[10px] font-normal text-ink-muted">{record.data.unit}</small></td><td className="px-2 py-3 text-ink-muted">{record.data.countDate}</td><td className="px-2 py-3 text-right">{formatQuantity(record.data.expected)}</td><td className="px-2 py-3 text-right">{record.data.counted === null ? "—" : formatQuantity(record.data.counted)}</td><td className="px-2 py-3 text-right font-extrabold">{record.data.variance === null ? "—" : formatQuantity(record.data.variance)}</td><td className="px-2 py-3">{record.data.status}</td></tr>)}</tbody></table>}</div></OfflineSectionFrame>;
}

function AuditSection({ records }: { records: Array<AdminCacheRecord<AuditEventReadModel>> }) {
  return <OfflineSectionFrame eyebrow="Cached append-only ledger" title="Audit log" detail="Snapshots are read-only and cannot be edited or submitted from offline recovery."><div className="mt-4 overflow-x-auto">{records.length === 0 ? <EmptyState text="No cached audit events are available for this scope." /> : <table className="w-full min-w-[840px] text-left text-xs"><thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th className="px-2 py-2">Timestamp</th><th className="px-2 py-2">Actor</th><th className="px-2 py-2">Action</th><th className="px-2 py-2">Resource</th><th className="px-2 py-2">Branch</th><th className="px-2 py-2">Snapshot</th></tr></thead><tbody>{records.slice().sort((left, right) => right.data.createdAt.localeCompare(left.data.createdAt)).map((record) => <tr key={record.id} className="border-b border-line/70 align-top last:border-0"><td className="whitespace-nowrap px-2 py-3 text-ink-muted">{formatDateTime(record.data.createdAt)}</td><td className="px-2 py-3">{record.data.actorName}</td><td className="px-2 py-3 font-extrabold">{record.data.action}</td><td className="px-2 py-3">{record.data.entity ?? "General event"}<small className="mt-1 block break-all text-[10px] text-ink-muted">{record.data.entityId ?? ""}</small></td><td className="px-2 py-3">{record.data.branchName}</td><td className="px-2 py-3"><details><summary className="cursor-pointer font-extrabold text-primary">View snapshot</summary><div className="mt-2 grid gap-2"><SnapshotBlock label="Before" value={record.data.before} /><SnapshotBlock label="After" value={record.data.after} /></div></details></td></tr>)}</tbody></table>}</div></OfflineSectionFrame>;
}

function SnapshotBlock({ label, value }: { label: string; value: unknown }) {
  return <div><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</p><pre className="mt-1 max-w-[280px] whitespace-pre-wrap break-words rounded-btn bg-bg p-2 text-[10px] leading-4">{safeJson(value)}</pre></div>;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? "—";
  } catch {
    return "Snapshot unavailable";
  }
}

function OfflineSectionFrame({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children: ReactNode }) {
  return <section className="mt-6 rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{eyebrow}</p><h2 className="mt-1 text-2xl font-extrabold tracking-[-0.04em]">{title}</h2><p className="mt-1 text-sm text-ink-muted">{detail}</p>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center text-sm text-ink-muted">{text}</div>;
}

function OfflineReceiptDialog({ receipt, onClose }: { receipt: OrderReceiptData; onClose: () => void }) {
  const { order } = receipt;
  return <AdminDialog onClose={onClose} titleId={`offline-receipt-${order.id}`} descriptionId={`offline-receipt-meta-${order.id}`} bodyClassName="offline-admin-modal-open" backdropClassName="fixed inset-0 z-[100] grid place-items-center bg-[#102d21]/55 p-3 backdrop-blur-sm" dialogClassName="max-h-[calc(100dvh-24px)] w-[min(900px,100%)] overflow-y-auto rounded-2xl border border-line bg-surface-raised shadow-2xl"><section aria-labelledby={`offline-receipt-${order.id}`} className="p-4 sm:p-5"><header className="flex items-start justify-between gap-4 border-b border-line pb-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Receipt view · cached</p><h2 id={`offline-receipt-${order.id}`} className="mt-1 text-xl font-extrabold">{order.order_no}</h2><p id={`offline-receipt-meta-${order.id}`} className="mt-1 text-xs text-ink-muted">{formatDateTime(order.created_at)} · {receipt.branch.name} · {receipt.cashierName}</p></div><button type="button" onClick={onClose} data-order-dialog-autofocus className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary" aria-label="Close receipt view">×</button></header><div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.75fr)]"><div className="rounded-btn border border-line bg-surface p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Line items</p><h3 className="mt-1 text-sm font-extrabold">{receipt.items.length} item{receipt.items.length === 1 ? "" : "s"}</h3></div><span className={`rounded-pill border px-2 py-1 text-[10px] font-extrabold uppercase ${orderStatusClass(order.status)}`}>{order.status}</span></div><div className="mt-2 grid gap-1 sm:grid-cols-2">{receipt.items.length === 0 ? <p className="text-xs text-ink-muted">Item details are unavailable.</p> : receipt.items.map((item, index) => <div key={`${item.order_id}-${index}`} className="flex min-w-0 items-center justify-between gap-2 border-b border-line/70 py-2 text-xs last:border-0"><span className="min-w-0"><strong className="block truncate">{item.name_snapshot}</strong><small className="text-[10px] text-ink-muted">{formatQuantity(item.weight_kg ?? item.qty)} {item.unit}</small></span><strong className="whitespace-nowrap">{displayPeso(item.line_total)}</strong></div>)}</div></div><aside className="grid content-start gap-3 rounded-btn border border-line bg-surface p-3"><div className="grid gap-1 rounded-btn bg-surface-raised p-2 text-xs"><ReceiptMeta label="Branch" value={receipt.branch.name} /><ReceiptMeta label="Cashier" value={receipt.cashierName} />{order.payment_ref && <ReceiptMeta label="Payment ref" value={order.payment_ref} />}</div><div className="grid gap-1 border-t border-line pt-3 text-xs"><ReceiptMeta label="Subtotal" value={displayPeso(order.subtotal)} /><ReceiptMeta label="Discount" value={displayPeso(order.discount_amount)} /><ReceiptMeta label="VAT" value={displayPeso(order.vat_amount)} /><div className="mt-1 flex items-baseline justify-between border-t border-line-strong pt-2 text-sm font-extrabold"><span>Total</span><strong className="text-lg text-primary">{displayPeso(order.total)}</strong></div></div><p className="rounded-btn border border-warning/25 bg-warning/10 p-2 text-[10px] leading-4 text-ink">Cached receipt is read-only. Reprint, void, and refund actions require an online session.</p></aside></div></section></AdminDialog>;
}

function ReceiptMeta({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-3"><span className="text-ink-muted">{label}</span><strong className="max-w-[62%] truncate text-right">{value}</strong></div>;
}

function OfflineShiftDialog({ shift, onClose }: { shift: ShiftDialogReadModel; onClose: () => void }) {
  const { reading, zReading } = shift;
  const metricRows: Array<[string, string]> = [
    ["Orders", String(reading.orderCount)],
    ["Net sales", displayPeso(reading.netSales)],
    ["Expected cash", displayPeso(reading.expectedCash)],
    ["Cash variance", varianceLabel(reading.cashVariance, displayPeso)],
    ["Cash", displayPeso(reading.cashSales)],
    ["GCash", displayPeso(reading.gcashSales)],
    ["Maya", displayPeso(reading.mayaSales)],
    ["Card", displayPeso(reading.cardSales)],
    ["Voids", `${reading.voidCount} · ${displayPeso(reading.voidTotal)}`],
    ["Refunds", `${reading.refundCount} · ${displayPeso(reading.refundTotal)}`],
  ];
  return <AdminDialog onClose={onClose} titleId={`offline-shift-${reading.shiftId}`} descriptionId={`offline-shift-meta-${reading.shiftId}`} bodyClassName="offline-admin-modal-open" backdropClassName="fixed inset-0 z-[100] grid place-items-center bg-[#102d21]/55 p-3 backdrop-blur-sm" dialogClassName="max-h-[calc(100dvh-24px)] w-[min(860px,100%)] overflow-y-auto rounded-2xl border border-line bg-surface-raised shadow-2xl"><section aria-labelledby={`offline-shift-${reading.shiftId}`} className="p-4 sm:p-5"><header className="flex items-start justify-between gap-4 border-b border-line pb-3"><div><p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${reading.isOpen ? "text-warning" : "text-success"}`}>{reading.isOpen ? "X-reading · live" : zReading ? "Z-reading" : "Closed shift"} · cached</p><h2 id={`offline-shift-${reading.shiftId}`} className="mt-1 text-xl font-extrabold">{shiftLabel(reading)}</h2><p id={`offline-shift-meta-${reading.shiftId}`} className="mt-1 text-xs text-ink-muted">{shift.cashierName} · {shift.branchName} · {formatShiftTime(reading.openedAt)} → {reading.closedAt ? formatShiftTime(reading.closedAt) : "still open"}</p></div><button type="button" onClick={onClose} data-shift-dialog-autofocus className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary" aria-label="Close shift reading">×</button></header><div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{metricRows.map(([label, value]) => <div key={label} className="rounded-btn border border-line bg-surface p-2.5"><p className="text-[10px] text-ink-muted">{label}</p><p className="mt-1 truncate text-sm font-extrabold">{value}</p></div>)}</div><aside className="grid content-start gap-3 rounded-btn border border-line bg-surface p-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Shift details</p><div className="grid gap-1 text-xs"><ReceiptMeta label="Duration" value={formatShiftDuration(reading.openedAt, reading.closedAt)} /><ReceiptMeta label="Gross sales" value={displayPeso(reading.grossSales)} /><ReceiptMeta label="Discounts" value={displayPeso(reading.discountTotal)} /><ReceiptMeta label="Opening float" value={displayPeso(reading.openingCash)} /></div>{zReading && <div className="border-t border-line pt-3 text-xs"><ReceiptMeta label="Z number" value={`#${zReading.z_number}`} /><ReceiptMeta label="Business date" value={zReading.business_date} /><ReceiptMeta label="Sealed net sales" value={displayPeso(zReading.net_sales)} /></div>}{reading.note && <p className="rounded-btn bg-surface-raised p-2 text-xs text-ink-muted"><strong className="block text-[10px] uppercase tracking-[0.1em] text-ink">Shift note</strong>{reading.note}</p>}<p className="rounded-btn border border-warning/25 bg-warning/10 p-2 text-[10px] leading-4 text-ink">Cached reading is read-only. Closing a till or generating a Z-reading requires an online session.</p></aside></div></section></AdminDialog>;
}
