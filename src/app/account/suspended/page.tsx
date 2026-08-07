import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { createAdminClient } from "@/lib/employee-auth";
import { readPolicyText } from "@/lib/platform-operations";
import { readPlatformPolicies } from "@/lib/platform-operations-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SuspendedAccountPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (!profile) redirect("/");
  if (profile.organizations?.account_status !== "suspended") redirect(profile.role === "cashier" ? "/pos" : "/admin");

  const admin = createAdminClient();
  let supportEmail = "";
  if (admin) {
    const policies = await readPlatformPolicies(admin);
    if (policies.support.status === "published") supportEmail = readPolicyText(policies.support, "supportEmail");
  }

  const organizationName = profile.organizations?.name ?? "Your organization";
  const reason = profile.organizations?.suspension_reason?.trim() || "No additional reason was provided.";
  const suspendedAt = formatDate(profile.organizations?.suspended_at ?? null);

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-ink">
      <section className="w-full max-w-xl rounded-card border border-danger/25 bg-surface p-7 text-center shadow-[var(--shadow-pop)] sm:p-9" aria-labelledby="suspended-heading">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger"><AdminIcon name="lock" size={25} /></span>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-danger">Account access paused</p>
        <h1 id="suspended-heading" className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">{organizationName} is suspended</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Your organization workspace is temporarily unavailable. Existing billing checkout is also blocked until a platform administrator restores access.</p>

        <dl className="mt-6 divide-y divide-line rounded-card border border-line bg-raised text-left">
          <div className="flex items-start justify-between gap-4 px-4 py-3"><dt className="text-xs font-semibold text-ink-muted">Reason</dt><dd className="max-w-[70%] text-right text-sm font-extrabold text-ink">{reason}</dd></div>
          <div className="flex items-start justify-between gap-4 px-4 py-3"><dt className="text-xs font-semibold text-ink-muted">Suspended</dt><dd className="text-right text-sm font-extrabold text-ink">{suspendedAt}</dd></div>
        </dl>

        <div className="mt-6 rounded-card border border-primary/15 bg-primary-soft px-4 py-4 text-left text-sm leading-6 text-ink-muted">
          <strong className="block text-ink">Need to appeal or ask a question?</strong>
          <span className="mt-1 block">{supportEmail ? <>Email <a href={`mailto:${supportEmail}`} className="font-extrabold text-primary underline underline-offset-2">{supportEmail}</a> and include your business name.</> : "Contact the platform administrator and include your business name so the account can be reviewed."}</span>
        </div>

        <div className="mt-6 flex justify-center"><SignOutButton className="px-4 py-3" /></div>
      </section>
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}
