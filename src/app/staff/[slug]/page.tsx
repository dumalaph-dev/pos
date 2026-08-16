import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StaffLoginScreen from "@/components/staff/StaffLoginScreen";
import { getStoreByStaffKey } from "@/lib/store-access";

// A per-branch staff login reached from a private access link. A valid slug
// returns 200, so this needs the directive as well as the robots.ts disallow.
export const metadata: Metadata = {
  title: "Staff log in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StaffSlugLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreByStaffKey(slug);
  if (!store) notFound();

  return <StaffLoginScreen storeName={store.name} storeKey={store.staff_login_slug} />;
}
