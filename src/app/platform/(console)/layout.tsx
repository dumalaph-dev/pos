import { redirect } from "next/navigation";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { PlatformAccessDenied } from "../PlatformUI";
import { PlatformNavigation } from "../PlatformNavigation";

export const dynamic = "force-dynamic";

export default async function PlatformConsoleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/platform/login");
  if (!isPlatformAdminEmail(user.email)) return <PlatformAccessDenied />;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <PlatformNavigation userEmail={user.email} />
      <div className="min-h-screen lg:pl-[248px]">{children}</div>
    </div>
  );
}
