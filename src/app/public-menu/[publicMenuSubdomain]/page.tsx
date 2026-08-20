import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicMenuClient } from "@/components/online-ordering/PublicMenuClient";
import { getPublicMenuStoreBySubdomain } from "@/lib/online-ordering-server";
import { isValidPublicMenuSubdomain, publicMenuSubdomainFromHostname, publicMenuUrl } from "@/lib/public-menu-domain";

export const dynamic = "force-dynamic";

type CustomMenuParams = { publicMenuSubdomain: string };

export async function generateMetadata({ params }: { params: Promise<CustomMenuParams> }): Promise<Metadata> {
  const { publicMenuSubdomain } = await params;
  if (publicMenuSubdomainFromHostname((await headers()).get("host")) !== publicMenuSubdomain.toLowerCase()) {
    return { title: "Menu", robots: { index: false, follow: false } };
  }
  const menu = await getPublicMenuStoreBySubdomain(publicMenuSubdomain);
  if (!menu) return { title: "Menu", robots: { index: false, follow: false } };

  const brandName = menu.settings.branding.brandName || menu.name;
  const fulfillment = menu.settings.delivery.enabled ? "pickup or delivery" : "pickup";
  const canonical = menu.publicMenuSubdomain ? publicMenuUrl(menu.publicMenuSubdomain) : null;
  return {
    title: `${brandName} · Order ahead`,
    description: `Order ahead for ${fulfillment} from ${brandName}. See your live estimate before you go.`,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title: `${brandName} · Order ahead`,
      description: `Order ahead for ${fulfillment} from ${brandName}.`,
      url: canonical ?? undefined,
    },
  };
}

export default async function CustomPublicMenuPage({ params }: { params: Promise<CustomMenuParams> }) {
  const { publicMenuSubdomain } = await params;
  if (!isValidPublicMenuSubdomain(publicMenuSubdomain)) notFound();
  if (publicMenuSubdomainFromHostname((await headers()).get("host")) !== publicMenuSubdomain.toLowerCase()) notFound();

  const menu = await getPublicMenuStoreBySubdomain(publicMenuSubdomain);
  if (!menu) notFound();
  return <PublicMenuClient menu={menu} />;
}
