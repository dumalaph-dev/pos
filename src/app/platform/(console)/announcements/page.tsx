import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { hasPlatformOperatorPermission } from "@/lib/platform-operators";
import { readPlatformAnnouncements } from "@/lib/platform-announcements-server";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformAccessDenied, PlatformMigrationNotice, PlatformPageHeader, PlatformMetric } from "../../PlatformUI";
import { PlatformAnnouncementEditor } from "../../PlatformAnnouncementEditor";

export const dynamic = "force-dynamic";

export default async function PlatformAnnouncementsPage({ searchParams }: { searchParams: Promise<{ edit?: string | string[] }> }) {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }

  const result = await readPlatformAnnouncements(actor.admin);
  const query = await searchParams;
  const editId = typeof query.edit === "string" ? query.edit : null;
  const editing = editId ? result.announcements.find((announcement) => announcement.id === editId) ?? null : null;
  const active = result.announcements.filter((announcement) => announcement.status === "published" || announcement.status === "scheduled").length;
  const drafts = result.announcements.filter((announcement) => announcement.status === "draft").length;
  const canManage = hasPlatformOperatorPermission(actor.role, "policy_manage");

  return <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-[1440px]">
    <PlatformPageHeader eyebrow="Communication workspace" title="Announcement center" description="Draft, schedule, and retire the messages that keep merchant workspaces informed about product changes and operational windows." actions={<><Link href="/platform" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="dashboard" size={14} /> Overview</Link><Link href="/platform/policies" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="lock" size={14} /> Review policies</Link></>} />
    {!result.schemaAvailable && <PlatformMigrationNotice migrations={["0085_platform_announcements.sql"]} />}
    <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Announcement summary"><PlatformMetric label="Active messages" value={active} detail="Published or scheduled" icon="bell" /><PlatformMetric label="Drafts" value={drafts} detail="Visible to platform operators" icon="edit" /><PlatformMetric label="History" value={result.announcements.length} detail="Messages retained" icon="history" /></section>
    <PlatformAnnouncementEditor key={editing?.id ?? "new"} announcements={result.announcements} schemaAvailable={result.schemaAvailable} canManage={canManage} editing={editing} />
  </div></main>;
}
