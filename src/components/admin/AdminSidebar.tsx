import Link from "next/link";

export type AdminSection = "overview" | "inventory";

export function AdminSidebar({
  branchName,
  active,
}: {
  branchName: string;
  active: AdminSection;
}) {
  const upcoming = ["Branches", "Products", "Orders", "Staff"];

  return (
    <aside className="hidden border-r border-line bg-sidebar lg:block">
      <div className="sticky top-0 flex h-screen flex-col p-5">
        <Link href="/admin" className="flex items-center gap-3 rounded-btn p-2 transition hover:bg-primary-soft">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-xl text-primary" aria-hidden="true">◉</span>
          <span className="min-w-0">
            <strong className="block truncate text-sm font-extrabold tracking-tight text-primary">Mario&apos;s Lechon</strong>
            <small className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">House · Backoffice</small>
          </span>
        </Link>

        <p className="mt-10 px-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-subtle">Workspace</p>
        <nav aria-label="Admin navigation" className="mt-3 space-y-1">
          <Link
            href="/admin"
            aria-current={active === "overview" ? "page" : undefined}
            className={`flex items-center gap-3 rounded-btn px-3 py-3 text-sm font-extrabold transition ${active === "overview" ? "bg-primary text-primary-fg shadow-[var(--shadow-card)]" : "text-ink-muted hover:bg-primary-soft hover:text-primary"}`}
          >
            <span className={`grid h-6 w-6 place-items-center rounded-lg text-xs ${active === "overview" ? "bg-primary-fg/15" : "border border-line text-ink-subtle"}`} aria-hidden="true">▪</span>
            Overview
          </Link>
          <Link
            href="/admin/inventory"
            aria-current={active === "inventory" ? "page" : undefined}
            className={`flex items-center gap-3 rounded-btn px-3 py-3 text-sm font-extrabold transition ${active === "inventory" ? "bg-primary text-primary-fg shadow-[var(--shadow-card)]" : "text-ink-muted hover:bg-primary-soft hover:text-primary"}`}
          >
            <span className={`grid h-6 w-6 place-items-center rounded-lg text-xs ${active === "inventory" ? "bg-primary-fg/15" : "border border-line text-ink-subtle"}`} aria-hidden="true">▦</span>
            Inventory
          </Link>
          {upcoming.map((item) => (
            <div key={item} className="flex items-center justify-between rounded-btn px-3 py-3 text-sm font-bold text-ink-muted">
              <span className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-lg border border-line text-[10px] text-ink-subtle" aria-hidden="true">·</span>{item}</span>
              <small className="rounded-pill bg-secondary px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary">Next</small>
            </div>
          ))}
        </nav>

        <div className="mt-auto rounded-card border border-line bg-surface p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">Current scope</p>
          <strong className="mt-2 block truncate text-sm font-extrabold text-ink">{branchName}</strong>
          <span className="mt-1 block text-xs text-ink-muted">Data is protected by Supabase RLS.</span>
          <Link href="/pos" className="mt-4 flex items-center justify-center rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Open POS</Link>
        </div>
      </div>
    </aside>
  );
}
