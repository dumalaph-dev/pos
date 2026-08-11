import CustomerDisplayScreen from "@/components/display/CustomerDisplayScreen";

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
