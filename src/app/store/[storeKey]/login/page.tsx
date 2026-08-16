import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StaffLoginScreen from "@/components/staff/StaffLoginScreen";
import { getStoreByStaffKey } from "@/lib/store-access";

export const metadata: Metadata = {
  title: "Staff log in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StaffLoginPage({ params }: { params: Promise<{ storeKey: string }> }) {
  const { storeKey } = await params;
  const store = await getStoreByStaffKey(storeKey);
  if (!store) notFound();

  return <StaffLoginScreen storeName={store.name} storeKey={store.staff_login_key} />;
}
