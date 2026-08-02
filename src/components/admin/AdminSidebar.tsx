import Link from "next/link";
import { AdminIcon, type AdminIconName } from "./AdminIcon";

export type AdminSection = "overview" | "orders" | "inventory" | "catalog" | "employees" | "reports" | "settings" | "promotions";

type NavItem = {
  label: string;
  href?: string;
  icon: AdminIconName;
  active?: AdminSection;
  next?: boolean;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard", active: "overview" },
  { label: "Sales", href: "/admin/reports?range=7d", icon: "sales" },
  { label: "POS", href: "/pos", icon: "pos" },
  { label: "Orders", href: "/admin/orders", icon: "orders", active: "orders" },
  { label: "Inventory", href: "/admin/inventory", icon: "inventory", active: "inventory" },
  { label: "Products", href: "/admin/catalog", icon: "box", active: "catalog" },
];

const comingSoonNav: NavItem[] = [
  { label: "Customers", icon: "customers", next: true },
  { label: "Suppliers", icon: "suppliers", next: true },
  { label: "Expenses", icon: "expenses", next: true },
  { label: "Reports", href: "/admin/reports", icon: "reports", active: "reports" },
  { label: "Employees", href: "/admin/employees", icon: "employees", active: "employees" },
  { label: "Promotions", href: "/admin/promotions", icon: "promotions", active: "promotions" },
  { label: "Settings", href: "/admin/settings", icon: "settings", active: "settings" },
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
          <span className="admin-branch-switcher__label">Current branch</span>
          <strong>{branchName}</strong>
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
              </Link>
            ) : null)}
          </div>

          <p className="admin-nav__label admin-nav__label--secondary">Manage</p>
          <div className="admin-nav__group">
            {comingSoonNav.map((item) => item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active === active ? "page" : undefined}
                className={`admin-nav__item ${item.active === active ? "is-active" : ""}`}
              >
                <AdminIcon name={item.icon} size={18} />
                <span>{item.label}</span>
              </Link>
            ) : (
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

        <Link href="/admin/settings#devices" className="admin-sidebar__footer" aria-label="Open terminal settings">
          <span className="admin-sidebar__footer-icon" aria-hidden="true"><AdminIcon name="settings" size={16} /></span>
          <span><strong>Terminal settings</strong><small>Manage devices</small></span>
        </Link>
      </div>
    </aside>
  );
}
