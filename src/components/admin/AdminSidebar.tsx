"use client";

import { usePathname } from "next/navigation";
import { AdminBrandLogo } from "./AdminBrandLogo";
import { AdminIcon, type AdminIconName } from "./AdminIcon";
import { AdminLink as Link } from "./AdminLink";
import { AdminBranchSwitcher } from "./AdminBranchSwitcher";
import type { AdminBranchOption } from "@/lib/admin/branch-context";
import type { AdminBranding } from "@/lib/admin/branding";

export type AdminSection = "overview" | "calendar" | "sales" | "pos" | "orders" | "shifts" | "inventory" | "products" | "catalog" | "customers" | "suppliers" | "expenses" | "employees" | "billing" | "reports" | "audit" | "settings" | "promotions" | "referrals" | "branches";

type NavItem = {
  label: string;
  href?: string;
  icon: AdminIconName;
  active?: AdminSection;
  next?: boolean;
  adminOnly?: boolean;
};

type AdminNavGroupId = "operations" | "catalog" | "growth" | "insights" | "team";

type AdminNavGroup = {
  id: AdminNavGroupId;
  label: string;
  icon: AdminIconName;
  items: NavItem[];
};

export type AdminSidebarConnection = {
  lastSyncedLabel: string | null;
};

const adminNavPrimaryItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard", active: "overview" },
  { label: "Shifts & Z-readings", href: "/admin/shifts", icon: "history", active: "shifts" },
];

const adminNavGroups: AdminNavGroup[] = [
  {
    id: "operations",
    label: "Store operations",
    icon: "pos",
    items: [
      { label: "POS", href: "/admin/pos", icon: "pos", active: "pos" },
      { label: "Orders", href: "/admin/orders", icon: "orders", active: "orders" },
      { label: "Calendar", href: "/admin/calendar", icon: "calendar", active: "calendar" },
    ],
  },
  {
    id: "catalog",
    label: "Products & stock",
    icon: "box",
    items: [
      { label: "Products", href: "/products", icon: "box", active: "products" },
      { label: "Inventory", href: "/admin/inventory", icon: "inventory", active: "inventory" },
      { label: "Suppliers", href: "/admin/suppliers", icon: "suppliers", active: "suppliers" },
    ],
  },
  {
    id: "growth",
    label: "Customers & growth",
    icon: "customers",
    items: [
      { label: "Customers", href: "/admin/customers", icon: "customers", active: "customers" },
      { label: "Promotions", href: "/admin/promotions", icon: "promotions", active: "promotions" },
      { label: "Referral program", href: "/admin/referrals", icon: "tag", active: "referrals", adminOnly: true },
    ],
  },
  {
    id: "insights",
    label: "Insights & finance",
    icon: "chart",
    items: [
      { label: "Sales", href: "/admin/sales", icon: "sales", active: "sales" },
      { label: "Reports", href: "/admin/reports", icon: "reports", active: "reports" },
      { label: "Expenses", href: "/admin/expenses", icon: "expenses", active: "expenses" },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: "settings",
    items: [
      { label: "Employees", href: "/admin/employees", icon: "employees", active: "employees" },
      { label: "Branches", href: "/admin/branches", icon: "branches", active: "branches" },
      { label: "Audit log", href: "/admin/audit", icon: "history", active: "audit" },
    ],
  },
];

const adminNavSecondaryItems: NavItem[] = [
  { label: "Billing & Plan", href: "/admin/billing", icon: "wallet", active: "billing", adminOnly: true },
  { label: "Settings", href: "/admin/settings", icon: "settings", active: "settings" },
];

function activeSectionForPath(pathname: string | null): AdminSection {
  if (pathname === "/products" || pathname?.startsWith("/products/")) return "products";
  if (!pathname || pathname === "/admin" || pathname === "/admin/") return "overview";

  const routeSections: Array<[string, AdminSection]> = [
    ["/admin/calendar", "calendar"],
    ["/admin/sales", "sales"],
    ["/admin/pos", "pos"],
    ["/admin/orders", "orders"],
    ["/admin/shifts", "shifts"],
    ["/admin/inventory", "inventory"],
    ["/admin/products", "products"],
    ["/admin/catalog", "products"],
    ["/admin/customers", "customers"],
    ["/admin/suppliers", "suppliers"],
    ["/admin/expenses", "expenses"],
    ["/admin/employees", "employees"],
    ["/admin/billing", "billing"],
    ["/admin/reports", "reports"],
    ["/admin/audit", "audit"],
    ["/admin/branches", "branches"],
    ["/admin/settings", "settings"],
    ["/admin/promotions", "promotions"],
    ["/admin/referrals", "referrals"],
  ];

  return routeSections.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "overview";
}

function isVisibleNavItem(item: NavItem, canManageBranches: boolean) {
  return (!item.adminOnly || canManageBranches) && (item.active !== "branches" || canManageBranches);
}

function AdminNavItem({ item, active, standalone = false }: { item: NavItem; active: AdminSection; standalone?: boolean }) {
  const className = `admin-nav__item ${standalone ? "admin-nav__item--standalone" : ""} ${item.active === active ? "is-active" : ""}`;

  if (!item.href) {
    return (
      <span className={`${className} is-disabled`} aria-disabled="true">
        <AdminIcon name={item.icon} size={17} />
        <span>{item.label}</span>
        {item.next && <small>Next</small>}
      </span>
    );
  }

  return (
    <Link href={item.href} aria-current={item.active === active ? "page" : undefined} className={className}>
      <AdminIcon name={item.icon} size={17} />
      <span>{item.label}</span>
    </Link>
  );
}

export function AdminSidebar({ branding, branchName, active: activeOverride, connection, branches = [], selectedBranchId = null, canSwitchBranches = false, canManageBranches = false }: { branding: AdminBranding; branchName: string; active?: AdminSection; connection?: AdminSidebarConnection; branches?: AdminBranchOption[]; selectedBranchId?: string | null; canSwitchBranches?: boolean; canManageBranches?: boolean }) {
  const pathname = usePathname();
  const active = activeOverride ?? activeSectionForPath(pathname);

  return (
    <aside className="admin-sidebar hidden lg:flex">
      <div className="admin-sidebar__inner">
        <Link href="/admin" className="admin-brand" aria-label={`${branding.brandName} ${branding.brandTagline} dashboard`}>
          <AdminBrandLogo logoUrl={branding.logoUrl} className="admin-brand__mark" iconSize={30} label="Brand logo" />
          <span className="admin-brand__copy">
            <strong>{branding.brandName}</strong>
            <small>{branding.brandTagline}</small>
          </span>
        </Link>

        <AdminBranchSwitcher branchName={branchName} branches={branches} selectedBranchId={selectedBranchId} canSwitch={canSwitchBranches} canManageBranches={canManageBranches} />

        <nav aria-label="Admin navigation" className="admin-nav">
          {adminNavPrimaryItems.map((item) => (
            <AdminNavItem key={item.label} item={item} active={active} standalone />
          ))}

          {adminNavGroups.map((group) => {
            const items = group.items.filter((item) => isVisibleNavItem(item, canManageBranches));
            const hasActiveItem = items.some((item) => item.active === active);
            if (!items.length) return null;

            return (
              <details key={`${group.id}-${hasActiveItem}`} className={`admin-nav__section ${hasActiveItem ? "is-active" : ""}`} open={hasActiveItem}>
                <summary className="admin-nav__section-toggle">
                  <span className="admin-nav__section-icon"><AdminIcon name={group.icon} size={15} /></span>
                  <span>{group.label}</span>
                  <small className="admin-nav__section-count" aria-label={`${items.length} pages`}>{items.length}</small>
                  <span className="admin-nav__section-chevron" aria-hidden="true"><AdminIcon name="chevron" size={14} /></span>
                </summary>
                <div className="admin-nav__group">
                  {items.map((item) => <AdminNavItem key={item.label} item={item} active={active} />)}
                </div>
              </details>
            );
          })}

          {adminNavSecondaryItems.map((item) => (
            <AdminNavItem key={item.label} item={item} active={active} standalone />
          ))}
        </nav>

        <section className="admin-quick-actions" aria-labelledby="quick-actions-heading">
          <h2 id="quick-actions-heading">Quick actions</h2>
          <div className="admin-quick-actions__list">
            <Link href="/pos" className="admin-quick-actions__item admin-quick-actions__item--primary">
              <span className="admin-quick-actions__icon"><AdminIcon name="plus" size={16} /></span>
              <span className="admin-quick-actions__label">New Sale</span>
              <AdminIcon name="arrow" size={14} />
            </Link>
            <Link href="/pos?quickAction=park" className="admin-quick-actions__item">
              <span className="admin-quick-actions__icon"><AdminIcon name="pos" size={16} /></span>
              <span className="admin-quick-actions__label">Park Order</span>
              <AdminIcon name="arrow" size={14} />
            </Link>
            <Link href="/admin/orders?status=refunded" className="admin-quick-actions__item">
              <span className="admin-quick-actions__icon"><AdminIcon name="history" size={16} /></span>
              <span className="admin-quick-actions__label">Return / Refund</span>
              <AdminIcon name="arrow" size={14} />
            </Link>
            <Link href="/pos?quickAction=drawer" className="admin-quick-actions__item">
              <span className="admin-quick-actions__icon"><AdminIcon name="wallet" size={16} /></span>
              <span className="admin-quick-actions__label">Open Cash Drawer</span>
              <AdminIcon name="arrow" size={14} />
            </Link>
          </div>
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
