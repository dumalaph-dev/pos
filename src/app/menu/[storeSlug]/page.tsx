import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicMenuStoreForHostname } from "@/lib/online-ordering-server";
import { PublicMenuClient } from "@/components/online-ordering/PublicMenuClient";
import { publicMenuUrl } from "@/lib/public-menu-domain";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ storeSlug: string }> }): Promise<Metadata> {
  const { storeSlug } = await params;
  const menu = await getPublicMenuStoreForHostname(storeSlug, (await headers()).get("host"));
  if (!menu) return { title: "Menu", robots: { index: false, follow: false } };
  const brandName = menu.settings.branding.brandName || menu.name;
  const fulfillment = menu.settings.delivery.enabled ? "pickup or delivery" : "pickup";
  const canonical = menu.publicMenuSubdomain ? publicMenuUrl(menu.publicMenuSubdomain) : null;
  return {
    title: `${brandName} · Order ahead`,
    description: `Order ahead for ${fulfillment} from ${brandName}. See your live estimate before you go.`,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title: `${brandName} · Order ahead`, description: `Order ahead for ${fulfillment} from ${brandName}.`, url: canonical ?? undefined },
  };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const menu = await getPublicMenuStoreForHostname(storeSlug, (await headers()).get("host"));
  if (!menu) notFound();
  return <PublicMenuClient menu={menu} />;
}
