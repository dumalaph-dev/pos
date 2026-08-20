import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicMenuStoreBySlug } from "@/lib/online-ordering-server";
import { PublicMenuClient } from "@/components/online-ordering/PublicMenuClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ storeSlug: string }> }): Promise<Metadata> {
  const { storeSlug } = await params;
  const menu = await getPublicMenuStoreBySlug(storeSlug);
  if (!menu) return { title: "Menu", robots: { index: false, follow: false } };
  const brandName = menu.settings.branding.brandName || menu.name;
  return {
    title: `${brandName} · Order ahead`,
    description: `Order ahead for pickup from ${brandName}. See the live pickup estimate before you leave.`,
    openGraph: { title: `${brandName} · Order ahead`, description: `Order ahead for pickup from ${brandName}.` },
  };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const menu = await getPublicMenuStoreBySlug(storeSlug);
  if (!menu) notFound();
  return <PublicMenuClient menu={menu} />;
}
