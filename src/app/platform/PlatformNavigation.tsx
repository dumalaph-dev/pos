"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { platformOperatorRoleLabel, type PlatformOperatorRole } from "@/lib/platform-operators";

type PlatformNavItemDefinition = {
  label: string;
  href: string;
  icon: AdminIconName;
  detail: string;
  activePrefixes?: string[];
};

type PlatformNavGroup = {
  label: string;
  items: PlatformNavItemDefinition[];
};

const PLATFORM_NAV_GROUPS: PlatformNavGroup[] = [
  {
    label: "Command center",
    items: [
      { label: "Overview", href: "/platform", icon: "dashboard", detail: "Attention inbox and readiness" },
      { label: "Search", href: "/platform/search", icon: "search", detail: "Find an organization, user, or case" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Directory", href: "/platform/users", icon: "customers", detail: "Users and organizations", activePrefixes: ["/platform/organizations"] },
      { label: "Announcements", href: "/platform/announcements", icon: "bell", detail: "Merchant communications" },
      { label: "Support queue", href: "/platform/support", icon: "help", detail: "Case metadata and SLA timing" },
      { label: "Operations", href: "/platform/operations", icon: "refresh", detail: "Lifecycle and support" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { label: "Plans & Pricing", href: "/platform/plans", icon: "wallet", detail: "Subscription catalog" },
      { label: "Billing events", href: "/platform/billing", icon: "history", detail: "Provider receipt evidence" },
      { label: "Promo & Marketing", href: "/platform/promotions", icon: "tag", detail: "Campaign codes and performance" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { label: "Fleet health", href: "/platform/fleet", icon: "chart", detail: "Performance signals" },
      { label: "Sync & outbox", href: "/platform/sync", icon: "refresh", detail: "Branch queue health" },
      { label: "Devices & terminals", href: "/platform/devices", icon: "pos", detail: "Terminal inventory" },
    ],
  },
  {
    label: "Governance",
    items: [
      { label: "Audit log", href: "/platform/audit", icon: "history", detail: "Platform actor actions" },
      { label: "Schema drift", href: "/platform/schema", icon: "columns", detail: "Migration ledger sync" },
      { label: "Operators", href: "/platform/operators", icon: "employees", detail: "Roles and access" },
      { label: "Policies", href: "/platform/policies", icon: "lock", detail: "Operating rules" },
    ],
  },
];

const PLATFORM_NAV_ITEMS = PLATFORM_NAV_GROUPS.flatMap((group) => group.items);

export function PlatformNavigation({ userEmail, role, isBootstrap }: { userEmail: string | null | undefined; role: PlatformOperatorRole; isBootstrap: boolean }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-[#2f5943] bg-[#15382a] text-[#fffaf1] lg:flex">
        <div className="flex min-h-0 flex-1 flex-col px-3.5 py-4">
          <Link href="/platform" className="flex items-center gap-2.5 rounded-2xl px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2a15c]" aria-label="Dumala platform console home">
            <AdminBrandLogo logoUrl="/badge.png" className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-[#d2a15c]/50 bg-[#fffaf1] text-[#15382a]" iconSize={23} label="Dumala logo" fallbackIcon="pig" />
            <span className="min-w-0">
              <strong className="block truncate text-[13px] font-extrabold tracking-[-0.02em]">Dumala POS</strong>
              <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-[#aec3b3]">Platform console</span>
            </span>
          </Link>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8fd18d]" aria-hidden="true" />
              <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#d2a15c]">Global workspace</p>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-[#e8efe6]">Pricing, access, policy &amp; ops</p>
          </div>

          <form action="/platform/search" method="get" role="search" className="mt-3">
            <label htmlFor="platform-sidebar-search" className="sr-only">Search the platform</label>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 focus-within:border-[#d2a15c]/70">
              <AdminIcon name="search" size={14} />
              <input id="platform-sidebar-search" name="q" type="search" placeholder="Search platform" className="min-w-0 flex-1 bg-transparent py-1 text-[11px] font-semibold text-[#fffaf1] outline-none placeholder:text-[#8da795]" />
              <button type="submit" className="sr-only">Search</button>
            </div>
          </form>

          <nav aria-label="Platform navigation" className="platform-nav-scroll mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-3">
              {PLATFORM_NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#8da795]">{group.label}</p>
                  <div className="mt-1 space-y-0.5">
                    {group.items.map((item) => <PlatformNavItem key={item.href} item={item} pathname={pathname} />)}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="mt-4 shrink-0 border-t border-white/10 pt-3">
            <Link href="/admin" className="flex min-h-9 items-center gap-2 rounded-xl px-2.5 text-[11px] font-extrabold text-[#aec3b3] transition hover:bg-white/10 hover:text-[#fffaf1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2a15c]"><AdminIcon name="arrow" size={14} /> Merchant workspace</Link>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d2a15c] text-[9px] font-extrabold text-[#15382a]">{getInitials(userEmail)}</span>
              <span className="min-w-0"><span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#8da795]">{platformOperatorRoleLabel(role)}{isBootstrap ? " · bootstrap" : ""}</span><span className="mt-0.5 block truncate text-xs font-bold text-[#fffaf1]" title={userEmail ?? "Platform operator"}>{userEmail ?? "Platform operator"}</span></span>
            </div>
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-30 border-b border-[#2f5943] bg-[#15382a] text-[#fffaf1] lg:hidden">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
          <Link href="/platform" className="flex min-w-0 items-center gap-2.5" aria-label="Dumala platform console home">
            <AdminBrandLogo logoUrl="/badge.png" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#d2a15c]/50 bg-[#fffaf1] text-[#15382a]" iconSize={20} label="Dumala logo" fallbackIcon="pig" />
            <span className="min-w-0"><strong className="block truncate text-sm font-extrabold">Dumala POS</strong><span className="block text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#aec3b3]">Platform console</span></span>
          </Link>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d2a15c] text-[10px] font-extrabold text-[#15382a]" title={`${platformOperatorRoleLabel(role)}${isBootstrap ? " bootstrap" : ""} · ${userEmail ?? "Platform operator"}`}>{getInitials(userEmail)}</span>
        </div>
        <form action="/platform/search" method="get" role="search" className="px-3 pb-3">
          <label htmlFor="platform-mobile-search" className="sr-only">Search the platform</label>
          <div className="flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 focus-within:border-[#d2a15c]/70">
            <AdminIcon name="search" size={14} />
            <input id="platform-mobile-search" name="q" type="search" placeholder="Search platform" className="min-w-0 flex-1 bg-transparent py-1.5 text-[11px] font-semibold text-[#fffaf1] outline-none placeholder:text-[#8da795]" />
            <button type="submit" className="sr-only">Search</button>
          </div>
        </form>
        <nav aria-label="Platform navigation" className="platform-nav-scroll flex gap-1 overflow-x-auto px-3 pb-3">
          {PLATFORM_NAV_ITEMS.map((item) => <PlatformNavItem key={item.href} item={item} pathname={pathname} compact />)}
        </nav>
      </div>
    </>
  );
}

function PlatformNavItem({ item, pathname, compact = false }: { item: PlatformNavItemDefinition; pathname: string | null; compact?: boolean }) {
  const active = pathname === item.href
    || item.activePrefixes?.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`))
    || (item.href !== "/platform" && pathname?.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.detail}
      className={compact
        ? `inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2a15c] ${active ? "bg-[#d2a15c] text-[#15382a]" : "bg-white/[0.06] text-[#aec3b3] hover:bg-white/10 hover:text-[#fffaf1]"}`
        : `group flex min-h-9 items-center gap-2.5 rounded-[11px] px-2.5 text-[12px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2a15c] ${active ? "bg-[#d2a15c] text-[#15382a] shadow-[0_7px_16px_rgba(0,0,0,0.12)]" : "text-[#aec3b3] hover:bg-white/10 hover:text-[#fffaf1]"}`}
    >
      <span className={compact ? "" : `grid h-6 w-6 shrink-0 place-items-center rounded-lg ${active ? "bg-[#15382a]/10 text-[#15382a]" : "bg-white/[0.06] text-[#d2a15c]"}`}><AdminIcon name={item.icon} size={compact ? 14 : 15} /></span>
      <span className="min-w-0 flex-1 whitespace-nowrap">
        <span className="block truncate">{item.label}</span>
        {!compact && item.href === "/platform" && <span className={`mt-0.5 block truncate text-[10px] font-semibold ${active ? "text-[#15382a]/65" : "text-[#8da795]"}`}>Attention inbox & readiness</span>}
      </span>
    </Link>
  );
}

function getInitials(value: string | null | undefined) {
  const parts = (value ?? "Platform admin").split(/[@.\s_-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "PA";
}
