import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByStaffKey } from "@/lib/store-access";
import StaffLoginForm from "./StaffLoginForm";

export const dynamic = "force-dynamic";

export default async function StaffLoginPage({ params }: { params: Promise<{ storeKey: string }> }) {
  const { storeKey } = await params;
  const store = await getStoreByStaffKey(storeKey);
  if (!store) notFound();

  return (
    <main className="min-h-full flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Staff access</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">{store.name}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Use your Employee ID and private password to open this store workspace.</p>
        <StaffLoginForm storeKey={store.staff_login_key} />
        <div className="mt-7 border-t border-line pt-5 text-center">
          <p className="text-xs leading-5 text-ink-muted">This link is for managers and staff assigned to this store. Ask your owner if you need access.</p>
          <Link href="/login" className="mt-3 inline-flex text-sm font-bold text-primary hover:underline">Owner sign in</Link>
        </div>
      </div>
    </main>
  );
}
