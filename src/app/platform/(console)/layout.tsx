import { redirect } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformAccessDenied } from "../PlatformUI";
import { PlatformNavigation } from "../PlatformNavigation";

export const dynamic = "force-dynamic";

export default async function PlatformConsoleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <PlatformNavigation userEmail={actor.email} role={actor.role} isBootstrap={actor.isBootstrap} />
      <div className="min-h-screen lg:pl-[248px]">{children}</div>
    </div>
  );
}
