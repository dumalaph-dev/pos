import { notFound } from "next/navigation";
import StaffLoginScreen from "@/components/staff/StaffLoginScreen";
import { getStoreByStaffKey } from "@/lib/store-access";

export const dynamic = "force-dynamic";

export default async function StaffSlugLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreByStaffKey(slug);
  if (!store) notFound();

  return <StaffLoginScreen storeName={store.name} storeKey={store.staff_login_slug} />;
}
