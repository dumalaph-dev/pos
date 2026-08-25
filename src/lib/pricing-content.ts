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
  "Unlimited branches, staff, and products",
  "ESC/POS order-slip printing over Bluetooth, Wi-Fi, or USB",
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
      "Fixed-price and by-weight items on one ticket, senior and PWD discounts with ID capture, held orders, cash with change due, GCash, Maya, and card tendering, and void or refund with a reason.",
  },
  {
    title: "The owner workspace",
    detail:
      "Daily and period sales reports, inventory and stock movements, suppliers, expenses, customers, promotions, shifts and cash counts, and an audit log of who changed what.",
  },
  {
    title: "Every branch you run",
    detail:
      "No per-branch or per-terminal licence. Each branch keeps its own catalog, settings, printer, and staff, and the owner gets a consolidated view across all of them.",
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
      "ESC/POS over Bluetooth, Wi-Fi, or USB, in 52mm, 58mm, and 80mm widths, configured per device so each tablet pairs with the printer next to it.",
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
    title: "No per-branch fee",
    detail: "Opening a second location does not change what you pay.",
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
    detail: "If your printer speaks ESC/POS, it should work. There is nothing to buy from us.",
  },
];
