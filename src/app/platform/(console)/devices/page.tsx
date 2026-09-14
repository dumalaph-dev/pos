import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformDeviceInventory } from "../../PlatformDeviceInventory";
import { PlatformAccessDenied, PlatformPageHeader, PlatformUnavailable } from "../../PlatformUI";
import { readPlatformDevices } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformDevicesPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  if (!actor.admin) return <PlatformUnavailable detail="Device inventory needs the platform database connection." />;

  const result = await readPlatformDevices(actor.admin);
  return <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
    <div className="mx-auto max-w-[1440px]">
      <PlatformPageHeader eyebrow="Operational readiness" title="Devices & terminals" description="Find a branch terminal, check its last heartbeat, and see which local queues need attention." actions={<Link href="/platform/sync" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-4 py-2 text-xs font-extrabold text-primary focus-visible:outline-2 focus-visible:outline-primary">Branch sync overview</Link>} />
      <PlatformDeviceInventory {...result} />
      <aside className="mt-6 rounded-[22px] border border-primary/15 bg-primary-soft/45 p-5 text-xs leading-6 text-ink-muted">
        <h2 className="text-sm font-extrabold text-ink">Reading terminal health</h2>
        <p className="mt-2">Clients report while the app is open, normally every five minutes. A queue is stale after 30 minutes without a heartbeat; pending work older than 15 minutes needs attention. A stale report can mean a closed browser or a disconnected tablet. It does not prove the device is offline.</p>
        <p className="mt-2">This view shows device identities and queue counters. For a failed queue, check the terminal’s connection and sync controls. Keep browser storage intact while work is pending.</p>
      </aside>
    </div>
  </main>;
}
