import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { OnlineOrderingWorkspace } from "./OnlineOrderingWorkspace";
import { getAdminBranches } from "@/lib/admin/branches";
import { getAdminProfile } from "@/lib/admin/profile";
import { getSelectedAdminBranchId } from "@/lib/admin/branch-context";
import { readAdminBranding } from "@/lib/admin/branding";
import { absoluteUrl } from "@/lib/site-url";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { publicMenuPath, readOnlineOrderingBrandDefaults, readOnlineOrderingSettings, type OnlineOrderStatus } from "@/lib/online-ordering";
import { publicMenuRootDomain, publicMenuUrl } from "@/lib/public-menu-domain";

export const metadata: Metadata = {
  title: "Online ordering",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type AdminProfile = {
  org_id: string;
  store_id: string | null;
  role: "admin" | "manager" | "cashier";
  password_change_required: boolean;
  organizations: { settings?: unknown } | null;
};

type StoreRecord = {
  id: string;
  name: string;
  address: string | null;
  settings: unknown;
  staff_login_slug: string;
  public_menu_subdomain: string | null;
  is_active: boolean;
};

type OnlineOrderRecord = {
  id: string;
  org_id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  fulfillment_method: string;
  delivery_address: string | null;
  delivery_note: string | null;
  delivery_fee: number;
  pickup_slot: string;
  status: OnlineOrderStatus;
  queue_position: number;
  total: number;
  eta_at: string;
  created_at: string;
};

type OnlineOrderItemRecord = {
  order_id: string;
  name_snapshot: string;
  qty: number;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function OnlineOrderingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as AdminProfile | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <MissingProfile />;

  const branchesResult = await getAdminBranches(profile.org_id);
  const branches = branchesResult.data.filter((branch) => branch.is_active);
  const selectedBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(branchesResult.data, profile.store_id)
    : profile.store_id;
  const storeId = selectedBranchId ?? branches[0]?.id ?? null;
  const params = await searchParams;

  if (!storeId) {
    return <NoBranch branding={readAdminBranding(profile.organizations?.settings)} />;
  }

  const { data: storeData, error: storeError } = await supabase
    .from("stores")
    .select("id, name, address, settings, staff_login_slug, public_menu_subdomain, is_active")
    .eq("id", storeId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  const store = storeData as StoreRecord | null;

  if (storeError || !store || !store.is_active) {
    return <UnavailableStore branding={readAdminBranding(profile.organizations?.settings)} />;
  }

  const ordersResult = await supabase
    .from("online_orders")
    .select("id, org_id, order_no, customer_name, customer_phone, fulfillment_method, delivery_address, delivery_note, delivery_fee, pickup_slot, status, queue_position, total, eta_at, created_at")
    .eq("org_id", profile.org_id)
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const rawOrders = (ordersResult.data ?? []) as OnlineOrderRecord[];
  const orderIds = rawOrders.map((order) => order.id);
  const itemsResult = !ordersResult.error && orderIds.length > 0
    ? await supabase.from("online_order_items").select("order_id, name_snapshot, qty").in("order_id", orderIds)
    : { data: [], error: null };
  const itemsByOrder = new Map<string, OnlineOrderItemRecord[]>();
  for (const item of (itemsResult.data ?? []) as OnlineOrderItemRecord[]) {
    const items = itemsByOrder.get(item.order_id) ?? [];
    items.push(item);
    itemsByOrder.set(item.order_id, items);
  }

  const orders = rawOrders.map((order, index) => ({
    id: order.id,
    orderNo: order.order_no,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    fulfillmentMethod: order.fulfillment_method === "delivery" ? "delivery" as const : "pickup" as const,
    deliveryAddress: order.delivery_address,
    deliveryNote: order.delivery_note,
    deliveryFee: Number(order.delivery_fee) || 0,
    pickupSlot: order.pickup_slot,
    status: order.status,
    queuePosition: Number(order.queue_position) || index + 1,
    total: Number(order.total),
    etaAt: order.eta_at,
    createdAt: order.created_at,
    itemSummary: (itemsByOrder.get(order.id) ?? []).map((item) => `${item.name_snapshot} × ${Number(item.qty)}`).join(" · ") || "Online pickup order",
  }));
  const branding = readAdminBranding(profile.organizations?.settings);
  const onlineBrandDefaults = readOnlineOrderingBrandDefaults(profile.organizations?.settings, store.name);
  const settings = readOnlineOrderingSettings(store.settings);
  const shareUrl = store.public_menu_subdomain
    ? publicMenuUrl(store.public_menu_subdomain) ?? absoluteUrl(publicMenuPath(store.staff_login_slug))
    : absoluteUrl(publicMenuPath(store.staff_login_slug));
  const saved = readParam(params.saved);
  const savedMessage = saved === "settings"
    ? "Online ordering settings saved."
    : saved === "appearance"
      ? "Public menu appearance saved."
      : saved === "status"
        ? "Queue status updated."
        : saved === "domain"
          ? "Custom menu link saved."
        : "";
  const errorMessage = readParam(params.error);
  const queryError = ordersResult.error || itemsResult.error
    ? "Online order storage is not active yet."
    : null;

  return (
    <main data-admin-theme={branding.theme} className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Online ordering">
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Open public menu</a>
        </AdminPageHeader>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Store owner feature · {store.name}</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">Manage the live pickup queue first, then tune the customer-facing menu and copy from the separate Theme &amp; copy tab.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-2 text-xs font-extrabold text-primary"><i className={`h-2 w-2 rounded-full ${settings.enabled ? "bg-success" : "bg-warning"}`} />{settings.enabled ? "Accepting orders" : "Paused"}</span>
        </div>

        <OnlineOrderingWorkspace
          store={{ id: store.id, orgId: profile.org_id, name: store.name, address: store.address, slug: store.staff_login_slug, publicMenuSubdomain: store.public_menu_subdomain }}
          settings={settings}
          onlineBrandDefaults={onlineBrandDefaults}
          publicMenuRootDomain={publicMenuRootDomain()}
          shareUrl={shareUrl}
          orders={orders}
          queryError={queryError}
          savedMessage={savedMessage}
          errorMessage={errorMessage}
          canManage={profile.role === "admin" || profile.role === "manager"}
          canUploadLogo={profile.role === "admin"}
        />
      </div>
    </main>
  );
}

function MissingProfile() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p></div></main>;
}

function NoBranch({ branding }: { branding: { theme: string } }) {
  return <main data-admin-theme={branding.theme} className="admin-page grid min-h-screen place-items-center p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Online ordering</p><h1 className="mt-2 text-2xl font-extrabold">Add a branch first.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">A public menu belongs to one pickup branch. Create an active branch, then come back to publish its menu.</p><Link href="/admin/branches" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Open branches</Link></div></main>;
}

function UnavailableStore({ branding }: { branding: { theme: string } }) {
  return <main data-admin-theme={branding.theme} className="admin-page grid min-h-screen place-items-center p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Online ordering</p><h1 className="mt-2 text-2xl font-extrabold">This branch is unavailable.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Switch to an active branch before setting up a public menu.</p><Link href="/admin" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Back to dashboard</Link></div></main>;
}
