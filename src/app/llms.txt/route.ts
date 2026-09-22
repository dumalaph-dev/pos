import { legalDocumentLinks } from "@/lib/legal-config";
import { formatPeso } from "@/lib/money";
import {
  DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS,
  DEFAULT_INCLUDED_BRANCH_COUNT,
  DEFAULT_MONTHLY_PRICE_CENTAVOS,
} from "@/lib/platform-operations";
import { readCachedPlatformBillingCatalog } from "@/lib/platform-operations-server";
import { buildBranchPricingCopy } from "@/lib/pricing-content";
import { absoluteUrl } from "@/lib/site-url";

/**
 * A plain-text brief for AI answer engines (the llms.txt convention).
 *
 * Assistants that answer "what's a good POS for a cafe in the Philippines?"
 * quote short, factual, self-contained statements. The landing page carries
 * the same facts, but wrapped in 300 KB of markup, animation, and a client
 * playground. This gives them the facts directly.
 *
 * Price comes from the same cached billing catalog as the landing page, so a
 * price change cannot leave this file quoting a stale number.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await readCachedPlatformBillingCatalog();
  const pricing = {
    monthlyPriceCentavos: catalog?.monthlyPriceCentavos ?? DEFAULT_MONTHLY_PRICE_CENTAVOS,
    additionalBranchPriceCentavos: catalog?.additionalBranchPriceCentavos ?? DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS,
    includedBranchCount: catalog?.includedBranchCount ?? DEFAULT_INCLUDED_BRANCH_COUNT,
  };
  const branchCopy = buildBranchPricingCopy(pricing);

  const body = `# Dumala POS

> Dumala POS is an offline-first point-of-sale (POS), online menu, and owner workspace for Philippine cafes, restaurants, coffee shops, bakeshops, and other counter-service food businesses. It runs in a web browser on Android, iOS, Windows, and macOS.

## Key facts

- Price: ${formatPeso(pricing.monthlyPriceCentavos)} per month for the complete workspace. No feature tiers, per-terminal fees, or per-staff fees. ${branchCopy.summary}
- Free trial: 14 days, no card required.
- Offline-first: each sale is saved on the device first and syncs to the cloud when a connection is available.
- Payments recorded: cash, GCash, Maya, and card.
- Discounts: senior citizen and PWD discounts with ID capture.
- Items: fixed-price and by-weight items on the same ticket.
- Printing: ESC/POS receipt printers over Wi-Fi/LAN (via a local bridge), Bluetooth Low Energy (Chrome on Android), or USB (Chrome or Edge); 52mm, 58mm, and 80mm paper.
- Online menu: a public mobile menu per branch with pickup, delivery, and scheduled orders, shareable as a link, QR code, or custom subdomain.
- Owner workspace: daily and period reports, multi-branch view, inventory, expenses, shifts, staff access, and CSV export.

## Pages

- [Home](${absoluteUrl("/")}): product overview and FAQ
- [Pricing](${absoluteUrl("/pricing")}): plans, annual options, and billing FAQ
- [Start a free trial](${absoluteUrl("/signup")})

## Legal

${legalDocumentLinks.map((document) => `- [${document.label}](${absoluteUrl(document.href)})`).join("\n")}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
