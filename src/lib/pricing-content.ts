import { calculateSubscriptionMonthlyTotal, type SubscriptionCatalogPricing } from "@/lib/branch-billing-pricing";
import { formatPeso } from "@/lib/money";

/**
 * Pricing copy shared by the landing page's `#pricing` section and the
 * standalone `/pricing` route.
 *
 * It lives here rather than in either page so the two cannot drift: a visitor
 * who compares the section against the full page and finds different claims
 * has been given a reason not to trust either.
 */

/** The bullet list inside the price card. Kept short — the detail is below. */
export const PRICING_INCLUDES = [
  "The complete counter POS and owner workspace",
  "Public mobile menus with order-ahead flows",
  "Selling through internet interruptions with automatic sync",
  "Included branch capacity with clear add-on pricing",
  "Compatible ESC/POS order-slip printing over Wi-Fi/LAN, BLE, or USB",
  "Inventory, suppliers, and expense tracking",
  "Sales reports and CSV export",
  "Shifts, cash counts, and the audit log",
  "Owner, manager, and cashier access",
];

/**
 * The same scope as PRICING_INCLUDES, said properly. The card needs one line
 * per item; a pricing page has room to answer "what does that actually mean",
 * which is most of what makes the page worth its own URL.
 */
export const PRICING_DETAIL: Array<{ title: string; detail: string }> = [
  {
    title: "The online menu",
    detail:
      "Publish a mobile-first menu for each branch, accept pickup or enabled delivery orders, let customers schedule ahead, and share the menu through a public link, QR code, or custom branch subdomain.",
  },
  {
    title: "The counter POS",
    detail:
      "Fixed-price and by-weight items on one ticket, senior and PWD discounts with ID capture, held orders, and recorded cash, GCash, Maya, or card payments, plus void or refund with a reason.",
  },
  {
    title: "The owner workspace",
    detail:
      "Daily and period sales reports, inventory and stock movements, suppliers, expenses, customers, promotions, shifts and cash counts, and an audit log of who changed what.",
  },
  {
    title: "Your branch capacity",
    detail:
      "The base subscription includes the configured number of active branches. Additional active branches use the published add-on rate shown in the pricing example above. Each branch keeps its own catalog, settings, printer, and staff, and the owner gets a consolidated view across all of them.",
  },
  {
    title: "Every person on your team",
    detail:
      "No per-seat charge. Owner, manager, and cashier roles, each with their own login, and a branch access link so staff can sign in on the terminal without an email account.",
  },
  {
    title: "Offline selling",
    detail:
      "Orders are written to the device before they need the network and sync when the connection returns. A brownout or a dropped connection does not stop the counter.",
  },
  {
    title: "Your existing printer",
    detail:
      "Use a compatible ESC/POS printer in 52mm, 58mm, or 80mm widths. Network printers need Dumala's local bridge on the same LAN; Bluetooth requires BLE and Chrome on Android; USB uses WebUSB in Chrome or Edge.",
  },
  {
    title: "Setup and updates",
    detail:
      "No setup fee and no installation visit. Product updates are included, and the workspace installs to a tablet or desktop home screen from the browser.",
  },
];

/**
 * The differentiator that is currently unsaid anywhere on the site. Most POS
 * vendors in this market price per terminal, per branch, or per seat, so an
 * owner comparing options is doing arithmetic these lines pre-empt.
 */
export const PRICING_EXCLUSIONS: Array<{ title: string; detail: string }> = [
  {
    title: "No per-terminal fee",
    detail: "Run one tablet or six at the same branch for the same price.",
  },
  {
    title: "Clear branch pricing",
    detail: "The included branch capacity and the add-on rate for additional active branches are shown before checkout.",
  },
  {
    title: "No per-staff fee",
    detail: "Add cashiers and managers as you hire them.",
  },
  {
    title: "No setup or onboarding fee",
    detail: "You create the account and the first branch yourself in a few minutes.",
  },
  {
    title: "No feature tiers",
    detail: "There is one product. Nothing on this page is an upgrade you buy later.",
  },
  {
    title: "No hardware lock-in",
    detail: "Bring a compatible ESC/POS printer. Network models need the local bridge on the same LAN; Bluetooth needs BLE and Chrome on Android; USB uses WebUSB in Chrome or Edge.",
  },
];

export type BranchPricingCopy = {
  summary: string;
  example: string;
};

/** Keep every public pricing surface aligned with the live branch catalog. */
export function buildBranchPricingCopy(catalog: SubscriptionCatalogPricing): BranchPricingCopy {
  const includedBranchCount = Number.isFinite(catalog.includedBranchCount)
    ? Math.max(1, Math.floor(catalog.includedBranchCount))
    : 1;
  const exampleBranchCount = includedBranchCount + 1;
  const exampleMonthlyTotal = calculateSubscriptionMonthlyTotal(
    catalog.monthlyPriceCentavos,
    catalog.additionalBranchPriceCentavos,
    exampleBranchCount,
    includedBranchCount,
  );
  const includedLabel = `${includedBranchCount} active branch${includedBranchCount === 1 ? "" : "es"}`;
  const includedVerb = includedBranchCount === 1 ? "is" : "are";
  const additionalPrice = formatPeso(catalog.additionalBranchPriceCentavos);

  return {
    summary: `The first ${includedLabel} ${includedVerb} included. Each additional active branch adds ${additionalPrice} per month.`,
    example: `Example: ${exampleBranchCount} active branches cost ${formatPeso(exampleMonthlyTotal)} per month before any annual discount.`,
  };
}
