import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";

export function PlatformPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PlatformMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon?: "dashboard" | "customers" | "employees" | "wallet" | "lock" | "refresh";
}) {
  return (
    <article className="rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-pop)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{label}</p>
        {icon && <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={15} /></span>}
      </div>
      <p className="mt-4 text-3xl font-extrabold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{detail}</p>
    </article>
  );
}

export function PlatformSectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{eyebrow}</p>}
        <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em]">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PlatformMigrationNotice({ migrations = ["0027_platform_operations.sql"] }: { migrations?: string[] }) {
  return (
    <div role="status" className="mt-6 rounded-[18px] border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold leading-6 text-ink">
      Platform operations is showing safe defaults or locked controls because the latest database migrations are not fully available. Apply {migrations.map((migration) => <code key={migration} className="mx-1 font-extrabold">{migration}</code>)} before using the complete console.
    </div>
  );
}

export function PlatformStatusBadge({ status, label }: { status: "active" | "suspended" | "published" | "draft"; label?: string }) {
  const styles = {
    active: "bg-success/10 text-success",
    suspended: "bg-danger-soft text-danger",
    published: "bg-success/10 text-success",
    draft: "bg-warning/15 text-ink",
  } as const;

  const labels = {
    active: "Active",
    suspended: "Suspended",
    published: "Published",
    draft: "Draft",
  } as const;

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${styles[status]}`}>{label ?? labels[status]}</span>;
}

export function PlatformAccessDenied() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-[22px] border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-danger-soft text-danger"><AdminIcon name="lock" size={22} /></span>
        <h1 className="mt-5 text-2xl font-extrabold">Platform access is restricted</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">This account is not on the platform administrator allowlist.</p>
        <Link href="/login" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Back to owner login</Link>
      </div>
    </main>
  );
}

export function PlatformUnavailable({ detail }: { detail: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-[22px] border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-warning/15 text-accent"><AdminIcon name="alert" size={22} /></span>
        <h1 className="mt-5 text-2xl font-extrabold">Platform console unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p>
      </div>
    </main>
  );
}
