import type { ReactNode } from "react";

const HEADER_CLASS = "admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5";

export function AdminPageHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className={HEADER_CLASS}>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p>
        <h1 className="truncate text-lg font-extrabold text-primary">{title}</h1>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
