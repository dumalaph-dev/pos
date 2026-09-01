"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { platformOperatorRoleLabel, type PlatformOperatorRole } from "@/lib/platform-operators";

const PLATFORM_NAV_ITEMS: Array<{ label: string; href: string; icon: AdminIconName; detail: string }> = [
  { label: "Overview", href: "/platform", icon: "dashboard", detail: "Command center" },
  { label: "Plans & Pricing", href: "/platform/plans", icon: "wallet", detail: "Subscription catalog" },
  { label: "Promo & Marketing", href: "/platform/promotions", icon: "tag", detail: "Campaign codes & performance" },
  { label: "Directory", href: "/platform/users", icon: "customers", detail: "Users & organizations" },
  { label: "Audit log", href: "/platform/audit", icon: "history", detail: "Platform actor actions" },
  { label: "Operators", href: "/platform/operators", icon: "employees", detail: "Roles & access" },
  { label: "Policies", href: "/platform/policies", icon: "lock", detail: "Operating rules" },
  { label: "Operations", href: "/platform/operations", icon: "refresh", detail: "Lifecycle & support" },
];

export function PlatformNavigation({ userEmail, role, isBootstrap }: { userEmail: string | null | undefined; role: PlatformOperatorRole; isBootstrap: boolean }) {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#2f5943] bg-[#15382a] text-[#fffaf1] lg:flex">
        <div className="flex min-h-0 flex-1 flex-col px-4 py-5">
          <Link href="/platform" className="flex items-center gap-3 rounded-2xl px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2a15c]" aria-label="Dumala platform console home">
            <AdminBrandLogo logoUrl="/badge.png" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#d2a15c]/50 bg-[#fffaf1] text-[#15382a]" iconSize={25} label="Dumala logo" fallbackIcon="pig" />
            <span className="min-w-0">
              <strong className="block truncate text-sm font-extrabold tracking-[-0.02em]">Dumala POS</strong>
              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#aec3b3]">Platform console</span>
            </span>
          </Link>

          <div className="mt-7 rounded-[18px] border border-white/10 bg-white/[0.06] px-3.5 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#d2a15c]">Global workspace</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#e8efe6]">Pricing, access, policy, and account controls</p>
          </div>

          <nav aria-label="Platform navigation" className="mt-7 min-h-0 flex-1 overflow-y-auto">
            <p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#8da795]">Manage</p>
            <div className="mt-2 space-y-1.5">
              {PLATFORM_NAV_ITEMS.map((item) => <PlatformNavItem key={item.href} item={item} pathname={pathname} />)}
            </div>
          </nav>

          <div className="mt-5 border-t border-white/10 pt-4">
            <Link href="/admin" className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold text-[#aec3b3] transition hover:bg-white/10 hover:text-[#fffaf1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2a15c]"><AdminIcon name="arrow" size={15} /> View owner dashboard</Link>
            <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d2a15c] text-[10px] font-extrabold text-[#15382a]">{getInitials(userEmail)}</span>
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
        <nav aria-label="Platform navigation" className="flex gap-1 overflow-x-auto px-3 pb-3">
          {PLATFORM_NAV_ITEMS.map((item) => <PlatformNavItem key={item.href} item={item} pathname={pathname} compact />)}
        </nav>
      </div>
    </>
  );
}

function PlatformNavItem({ item, pathname, compact = false }: { item: (typeof PLATFORM_NAV_ITEMS)[number]; pathname: string | null; compact?: boolean }) {
  const active = pathname === item.href || (item.href !== "/platform" && pathname?.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.detail}
      className={compact
        ? `inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-extrabold transition ${active ? "bg-[#d2a15c] text-[#15382a]" : "bg-white/[0.06] text-[#aec3b3] hover:bg-white/10 hover:text-[#fffaf1]"}`
        : `group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2a15c] ${active ? "bg-[#d2a15c] text-[#15382a] shadow-[0_8px_18px_rgba(0,0,0,0.12)]" : "text-[#aec3b3] hover:bg-white/10 hover:text-[#fffaf1]"}`}
    >
      <span className={compact ? "" : active ? "text-[#15382a]" : "text-[#d2a15c]"}><AdminIcon name={item.icon} size={compact ? 14 : 17} /></span>
      <span className="whitespace-nowrap">{item.label}</span>
      {!compact && <span className="ml-auto hidden text-[10px] font-bold text-current/55 xl:block">{item.detail}</span>}
    </Link>
  );
}

function getInitials(value: string | null | undefined) {
  const parts = (value ?? "Platform admin").split(/[@.\s_-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "PA";
}
