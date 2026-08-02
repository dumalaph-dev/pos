import Link from "next/link";
import { AdminIcon, type AdminIconName } from "./AdminIcon";

export type AdminSection = "overview" | "inventory" | "catalog";

type NavItem = {
  label: string;
  href?: string;
  icon: AdminIconName;
  active?: AdminSection;
  next?: boolean;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard", active: "overview" },
  { label: "Sales", href: "/admin#sales-summary", icon: "sales" },
  { label: "POS", href: "/pos", icon: "pos" },
  { label: "Orders", href: "/admin#recent-transactions", icon: "orders" },
  { label: "Inventory", href: "/admin/inventory", icon: "inventory", active: "inventory" },
  { label: "Products", href: "/admin/catalog", icon: "box", active: "catalog" },
];

const comingSoonNav: NavItem[] = [
  { label: "Customers", icon: "customers", next: true },
  { label: "Suppliers", icon: "suppliers", next: true },
  { label: "Expenses", icon: "expenses", next: true },
  { label: "Reports", icon: "reports", next: true },
  { label: "Employees", icon: "employees", next: true },
  { label: "Promotions", icon: "promotions", next: true },
  { label: "Settings", icon: "settings", next: true },
];

export function AdminSidebar({ branchName, active }: { branchName: string; active: AdminSection }) {
  return (
    <aside className="admin-sidebar hidden lg:flex">
      <div className="admin-sidebar__inner">
        <Link href="/admin" className="admin-brand" aria-label="Mario's Lechon House dashboard">
          <span className="admin-brand__mark"><AdminIcon name="pig" size={27} /></span>
          <span className="admin-brand__copy">
            <strong>Mario&apos;s</strong>
            <small>LECHON HOUSE</small>
          </span>
        </Link>

        <div className="admin-branch-switcher" aria-label={`Current branch: ${branchName}`}>
          <span className="admin-branch-switcher__label">Branch</span>
          <strong>{branchName}</strong>
          <AdminIcon name="chevron" size={15} />
        </div>

        <nav aria-label="Admin navigation" className="admin-nav">
          <p className="admin-nav__label">Main menu</p>
          <div className="admin-nav__group">
            {primaryNav.map((item) => item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active === active ? "page" : undefined}
                className={`admin-nav__item ${item.active === active ? "is-active" : ""}`}
              >
                <AdminIcon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.label === "Sales" && <AdminIcon name="chevron" size={14} />}
              </Link>
            ) : null)}
          </div>

          <p className="admin-nav__label admin-nav__label--secondary">Manage</p>
          <div className="admin-nav__group">
            {comingSoonNav.map((item) => (
              <span key={item.label} className="admin-nav__item is-disabled" aria-disabled="true">
                <AdminIcon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.next && <small>Next</small>}
              </span>
            ))}
          </div>
        </nav>

        <div className="admin-quick-actions">
          <p>Quick actions</p>
          <Link href="/pos"><AdminIcon name="bag" size={17} />New sale</Link>
          <Link href="/admin/catalog"><AdminIcon name="box" size={17} />Add product</Link>
          <Link href="/admin/inventory"><AdminIcon name="inventory" size={17} />Stock count</Link>
        </div>

        <div className="admin-sidebar__footer">
          <span className="admin-sidebar__status-dot" aria-hidden="true" />
          <span><strong>System online</strong><small>Supabase connected</small></span>
        </div>
      </div>
    </aside>
  );
}
