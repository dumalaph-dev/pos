"use client";

import { usePathname } from "next/navigation";
import { AdminIcon, type AdminIconName } from "./AdminIcon";
import { AdminLink as Link } from "./AdminLink";
import { AdminBranchSwitcher } from "./AdminBranchSwitcher";
import type { AdminBranchOption } from "@/lib/admin/branch-context";
import type { AdminBranding } from "@/lib/admin/branding";

export type AdminSection = "overview" | "sales" | "pos" | "orders" | "inventory" | "products" | "catalog" | "customers" | "suppliers" | "expenses" | "employees" | "reports" | "audit" | "settings" | "promotions" | "branches";

type NavItem = {
  label: string;
  href?: string;
  icon: AdminIconName;
  active?: AdminSection;
  next?: boolean;
};

export type AdminSidebarConnection = {
  connected: boolean;
  lastSyncedLabel: string | null;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard", active: "overview" },
  { label: "Sales", href: "/admin/sales", icon: "sales", active: "sales" },
  { label: "POS", href: "/admin/pos", icon: "pos", active: "pos" },
  { label: "Orders", href: "/admin/orders", icon: "orders", active: "orders" },
  { label: "Inventory", href: "/admin/inventory", icon: "inventory", active: "inventory" },
  { label: "Products", href: "/products", icon: "box", active: "products" },
  { label: "Customers", href: "/admin/customers", icon: "customers", active: "customers" },
];

const comingSoonNav: NavItem[] = [
  { label: "Suppliers", href: "/admin/suppliers", icon: "suppliers", active: "suppliers" },
  { label: "Expenses", href: "/admin/expenses", icon: "expenses", active: "expenses" },
  { label: "Employees", href: "/admin/employees", icon: "employees", active: "employees" },
  { label: "Promotions", href: "/admin/promotions", icon: "promotions", active: "promotions" },
  { label: "Reports", href: "/admin/reports", icon: "reports", active: "reports" },
  { label: "Audit log", href: "/admin/audit", icon: "history", active: "audit" },
  { label: "Branches", href: "/admin/branches", icon: "branches", active: "branches" },
  { label: "Settings", href: "/admin/settings", icon: "settings", active: "settings" },
];

function activeSectionForPath(pathname: string | null): AdminSection {
  if (pathname === "/products" || pathname?.startsWith("/products/")) return "products";
  if (!pathname || pathname === "/admin" || pathname === "/admin/") return "overview";

  const routeSections: Array<[string, AdminSection]> = [
    ["/admin/sales", "sales"],
    ["/admin/pos", "pos"],
    ["/admin/orders", "orders"],
    ["/admin/inventory", "inventory"],
    ["/admin/products", "products"],
    ["/admin/catalog", "products"],
    ["/admin/customers", "customers"],
    ["/admin/suppliers", "suppliers"],
    ["/admin/expenses", "expenses"],
    ["/admin/employees", "employees"],
    ["/admin/reports", "reports"],
    ["/admin/audit", "audit"],
    ["/admin/branches", "branches"],
    ["/admin/settings", "settings"],
    ["/admin/promotions", "promotions"],
  ];

  return routeSections.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "overview";
}

export function AdminSidebar({ branding, branchName, active: activeOverride, connection, branches = [], selectedBranchId = null, canSwitchBranches = false, canManageBranches = false }: { branding: AdminBranding; branchName: string; active?: AdminSection; connection?: AdminSidebarConnection; branches?: AdminBranchOption[]; selectedBranchId?: string | null; canSwitchBranches?: boolean; canManageBranches?: boolean }) {
  const pathname = usePathname();
  const active = activeOverride ?? activeSectionForPath(pathname);

  return (
    <aside className="admin-sidebar hidden lg:flex">
      <div className="admin-sidebar__inner">
        <Link href="/admin" className="admin-brand" aria-label={`${branding.brandName} ${branding.brandTagline} dashboard`}>
          <span className="admin-brand__mark"><AdminIcon name="pig" size={30} /></span>
          <span className="admin-brand__copy">
            <strong>{branding.brandName}</strong>
            <small>{branding.brandTagline}</small>
          </span>
        </Link>

        <AdminBranchSwitcher branchName={branchName} branches={branches} selectedBranchId={selectedBranchId} canSwitch={canSwitchBranches} canManageBranches={canManageBranches} />

        <nav aria-label="Admin navigation" className="admin-nav">
          <div className="admin-nav__group">
            {primaryNav.map((item) => item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active === active ? "page" : undefined}
                className={`admin-nav__item ${item.active === active ? "is-active" : ""}`}
              >
                <AdminIcon name={item.icon} size={17} />
                <span>{item.label}</span>
              </Link>
            ) : null)}
          </div>

          <div className="admin-nav__group admin-nav__group--secondary">
            {comingSoonNav.filter((item) => item.active !== "branches" || canManageBranches).map((item) => item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active === active ? "page" : undefined}
                className={`admin-nav__item ${item.active === active ? "is-active" : ""}`}
              >
                <AdminIcon name={item.icon} size={17} />
                <span>{item.label}</span>
              </Link>
            ) : (
              <span key={item.label} className="admin-nav__item is-disabled" aria-disabled="true">
                <AdminIcon name={item.icon} size={17} />
                <span>{item.label}</span>
                {item.next && <small>Next</small>}
              </span>
            ))}
          </div>
        </nav>

        <section className="admin-quick-actions" aria-labelledby="quick-actions-heading">
          <h2 id="quick-actions-heading">Quick actions</h2>
          <Link href="/pos" className="admin-quick-actions__item"><span className="admin-quick-actions__icon"><AdminIcon name="plus" size={15} /></span><span>New Sale</span></Link>
          <Link href="/pos?quickAction=park" className="admin-quick-actions__item"><span className="admin-quick-actions__icon"><AdminIcon name="pos" size={15} /></span><span>Park Order</span></Link>
          <Link href="/admin/orders?status=refunded" className="admin-quick-actions__item"><span className="admin-quick-actions__icon"><AdminIcon name="history" size={15} /></span><span>Return / Refund</span></Link>
          <Link href="/pos?quickAction=drawer" className="admin-quick-actions__item"><span className="admin-quick-actions__icon"><AdminIcon name="wallet" size={15} /></span><span>Open Cash Drawer</span></Link>
        </section>

        <section className="admin-system-info" aria-label="POS system information">
          <h2>System info</h2>
          <div>
            <span>Last synced: {connection?.lastSyncedLabel ?? "Not synced yet"}</span>
          <Link href="/admin/pos?tab=hardware" aria-label="Open terminal settings"><AdminIcon name="refresh" size={14} /></Link>
          </div>
        </section>
      </div>
    </aside>
  );
}
