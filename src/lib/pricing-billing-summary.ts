import { payMongoConfiguration } from "@/lib/platform-operations-server";

/**
 * What the public pricing page is allowed to say about paying.
 *
 * Derived from the same flags the checkout routes read, rather than written as
 * prose on the page. A pricing page that advertises card and Maya billing
 * before PayMongo has activated Subscriptions for this account is a promise the
 * product cannot keep at the moment the visitor tries to pay, and the flags are
 * exactly where that state already lives.
 *
 * Server-only: `payMongoConfiguration` reads non-public environment variables.
 * Call this in a Server Component and pass the result down.
 */
export type BillingSummary = {
  methods: Array<{ name: string; detail: string }>;
  /** True once recurring billing is live, so copy can stop saying "prepaid". */
  recurring: boolean;
  note: string;
};

export function readBillingSummary(): BillingSummary {
  const { subscriptionsEnabled, temporaryQrPhEnabled } = payMongoConfiguration();
  const methods: BillingSummary["methods"] = [];

  if (subscriptionsEnabled) {
    methods.push({
      name: "Card or Maya",
      detail: "Billed automatically each term through PayMongo. Cancel any time from Billing in your workspace.",
    });
  }

  if (temporaryQrPhEnabled) {
    methods.push({
      name: "QR Ph",
      detail: subscriptionsEnabled
        ? "Scan and pay from any QR Ph bank or e-wallet app for a single prepaid term."
        : "Scan and pay from any QR Ph bank or e-wallet app. Each payment prepays one term, and we email you before it runs out.",
    });
  }

  return {
    methods,
    recurring: subscriptionsEnabled,
    note: subscriptionsEnabled
      ? "Payments are processed by PayMongo. Dumala never stores your full card number."
      : "Payments are processed by PayMongo. Automatic recurring billing is being switched on; until then each payment prepays a term, so nothing renews without you.",
  };
}
