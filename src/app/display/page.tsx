import type { Metadata } from "next";
import CustomerDisplayScreen from "@/components/display/CustomerDisplayScreen";

// The customer-facing second screen. It renders a live order for whoever is
// standing at the counter, not a page anyone should arrive at from search.
export const metadata: Metadata = {
  title: "Customer display",
  robots: { index: false, follow: false },
};

function readPairingToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ pair?: string | string[] }>;
}) {
  const params = await searchParams;
  return <CustomerDisplayScreen pairingToken={readPairingToken(params.pair)} />;
}
