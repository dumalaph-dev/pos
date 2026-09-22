import { AdminIcon } from "./AdminIcon";
import { AdminLink as Link } from "./AdminLink";
import { platformAnnouncementSeverityLabel, type TenantPlatformAnnouncement } from "@/lib/platform-announcements";

export function PlatformAnnouncementNotice({ announcements }: { announcements: TenantPlatformAnnouncement[] }) {
  if (announcements.length === 0) return null;

  return (
    <section className="admin-panel mt-5 overflow-hidden border-primary/20" aria-labelledby="platform-announcements-heading">
      <div className="flex flex-col gap-3 border-b border-line bg-primary-soft/45 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="admin-panel__eyebrow">Platform updates</p>
          <h2 id="platform-announcements-heading" className="admin-panel__title">Important updates for your workspace</h2>
          <p className="admin-panel__subtitle">Current messages from the Dumala platform team.</p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-extrabold text-primary">
          <AdminIcon name="bell" size={13} />
          {announcements.length} active
        </span>
      </div>

      <div className="divide-y divide-line">
        {announcements.map((announcement) => <AnnouncementNoticeRow key={announcement.id} announcement={announcement} />)}
      </div>
    </section>
  );
}

function AnnouncementNoticeRow({ announcement }: { announcement: TenantPlatformAnnouncement }) {
  const actionLabel = announcement.actionLabel || "Open update";
  const actionUrl = announcement.actionUrl;
  const severityClass = announcement.severity === "critical"
    ? "bg-danger-soft text-danger"
    : announcement.severity === "warning"
      ? "bg-warning/15 text-ink"
      : announcement.severity === "success"
        ? "bg-success/10 text-success"
        : "bg-primary-soft text-primary";

  return (
    <article className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="min-w-0">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${severityClass}`}>
          {platformAnnouncementSeverityLabel(announcement.severity)}
        </span>
        <h3 className="mt-2 text-sm font-extrabold text-ink">{announcement.title}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{announcement.body}</p>
      </div>
      {actionUrl && isSafeAnnouncementUrl(actionUrl) && (
        isInternalAnnouncementUrl(actionUrl)
          ? <Link href={actionUrl} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{actionLabel}<AdminIcon name="arrow" size={13} /></Link>
          : <a href={actionUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{actionLabel}<AdminIcon name="arrow" size={13} /></a>
      )}
    </article>
  );
}

function isInternalAnnouncementUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
}

function isSafeAnnouncementUrl(value: string) {
  return isInternalAnnouncementUrl(value) || /^https:\/\//i.test(value);
}
