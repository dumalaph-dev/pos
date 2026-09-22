import type { AdminIconName } from "./AdminIcon";

/**
 * Deep-link targets for the help icon in each workspace header
 * (`/admin/guide?topic=inventory`). Every id must have an entry in
 * `TOPIC_TO_FAQ` below; the page falls back to the full list for anything else,
 * so an old bookmark degrades instead of erroring.
 */
export const GUIDE_TOPIC_IDS = [
  "dashboard",
  "inventory",
  "reports",
  "shifts",
  "products",
  "employees",
  "calendar",
  "pos",
  "orders",
  "online-ordering",
  "customers",
  "expenses",
  "suppliers",
  "promotions",
  "branches",
  "billing",
  "settings",
  "devices",
  "offline",
] as const;

export type GuideTopic = (typeof GUIDE_TOPIC_IDS)[number];

export type GuideRole = "admin" | "cashier" | "manager" | "team";

export type GuideCategory =
  | "Getting started"
  | "Daily workflow"
  | "POS & orders"
  | "Inventory"
  | "Reports & finance"
  | "Team"
  | "Devices & offline"
  | "Online ordering"
  | "Settings & billing"
  | "Troubleshooting";

export type GuideFaq = {
  id: string;
  category: GuideCategory;
  question: string;
  answer: string;
  steps?: string[];
  audiences: GuideRole[];
  tags: string[];
  href?: string;
  linkLabel?: string;
};

export type Workflow = {
  eyebrow: string;
  title: string;
  description: string;
  icon: AdminIconName;
  steps: string[];
  href: string;
  linkLabel: string;
};

/**
 * What a person in this role can change, and what they will be told to ask an
 * admin for. Kept beside the FAQs because "why can't I edit this?" is the
 * question behind most support messages from managers and cashiers.
 */
export type RolePlaybook = {
  /** Checklist for someone's first day in the role. */
  firstDay: string[];
  /** Things this role can do without asking anyone. */
  canDo: string[];
  /** Things this role has to ask an organization admin for. */
  askAdmin: string[];
  /** The mistake this role most often has to undo later. */
  watchOut: string;
};

export const ROLE_OPTIONS: Array<{ id: GuideRole; label: string; detail: string }> = [
  { id: "admin", label: "Owner / Admin", detail: "Run the business" },
  { id: "cashier", label: "Cashier", detail: "Serve customers" },
  { id: "manager", label: "Manager", detail: "Keep the shift moving" },
  { id: "team", label: "HR & team", detail: "Support your people" },
];

export const CATEGORY_FILTERS: Array<"All" | GuideCategory> = [
  "All",
  "Getting started",
  "Daily workflow",
  "POS & orders",
  "Inventory",
  "Reports & finance",
  "Team",
  "Devices & offline",
  "Online ordering",
  "Settings & billing",
  "Troubleshooting",
];

export const ROLE_LABELS: Record<GuideRole, string> = {
  admin: "Owners & admins",
  cashier: "Cashiers",
  manager: "Managers",
  team: "HR & team leads",
};

export const WORKFLOWS: Record<GuideRole, Workflow> = {
  admin: {
    eyebrow: "Recommended routine",
    title: "The owner / admin daily loop",
    description: "Keep the operation, stock ledger, and numbers in sync from opening to close.",
    icon: "dashboard",
    steps: [
      "Open Dashboard and confirm the active branch, open shifts, low-stock alerts, and online orders.",
      "During service, keep stock changes recorded and review expenses or exceptions as they happen.",
      "At close, review shifts, run the end-of-day count, then export the report you need to keep.",
    ],
    href: "/admin",
    linkLabel: "Open dashboard",
  },
  cashier: {
    eyebrow: "Recommended routine",
    title: "A calm cashier shift",
    description: "Start with a clean till, make every sale traceable, and hand over with confidence.",
    icon: "pos",
    steps: [
      "Open POS and start or confirm your shift before taking the first order.",
      "Build the order, confirm dine-in or takeaway, apply an approved discount, then charge and issue the receipt.",
      "Before handover, review held orders and close the shift with the counted cash and any note requested by your manager.",
    ],
    href: "/pos",
    linkLabel: "Open POS",
  },
  manager: {
    eyebrow: "Recommended routine",
    title: "The manager floor check",
    description: "Stay close to service while keeping the handoff between people, stock, and cash clear.",
    icon: "history",
    steps: [
      "Check open shifts, active branch activity, and low-stock items before the rush.",
      "Support cashiers with order corrections, online pickups, and any exception that needs a clear note.",
      "Review shift totals and variances, then flag anything the admin should see before the day is sealed.",
    ],
    href: "/admin/shifts",
    linkLabel: "Review shifts",
  },
  team: {
    eyebrow: "Recommended routine",
    title: "The HR & team rhythm",
    description: "Keep people records accurate so every teammate has the right branch, schedule, and access.",
    icon: "employees",
    steps: [
      "Add new team members with their role, home branch, hire date, and working schedule.",
      "Use the employee access area to keep POS credentials and active status current.",
      "Review attendance, leave, and payroll records regularly so managers can plan the next shift.",
    ],
    href: "/admin/employees",
    linkLabel: "Open employees",
  },
};

export const ROLE_PLAYBOOKS: Record<GuideRole, RolePlaybook> = {
  admin: {
    firstDay: [
      "Set the business profile: organization name, brand, and theme in Settings.",
      "Create the first branch, then connect a POS counter for it.",
      "Add categories and products, and turn on stock tracking for anything you want to count.",
      "Record opening inventory so the first low-stock alert means something.",
      "Add your team with the right role and home branch, then share each branch's cashier link.",
    ],
    canDo: [
      "Everything in the backoffice, across every branch in the organization.",
      "Void or refund a completed order — both create an audited reversal and return tracked stock.",
      "Change pricing, discount policy, the Admin PIN threshold, employee access, and billing.",
    ],
    askAdmin: [
      "Nothing inside the workspace — you are the approval, so decide the policy before the rush, not during it.",
    ],
    watchOut: "Deleting people or products instead of deactivating them. Deactivating keeps the history that reports, audits, and Z-readings depend on.",
  },
  cashier: {
    firstDay: [
      "Open the branch link your manager gave you on the counter tablet, and install the app when prompted.",
      "Sign in with your own Employee ID and password — never someone else's.",
      "Start your shift before the first sale so the till total belongs to you.",
      "Practise one sale end to end: add items, charge, and read the receipt.",
      "Learn where Hold, discounts, and the receipt reprint live in the POS More menu.",
    ],
    canDo: [
      "Ring up sales, apply Senior or PWD discounts with the customer's ID reference, and take held orders.",
      "Reprint the receipt for a sale you just made.",
      "Start and close your own shift with a counted cash amount and a note.",
    ],
    askAdmin: [
      "Voiding or refunding a completed order.",
      "A custom discount above the organization threshold — it needs an active Admin PIN.",
      "Changing prices, products, or anything in the backoffice.",
    ],
    watchOut: "Selling on a shift someone else opened. The cash count at handover is matched to the person who opened the shift, so start your own.",
  },
  manager: {
    firstDay: [
      "Confirm which branch you are assigned to — your backoffice view is scoped to it.",
      "Check open shifts and low-stock items before service starts.",
      "Learn the cashier link and install steps so you can set up a replacement tablet yourself.",
      "Review the online ordering queue and the pause control.",
      "Agree with the owner on what counts as a variance worth a note.",
    ],
    canDo: [
      "Review sales, orders, shifts, inventory, and reports for your branch.",
      "Reprint a receipt for a customer.",
      "Manage the online ordering queue, item availability, and the pause control.",
    ],
    askAdmin: [
      "Voids and refunds, which only an organization admin can complete.",
      "Inventory corrections, end-of-day count adjustments, and stock movements.",
      "Employees, branches, pricing, and settings changes.",
    ],
    watchOut: "Letting an exception pass without a note. Your note is usually the only record of why the numbers moved, and it is what the owner reads the next morning.",
  },
  team: {
    firstDay: [
      "Open Employees and review who is active, their role, and their home branch.",
      "Check that everyone who works a till has POS access and their own Employee ID.",
      "Set schedule days and times so attendance and payroll have something to compare against.",
      "Add upcoming leave and holidays to the Calendar so managers can plan.",
      "Agree on who deactivates a leaver's access on their last day.",
    ],
    canDo: [
      "Keep employee records, roles, schedules, attendance, and leave up to date (with admin access).",
      "Review payroll and attendance summaries for planning.",
    ],
    askAdmin: [
      "Creating or changing employee records if your own account is not an organization admin.",
      "Anything that changes what a role is allowed to do.",
    ],
    watchOut: "Leaving a departed employee active. Deactivate on the last day — it closes POS access without erasing the sales history attached to that person.",
  },
};

export const GUIDE_FAQS: GuideFaq[] = [
  // ---------------------------------------------------------------- Getting started
  {
    id: "first-week",
    category: "Getting started",
    question: "I just signed up. What should I set up first?",
    answer: "Set up in the order the data depends on: identity, then location, then what you sell, then who sells it. Doing it out of order is what causes most of the confusing empty screens on day one.",
    steps: [
      "Settings → business profile: organization name, brand name, theme, and the low-stock alert floor.",
      "Branches: create the location you will sell from first.",
      "Counter setup: connect a POS device to that branch.",
      "Products: add categories and products, and turn on Track stock where you want counts.",
      "Inventory: record opening stock so alerts and end-of-day counts have a starting point.",
      "Employees: add your team with their role and home branch, then share the branch cashier link.",
    ],
    audiences: ["admin"],
    tags: ["setup", "onboarding", "new", "first time", "start", "day one"],
    href: "/admin/settings#dashboard-settings",
    linkLabel: "Start with settings",
  },
  {
    id: "roles-explained",
    category: "Getting started",
    question: "What is the difference between Admin, Manager, and Cashier?",
    answer: "Admin runs the organization, Manager watches one branch, and Cashier works the till. The role decides which screens open at all, so give each person the smallest role that still lets them do their job.",
    steps: [
      "Admin: full backoffice across every branch, including employees, pricing, settings, voids, refunds, and billing.",
      "Manager: read-only backoffice for their assigned branch, plus receipt reprints and the online ordering queue.",
      "Cashier: the POS only. Opening the backoffice sends them straight back to the register.",
      "Change someone's role in Employees, then ask them to sign out and back in so the new scope applies.",
    ],
    audiences: ["admin", "team", "manager"],
    tags: ["permissions", "access", "role", "admin", "manager", "cashier", "who can"],
    href: "/admin/employees",
    linkLabel: "Review roles",
  },
  {
    id: "workspace-map",
    category: "Getting started",
    question: "Where do I find each part of the workspace?",
    answer: "The sidebar groups the backoffice by the question you are asking: what is happening now, what we sell, what it earned, who the customers are, and who works here.",
    steps: [
      "Store operations: POS settings, Orders, and Calendar — plus Online ordering and Shifts at the top.",
      "Products & stock: Products, Inventory, and Suppliers.",
      "Insights & finance: Sales, Reports, Branch performance, and Expenses.",
      "Customers & growth: Customers, Promotions, and the Referral program.",
      "Team: Employees, Branches, and the Audit log. Billing, Settings, and this guide sit at the bottom.",
    ],
    audiences: ["admin", "manager", "team"],
    tags: ["navigation", "sidebar", "menu", "where is", "find", "map"],
    href: "/admin",
    linkLabel: "Open dashboard",
  },
  {
    id: "test-sale",
    category: "Getting started",
    question: "How do I test the setup before opening day?",
    answer: "Run one complete sale and then undo it. That exercises the same path a real day uses — shift, product, price, stock, receipt, report — and shows you where anything is still missing.",
    steps: [
      "Open POS, start a shift, and ring up one tracked product.",
      "Charge it, print or view the receipt, and check the customer-facing total.",
      "Open Inventory and confirm the tracked stock went down by the quantity you sold.",
      "Open Reports and confirm the sale appears in today's figures.",
      "Void the test order from Orders, then close the shift so the real day starts clean.",
    ],
    audiences: ["admin"],
    tags: ["test", "dry run", "practice", "check", "before opening"],
    href: "/pos",
    linkLabel: "Open POS",
  },

  // ---------------------------------------------------------------- Daily workflow
  {
    id: "daily-admin",
    category: "Daily workflow",
    question: "What is the usual daily workflow for an admin?",
    answer: "Use the dashboard as the daily control room: start with the branch and open-shift picture, keep stock and expenses current during the day, then reconcile the numbers before closing.",
    steps: [
      "Open Dashboard and confirm you are looking at the right branch.",
      "Review open shifts, low-stock alerts, online orders, and any warning banner.",
      "Record stock in, stock out, waste, and adjustments as they happen instead of relying on memory.",
      "Close with Shifts & Z-readings, an end-of-day count, and a saved report export.",
    ],
    audiences: ["admin"],
    tags: ["owner", "opening", "closing", "daily operations"],
    href: "/admin",
    linkLabel: "Open dashboard",
  },
  {
    id: "daily-cashier",
    category: "Daily workflow",
    question: "What is the usual workflow for a cashier?",
    answer: "A cashier's routine is: start the shift, ring each order carefully, keep the till and held orders tidy, then close with a clear handover.",
    steps: [
      "Start or confirm the shift from the POS shift control before taking orders.",
      "Add products, confirm the order type, apply only approved discounts, and charge the customer.",
      "Issue or reprint the receipt when needed; use Hold for an order that is not ready to be charged.",
      "At handover, count the till and close the shift, adding a note if your manager asks for context.",
    ],
    audiences: ["cashier"],
    tags: ["till", "register", "sale", "receipt", "shift"],
    href: "/pos",
    linkLabel: "Open POS",
  },
  {
    id: "daily-manager",
    category: "Daily workflow",
    question: "What should a manager check each day?",
    answer: "Managers keep service moving and make exceptions visible. Start with shifts and alerts, support the counter during service, then leave a clean handoff for the admin.",
    steps: [
      "Check which shifts are open and whether any branch has low or out-of-stock items.",
      "Watch orders and online pickups during busy periods, helping cashiers resolve issues without losing the paper trail.",
      "Review shift totals and cash variances before handing the day back to the admin.",
    ],
    audiences: ["manager"],
    tags: ["supervisor", "floor", "handover", "cash variance"],
    href: "/admin/shifts",
    linkLabel: "Review shifts",
  },
  {
    id: "daily-team",
    category: "Daily workflow",
    question: "What is the usual HR or team workflow?",
    answer: "Keep the people record ahead of the shift. When a teammate joins, changes branches, or changes schedule, update the employee record first so access and planning stay aligned.",
    steps: [
      "Open Employees and add or update the team member's role, branch, hire date, and schedule.",
      "Check the employee's access area and active status before their first shift.",
      "Review attendance, leave, and payroll records on a regular cadence with the manager.",
    ],
    audiences: ["team", "admin", "manager"],
    tags: ["HR", "staff", "schedule", "payroll", "attendance"],
    href: "/admin/employees",
    linkLabel: "Manage employees",
  },
  {
    id: "weekly-review",
    category: "Daily workflow",
    question: "What should I review weekly rather than daily?",
    answer: "Daily work keeps the records true; the weekly pass is where you actually learn something. Look for direction and repetition rather than single numbers.",
    steps: [
      "Reports: compare this week against last week, grouped by day, and note which days carry the revenue.",
      "Branch performance: check net sales, discount rate, and reversal count side by side across branches.",
      "Inventory reports: look for items that are repeatedly short at the end-of-day count.",
      "Expenses: confirm recurring costs were recorded, so the margin you see is the margin you have.",
      "Employees: review attendance and upcoming leave before you publish next week's schedule.",
    ],
    audiences: ["admin", "manager"],
    tags: ["weekly", "review", "trends", "planning", "margin"],
    href: "/admin/reports",
    linkLabel: "Open reports",
  },

  // ---------------------------------------------------------------- POS & orders
  {
    id: "daily-open-shift",
    category: "POS & orders",
    question: "How do I start a shift, and why does it matter?",
    answer: "A shift ties every sale, discount, and peso of cash to a person and a period. Without an open shift, the day's cash has no owner and the closing count has nothing to compare against.",
    steps: [
      "Open POS on the counter tablet and sign in with your own Employee ID.",
      "Use the shift control to start the shift, entering the cash you are starting with if your store counts an opening float.",
      "Take orders as normal — they attach to your shift automatically.",
      "At handover, close the shift with the counted cash, even if the total matches exactly.",
    ],
    audiences: ["cashier", "manager", "admin"],
    tags: ["shift", "open", "start", "float", "till", "cash"],
    href: "/pos",
    linkLabel: "Open POS",
  },
  {
    id: "close-shift",
    category: "POS & orders",
    question: "How do I close a shift and create a Z-reading?",
    answer: "Close the live till first, then seal the closed figures into a Z-reading when you are ready. An open shift is an X-reading that keeps moving; a Z-reading is the append-only closeout snapshot.",
    steps: [
      "Open Shifts & Z-readings and select the shift you need to review.",
      "For an open shift, enter the counted cash and add a note when the variance needs explanation, then choose Close shift.",
      "After the shift is closed, choose Generate Z-reading and add optional context.",
      "Treat a generated Z-reading as final: it is sealed and cannot be undone.",
    ],
    audiences: ["admin", "manager"],
    tags: ["X-reading", "Z-reading", "closeout", "cash", "till"],
    href: "/admin/shifts",
    linkLabel: "Open shifts",
  },
  {
    id: "hold-order",
    category: "POS & orders",
    question: "How do I hold an order and come back to it?",
    answer: "Hold parks the current cart so the register is free for the next customer. It is for an order that is not ready to be charged — a table still deciding, a customer fetching their wallet — not for a sale you intend to skip.",
    steps: [
      "Build the cart, then open the POS More menu and choose Hold.",
      "Serve the next customer as normal.",
      "Open Hold again and choose Resume on the order you want back.",
      "The hold tray has a limit: if it is full, resume or clear one before parking another.",
    ],
    audiences: ["cashier", "manager"],
    tags: ["hold", "park", "resume", "held orders", "pause sale"],
    href: "/pos",
    linkLabel: "Open POS",
  },
  {
    id: "discounts",
    category: "POS & orders",
    question: "How do discounts work, and when do I need approval?",
    answer: "Senior and PWD discounts are fixed at 20% and make the sale VAT-exempt, so they need the customer's ID reference captured on the order. A custom discount above your organization's threshold needs an active Admin PIN.",
    steps: [
      "In POS, open the discount control and choose Senior, PWD, or Custom.",
      "For Senior or PWD, enter the customer's name and ID number — this becomes the reference on the receipt and in the discount audit.",
      "For a custom discount, enter the percentage. Above the organization threshold (10% unless an admin changed it), the POS asks for the Admin PIN.",
      "Above-threshold approval is not available while the till is offline, so agree on the policy before a busy day.",
    ],
    audiences: ["cashier", "manager", "admin"],
    tags: ["discount", "senior", "PWD", "VAT", "admin PIN", "approval", "percentage"],
    href: "/admin/promotions",
    linkLabel: "Review discounts",
  },
  {
    id: "void-refund",
    category: "POS & orders",
    question: "How do I correct a sale that was rung up wrong?",
    answer: "A completed sale is never edited or erased. An organization admin voids or refunds it, which creates a linked reversal, returns tracked stock, and leaves both records visible in reports and the audit log.",
    steps: [
      "Open Orders (or Sales) and find the order by number, date, or branch.",
      "Open the order and choose Void order or Refund order — this is available to organization admins.",
      "Confirm: the reversal is permanent and audited, and tracked stock goes back to inventory.",
      "Reports and shift readings count the reversal, so net sales stay correct without editing the original sale.",
    ],
    audiences: ["admin", "manager"],
    tags: ["void", "refund", "cancel", "mistake", "reversal", "correction"],
    href: "/admin/orders",
    linkLabel: "Open orders",
  },
  {
    id: "reprint-receipt",
    category: "POS & orders",
    question: "A customer wants their receipt again. What do I do?",
    answer: "Receipts can be reprinted from the order record. The reprint uses the printer settings of the browser or device you are on, so print from the counter tablet when the customer is waiting at the counter.",
    steps: [
      "Cashiers: reopen the sale from the POS and reprint it there.",
      "Managers and admins: open Orders or Sales, select the order, and reprint from the order dialog.",
      "If nothing prints, check the printer settings in POS → More on that specific device.",
    ],
    audiences: ["cashier", "manager", "admin"],
    tags: ["receipt", "reprint", "print", "copy", "customer"],
    href: "/admin/orders",
    linkLabel: "Find an order",
  },
  {
    id: "payment-methods",
    category: "POS & orders",
    question: "How do I change which payment methods appear at the till?",
    answer: "Payment methods are a POS setting, not a per-sale choice. Turn off what you do not accept so cashiers cannot select it by accident during a rush.",
    steps: [
      "Open POS settings from the backoffice.",
      "Enable only the methods this counter accepts, such as cash, card, GCash, or Maya.",
      "For cash, the till records the amount tendered and the change due, which is what the closing count is compared against.",
    ],
    audiences: ["admin"],
    tags: ["payment", "cash", "card", "GCash", "Maya", "e-wallet", "tender"],
    href: "/admin/pos",
    linkLabel: "Open POS settings",
  },
  {
    id: "product-setup",
    category: "POS & orders",
    question: "How do I set up a new product for the POS?",
    answer: "Create the product in Products, give it a clear price and category, then enable stock tracking when the item should affect inventory. You can also create a product from the Inventory add-item flow.",
    steps: [
      "Open Products and choose Add product, or use Inventory → Add item → New product.",
      "Add the name, category, price, unit, and any image or SKU your team uses at the counter.",
      "Turn on Track stock and set a minimum stock level when the product should appear in inventory alerts.",
      "Save, then make a small test sale or opening-stock movement if you need to verify the setup.",
    ],
    audiences: ["admin", "manager"],
    tags: ["catalog", "menu", "price", "SKU", "track stock"],
    href: "/products?create=product",
    linkLabel: "Add a product",
  },

  // ---------------------------------------------------------------- Inventory
  {
    id: "stock-movement",
    category: "Inventory",
    question: "How do I record stock movement every day?",
    answer: "Record any physical stock change that is not a completed POS sale in Inventory. Completed POS sales are added to the stock ledger automatically, so manual entries should cover deliveries, prep usage, yield, waste, and corrections.",
    steps: [
      "Open Inventory and choose Stock in, Stock out, or expand Record a stock movement.",
      "Choose the branch and tracked product, then select Stock in, Stock out, Yield in, Waste / spoilage, or Adjustment.",
      "Enter the quantity and optional unit cost. Add a reason for waste or an adjustment, then select Record movement.",
      "At the end of the day, use End-of-day count to compare the physical count with the ledger and investigate the variance.",
    ],
    audiences: ["admin", "manager"],
    tags: ["inventory", "stock in", "stock out", "waste", "adjustment", "count"],
    href: "/admin/inventory?movement=receive#stock-movement",
    linkLabel: "Open stock movement",
  },
  {
    id: "movement-types",
    category: "Inventory",
    question: "Which movement type should I use?",
    answer: "The type is the reason, and the reason is what makes the ledger readable months later. Quantity alone cannot tell you whether you lost stock or sold it.",
    steps: [
      "Stock in: a delivery or purchase arriving at the branch.",
      "Stock out: stock leaving for a reason that is not a sale, such as a transfer or staff meal.",
      "Yield in: output created by preparation, when one tracked product becomes another.",
      "Waste / spoilage: stock that can no longer be sold. Always add the reason.",
      "Adjustment: a correction to make the ledger match reality, usually after a count.",
    ],
    audiences: ["admin", "manager"],
    tags: ["movement", "type", "reason", "yield", "waste", "adjustment", "transfer"],
    href: "/admin/inventory#stock-movement",
    linkLabel: "Open inventory",
  },
  {
    id: "low-stock",
    category: "Inventory",
    question: "Why is an item showing low or out of stock?",
    answer: "Inventory status is based on the recorded on-hand quantity and the item's minimum stock level. A completed sale reduces tracked stock automatically; deliveries, waste, prep usage, and corrections must be recorded as movements.",
    steps: [
      "Open Inventory and filter the list by Low stock or Out of stock.",
      "Review the item's minimum level and recent stock movements before changing anything.",
      "Record the real-world change with Stock in, Waste / spoilage, or Adjustment rather than changing the count without a reason.",
      "Use Reports → Inventory reports when you need to investigate a pattern over time.",
    ],
    audiences: ["admin", "manager"],
    tags: ["alerts", "minimum", "reorder", "on hand", "restock"],
    href: "/admin/inventory",
    linkLabel: "View inventory",
  },
  {
    id: "end-of-day-count",
    category: "Inventory",
    question: "How does the end-of-day count work?",
    answer: "The count compares what the ledger expects with what you physically have. Saving the count records only the difference as an adjustment, so revising a count later does not double-count the stock.",
    steps: [
      "Open the end-of-day count and enter the counted quantity for each tracked item.",
      "A short count creates a negative adjustment; an over-count creates a positive one.",
      "Add the reason when the gap is larger than your normal tolerance — spoilage, a missed delivery, a miscount.",
      "If you revise the count afterwards, only the new difference is added.",
    ],
    audiences: ["admin", "manager"],
    tags: ["variance", "count", "closing", "physical count", "expected", "reconcile"],
    href: "/admin/inventory/variance",
    linkLabel: "Open end-of-day count",
  },
  {
    id: "suppliers",
    category: "Inventory",
    question: "What do supplier records actually do for me?",
    answer: "A supplier record puts the reordering details next to the stock that is running out, so whoever notices the alert can act without hunting for a phone number.",
    steps: [
      "Open Suppliers and create the supplier before linking products to it.",
      "Record the contact person, number, delivery days, payment terms, and the ordering cut-off time in the notes.",
      "When a low-stock alert appears, open the supplier to place the order rather than relying on memory.",
    ],
    audiences: ["admin", "manager"],
    tags: ["supplier", "purchasing", "reorder", "delivery", "vendor", "contact"],
    href: "/admin/suppliers",
    linkLabel: "Manage suppliers",
  },

  // ---------------------------------------------------------------- Reports & finance
  {
    id: "export-report",
    category: "Reports & finance",
    question: "How do I export a report?",
    answer: "Reports can be exported as CSV after you set the date range and grouping you want. The dashboard also has a quick Export report shortcut for the current reporting view.",
    steps: [
      "Open Reports and set the From and To dates for the period you need.",
      "Choose how the report should be grouped, such as by day, week, or month.",
      "In the Export CSV row, choose Summary, Periods, Items, Categories, Cashiers, Branches, Discounts, or Hourly.",
      "If the range is too large, narrow it before relying on or exporting the figures.",
    ],
    audiences: ["admin", "manager"],
    tags: ["CSV", "download", "sales", "summary", "export"],
    href: "/admin/reports",
    linkLabel: "Open reports",
  },
  {
    id: "net-sales",
    category: "Reports & finance",
    question: "Why don't my sales totals match what I counted?",
    answer: "Reports show net sales, which subtract voids and refunds. A sale that was later reversed stays visible as a record but stops counting as revenue, so the report total is usually lower than the raw list of orders.",
    steps: [
      "Check Orders for the day and filter by Voided and Refunded to see the reversals.",
      "Compare against the shift's Z-reading, which uses the same reversal-aware definition.",
      "Remember that discounts reduce the total too — Reports → Discounts shows how much and on which orders.",
      "If cash is short but sales are right, the gap is a till issue, not a reporting issue: check the shift variance.",
    ],
    audiences: ["admin", "manager"],
    tags: ["net sales", "mismatch", "difference", "void", "refund", "discount", "total"],
    href: "/admin/reports",
    linkLabel: "Open reports",
  },
  {
    id: "expenses",
    category: "Reports & finance",
    question: "Where do I record expenses?",
    answer: "Expenses capture the money going out that never touches the till — rent, utilities, deliveries, repairs. Recording them is what turns a sales figure into something close to a margin.",
    steps: [
      "Open Expenses and add the amount, category, date, and branch.",
      "Record recurring costs on a fixed day each week or month so nothing is remembered too late.",
      "Review expenses alongside Reports before you judge how a period performed.",
    ],
    audiences: ["admin"],
    tags: ["expense", "cost", "spending", "margin", "utilities", "rent"],
    href: "/admin/expenses",
    linkLabel: "Open expenses",
  },
  {
    id: "branch-performance",
    category: "Reports & finance",
    question: "How do I compare branches?",
    answer: "Branch performance puts net sales, discount rate, reversals, and operating signals side by side using the same reversal-aware definitions as Reports, so two branches can be read against each other fairly.",
    steps: [
      "Open Branch performance from Insights & finance.",
      "Compare net sales and the change against the previous period, not just the raw totals.",
      "Look at the discount rate and reversal count together — a high rate in one branch is usually a process difference, not a customer difference.",
      "Drill into a branch's orders from the same table when something needs explaining.",
    ],
    audiences: ["admin"],
    tags: ["branch", "compare", "performance", "multi-branch", "benchmark"],
    href: "/admin/branches/performance",
    linkLabel: "Open branch performance",
  },
  {
    id: "audit-log",
    category: "Reports & finance",
    question: "How do I see who changed something?",
    answer: "The audit log records the sensitive actions in the workspace, so a question about a void, a price, or an access change has an answer that does not depend on anyone's memory.",
    steps: [
      "Open Audit log from the Team group.",
      "Find the action by date and the person who performed it.",
      "Use it together with Orders for reversals and Shifts for cash questions.",
    ],
    audiences: ["admin"],
    tags: ["audit", "history", "who changed", "log", "trail", "accountability"],
    href: "/admin/audit",
    linkLabel: "Open audit log",
  },

  // ---------------------------------------------------------------- Team
  {
    id: "employee-setup",
    category: "Team",
    question: "How do I add a cashier or employee?",
    answer: "Use Employees to create the people record, assign the home branch and schedule, and keep the employee active only while they should be able to work. The employee detail view contains access controls when they need POS credentials.",
    steps: [
      "Open Employees and choose Add employee.",
      "Fill in the name, role, home branch, hire date, schedule times, and working days.",
      "Save the employee, then open their access area to review or set POS access.",
      "When someone leaves, deactivate the employee instead of deleting the history you may need later.",
    ],
    audiences: ["team", "admin"],
    tags: ["cashier", "staff access", "schedule", "hire", "deactivate"],
    href: "/admin/employees",
    linkLabel: "Open employees",
  },
  {
    id: "employee-id-login",
    category: "Team",
    question: "What does a cashier actually sign in with?",
    answer: "A cashier signs in with an Employee ID and password on the branch sign-in screen — not an email address, and not a shared account. The branch link only selects the store; it grants no access by itself.",
    steps: [
      "Create the employee record and set their POS access, which produces their Employee ID.",
      "Give them the branch link for the tablet they will work on.",
      "Have them sign in once with their own ID and change the password if they were given a temporary one.",
      "If someone forgets their password, an organization admin resets it from the employee's access area.",
    ],
    audiences: ["admin", "team", "manager", "cashier"],
    tags: ["employee ID", "password", "sign in", "login", "credentials", "reset"],
    href: "/admin/employees#staff-access",
    linkLabel: "Open staff access",
  },
  {
    id: "leaver",
    category: "Team",
    question: "Someone is leaving. What do I turn off?",
    answer: "Deactivate rather than delete. Deactivating closes POS access immediately while keeping the sales, shifts, and readings that already carry their name — records other people's reports depend on.",
    steps: [
      "On their last day, open the employee record and set them inactive.",
      "Confirm they have no open shift; close it with a counted amount first if they do.",
      "If they knew the Admin PIN, change it in Settings.",
      "Reassign any schedule or upcoming leave so the branch coverage stays honest.",
    ],
    audiences: ["admin", "team", "manager"],
    tags: ["offboarding", "leaver", "deactivate", "resign", "remove access", "security"],
    href: "/admin/employees",
    linkLabel: "Open employees",
  },
  {
    id: "attendance-leave",
    category: "Team",
    question: "How do attendance, leave, and payroll fit together?",
    answer: "The schedule on the employee record is the expectation, attendance is what happened, and leave explains the gap between them. Payroll summaries read all three, so keeping the schedule current is what makes the rest meaningful.",
    steps: [
      "Set schedule days and times when you create or update the employee.",
      "Record or review attendance for the period you are checking.",
      "Approve leave requests so approved days stop reading as absences.",
      "Review the payroll overview with the manager before the cut-off, not after.",
    ],
    audiences: ["team", "admin", "manager"],
    tags: ["attendance", "leave", "payroll", "schedule", "absence", "shift plan"],
    href: "/admin/employees?tab=leave",
    linkLabel: "Open leave requests",
  },
  {
    id: "calendar",
    category: "Team",
    question: "How do I use the calendar for store events?",
    answer: "Calendar is a lightweight shared planning surface for holidays, deliveries, promotions, orders, and other dates your team should see before the shift starts.",
    steps: [
      "Use Add Event or Quick Add Event to save the date, time, category, and notes.",
      "Select an event on the grid to edit or remove it.",
      "Use the search and upcoming-events views to find the next operational handoff quickly.",
    ],
    audiences: ["admin", "manager", "team"],
    tags: ["schedule", "events", "delivery", "promotion", "holiday"],
    href: "/admin/calendar",
    linkLabel: "Open calendar",
  },

  // ---------------------------------------------------------------- Devices & offline
  {
    id: "cashier-tablet-link",
    category: "Devices & offline",
    question: "What link does a cashier open on their tablet?",
    answer: "Every active branch has its own sign-in link. Open it on the counter tablet, install the app, and the cashier signs in there with their own Employee ID. The link names the branch; it does not sign anyone in on its own, so it is safe to print and leave at the counter.",
    steps: [
      "Organization admins: copy the branch link from the Cashier tablet card on this page, or from Employees → Store login links. Other roles ask an admin for it.",
      "On the tablet, open the link in Chrome (Android) or Safari (iPad) and install the app when offered.",
      "Have the cashier sign in with their Employee ID and password.",
      "Bind the counter in POS settings if you want the device tied to a specific branch and printer.",
    ],
    audiences: ["admin", "manager", "team", "cashier"],
    tags: ["tablet", "link", "cashier", "device", "QR", "counter", "staff link", "url"],
    href: "/admin/employees#staff-access",
    linkLabel: "Open store login links",
  },
  {
    id: "install-app",
    category: "Devices & offline",
    question: "How do I install Dumala as an app?",
    answer: "Dumala installs from the browser, with no app store. An installed counter tablet opens full screen, starts faster, and keeps the offline cache that lets it survive a short internet drop.",
    steps: [
      "Android tablet: open the branch link in Chrome, tap the ⋮ menu, then Install app or Add to Home screen.",
      "iPad or iPhone: open the link in Safari, tap Share, then Add to Home Screen.",
      "Desktop Chrome or Edge: click the install icon at the right of the address bar, or use the browser menu's install option.",
      "Use the Install Dumala App action here or in Settings if you would rather be walked through it.",
    ],
    audiences: ["admin", "manager", "cashier", "team"],
    tags: ["install", "PWA", "app", "home screen", "standalone", "add to home screen"],
    href: "/admin/settings",
    linkLabel: "Open settings",
  },
  {
    id: "install-button-missing",
    category: "Devices & offline",
    question: "The install button or prompt is not appearing. Why?",
    answer: "Browsers only offer a one-tap install when the page is served over https, the app is not already installed, and the browser supports it. Firefox on desktop never offers it, and Chromium only offers it once per page load.",
    steps: [
      "Check whether it is already installed — look for the Dumala icon on the home screen or in the app list.",
      "If you installed it before and removed it, use Settings → Show Install Dumala button to clear the stored state.",
      "Reload the page: Chromium only offers the one-tap install once per load.",
      "On Firefox desktop or an older macOS Safari, install from Chrome or Edge instead — the site still works normally in Firefox.",
      "Any Install action in Dumala also shows written steps for your exact browser when the one-tap install is unavailable.",
    ],
    audiences: ["admin", "manager", "cashier"],
    tags: ["install", "missing", "not showing", "button", "prompt", "PWA", "troubleshoot"],
    href: "/admin/settings",
    linkLabel: "Restore the install button",
  },
  {
    id: "offline",
    category: "Devices & offline",
    question: "What happens if the internet drops during service?",
    answer: "The POS keeps selling. Orders are stored on the device and sync when the connection returns, so a short outage does not stop the counter — but anything that needs a live check is paused until you are back online.",
    steps: [
      "Keep selling: orders, receipts, and the cart continue to work on an installed tablet.",
      "Expect the offline banner; it tells you the device is working from its local copy.",
      "Custom discounts above the organization threshold cannot be approved offline.",
      "Stay signed in and leave the device open until the banner clears, so the queued orders sync.",
      "After reconnecting, check Orders to confirm the queued sales arrived before closing the shift.",
    ],
    audiences: ["cashier", "manager", "admin"],
    tags: ["offline", "internet", "sync", "outage", "connection", "no wifi"],
    href: "/pos",
    linkLabel: "Open POS",
  },
  {
    id: "printer",
    category: "Devices & offline",
    question: "The receipt printer or customer display is not working.",
    answer: "Printer and customer-display settings are per device, not per organization. A tablet that prints correctly and one that does not are two different configurations, even in the same branch.",
    steps: [
      "On the device that is failing, open POS → More and check the printer transport and settings.",
      "Confirm the printer is powered, paired, and on the same network as the tablet.",
      "Send a test print from that device before the next customer arrives.",
      "For the customer display, re-pair the display from the same menu on the POS device.",
    ],
    audiences: ["cashier", "manager", "admin"],
    tags: ["printer", "receipt", "display", "not printing", "hardware", "pairing"],
    href: "/admin/pos",
    linkLabel: "Open POS settings",
  },

  // ---------------------------------------------------------------- Online ordering
  {
    id: "online-ordering",
    category: "Online ordering",
    question: "How do I manage online orders and menu availability?",
    answer: "Use Online ordering to review incoming orders and control what customers can see. Keep availability current during service so the online menu matches what the branch can actually fulfil.",
    steps: [
      "Open Online ordering and review new or pickup orders that need attention.",
      "Use the availability controls to pause an item or category when the branch runs out.",
      "Update the online menu when prices, photos, or customer-facing descriptions change.",
    ],
    audiences: ["admin", "manager"],
    tags: ["online", "pickup", "menu", "availability", "orders"],
    href: "/admin/online-ordering",
    linkLabel: "Open online ordering",
  },
  {
    id: "pause-online",
    category: "Online ordering",
    question: "We are slammed. How do I stop taking online orders?",
    answer: "Pause the menu. Customers stop being able to place new orders immediately, while the orders already in your queue stay exactly where they are so nothing is lost mid-service.",
    steps: [
      "Open Online ordering and use Pause orders in the order operations bar.",
      "Work through the existing queue as normal — pausing does not cancel anything.",
      "Choose Resume orders when the kitchen has caught up.",
      "For a predictable rush, set availability hours instead so the menu closes and reopens on its own.",
    ],
    audiences: ["admin", "manager"],
    tags: ["pause", "stop orders", "busy", "rush", "resume", "availability hours"],
    href: "/admin/online-ordering",
    linkLabel: "Open online ordering",
  },
  {
    id: "online-out-of-stock",
    category: "Online ordering",
    question: "We ran out of one item. How do I hide just that?",
    answer: "Availability is per item and per category, so you can take one dish off the online menu without pausing the whole store or editing the product itself.",
    steps: [
      "Open Online ordering → Availability.",
      "Turn off the item, or the whole category if the station is down.",
      "Turn it back on as soon as the stock arrives — the online menu updates for customers.",
      "Availability is separate from inventory: this controls what customers can order, not what the stock ledger says.",
    ],
    audiences: ["admin", "manager"],
    tags: ["availability", "sold out", "hide item", "86", "category", "online menu"],
    href: "/admin/online-ordering",
    linkLabel: "Open availability",
  },
  {
    id: "online-to-pos",
    category: "Online ordering",
    question: "How does an online order become a sale?",
    answer: "An online order lives in the queue until someone at the counter completes it in the POS. That is what puts it into sales, shift totals, and the stock ledger with the rest of the day's business.",
    steps: [
      "Work the queue in Online ordering: new, confirmed, preparing, ready.",
      "When the customer collects or the rider leaves, complete the order through the POS so payment and stock are recorded.",
      "The order note keeps the pickup or delivery details attached to the sale.",
      "Reports then treat it the same as any other completed order.",
    ],
    audiences: ["manager", "cashier", "admin"],
    tags: ["online order", "pickup", "delivery", "queue", "complete", "fulfil"],
    href: "/admin/online-ordering",
    linkLabel: "Open the queue",
  },

  // ---------------------------------------------------------------- Settings & billing
  {
    id: "branch-switching",
    category: "Settings & billing",
    question: "How do I switch branches?",
    answer: "Use the branch switcher in the admin sidebar or the mobile admin context bar. The dashboard, inventory, reports, and shift views will then use the selected branch scope.",
    steps: [
      "Open the branch switcher and choose the branch you want to work on.",
      "Confirm the branch name in the page eyebrow or header before recording stock or reviewing totals.",
      "If you cannot see a branch, ask an organization admin to check that it is active and that you have access.",
    ],
    audiences: ["admin", "manager"],
    tags: ["store", "location", "multi-branch", "scope"],
    href: "/admin",
    linkLabel: "Return to dashboard",
  },
  {
    id: "settings",
    category: "Settings & billing",
    question: "Where do I configure dashboard, receipt, and POS settings?",
    answer: "Use Settings for the administrative configuration that should persist across the backoffice. The POS More menu contains terminal-level tools such as printer and customer-display settings.",
    steps: [
      "Open Settings and choose the section that matches the change you need.",
      "Use POS → More for a specific terminal's printer or customer-display controls.",
      "After changing a setting, return to the affected workspace and verify the result with a small test action.",
    ],
    audiences: ["admin", "manager"],
    tags: ["preferences", "printer", "display", "receipt", "dashboard"],
    href: "/admin/settings",
    linkLabel: "Open settings",
  },
  {
    id: "settings-scopes",
    category: "Settings & billing",
    question: "Why is a setting I changed not applying everywhere?",
    answer: "Settings live at four different scopes, and each is deliberately separate: organization, account, branch, and device. A change at one scope is not meant to reach the others.",
    steps: [
      "Organization: brand, currency, theme, alert floor, and the discount approval threshold — shared by everyone.",
      "Account: your own password and preferences.",
      "Branch: address, TIN, VAT settings, and what appears on that branch's receipts.",
      "Device: printer transport and customer display, which belong to one tablet only.",
      "If a change did not apply, you almost certainly changed a different scope than the one you meant.",
    ],
    audiences: ["admin"],
    tags: ["settings", "scope", "not applying", "organization", "branch", "device", "receipt"],
    href: "/admin/settings",
    linkLabel: "Open settings",
  },
  {
    id: "add-branch",
    category: "Settings & billing",
    question: "How do I add another branch?",
    answer: "A branch is the home for its own menu, stock, staff, sales, and receipts. Additional branches affect your subscription, so the billing side is checked when you create one.",
    steps: [
      "Open Branches and create the branch with its name, address, and tax details.",
      "Check Billing & Plan if you are prompted — additional branches beyond the included one are billed.",
      "Connect a POS counter to the new branch and share its cashier link.",
      "Add products and opening stock for the branch before its first sale.",
    ],
    audiences: ["admin"],
    tags: ["branch", "location", "expand", "second store", "billing", "new branch"],
    href: "/admin/branches",
    linkLabel: "Open branches",
  },
  {
    id: "billing",
    category: "Settings & billing",
    question: "How do trial and billing work?",
    answer: "New workspaces start on a free trial. When it ends, an active subscription keeps the POS and backoffice open; without one, access is limited until billing is settled.",
    steps: [
      "Open Billing & Plan to see the current status, renewal date, and what is included.",
      "Subscribe or update the payment method before the trial ends to avoid interrupting a service day.",
      "Additional branches are priced on top of the base plan — the same page shows the current total.",
      "If access is blocked, an organization admin resolves it from Billing & Plan; other roles will be pointed there.",
    ],
    audiences: ["admin"],
    tags: ["billing", "trial", "subscription", "payment", "plan", "expired", "renew"],
    href: "/admin/billing",
    linkLabel: "Open billing & plan",
  },

  // ---------------------------------------------------------------- Troubleshooting
  {
    id: "cashier-cant-sign-in",
    category: "Troubleshooting",
    question: "A cashier cannot sign in on the tablet.",
    answer: "Work from the outside in: the link, the account, then the password. Most failures are one of the first two, and neither needs a password reset.",
    steps: [
      "Confirm they are on the branch link, not the owner sign-in page — the branch name should be on the screen.",
      "Check the employee record is active and has POS access for that branch.",
      "Confirm they are using their Employee ID, not an email address.",
      "If the workspace subscription has lapsed, the branch link stops working for everyone — check Billing & Plan.",
      "Only then reset the password from the employee's access area.",
    ],
    audiences: ["admin", "manager", "team"],
    tags: ["cannot sign in", "login failed", "password", "cashier", "access denied", "employee ID"],
    href: "/admin/employees#staff-access",
    linkLabel: "Open staff access",
  },
  {
    id: "missing-sale",
    category: "Troubleshooting",
    question: "A sale is missing from today's totals.",
    answer: "Check the three usual causes in order: the sale was reversed, it was rung up on a different branch or day, or it is still queued on an offline device.",
    steps: [
      "Open Orders and search the order number, including Voided and Refunded in the filter.",
      "Confirm the branch selector and date range match where and when the sale happened.",
      "If a tablet was offline, open it while connected and wait for the offline banner to clear so queued orders sync.",
      "If it is still missing after syncing, check the Audit log before assuming it was never recorded.",
    ],
    audiences: ["admin", "manager"],
    tags: ["missing", "sale", "not showing", "order", "sync", "offline", "totals"],
    href: "/admin/orders",
    linkLabel: "Open orders",
  },
  {
    id: "stock-wrong",
    category: "Troubleshooting",
    question: "The stock number looks wrong.",
    answer: "The ledger only knows what it was told. Sales reduce tracked stock on their own; everything else — deliveries, prep, waste, transfers — is only there if someone recorded it.",
    steps: [
      "Open the item and read its recent movements before changing anything.",
      "Look for a delivery that was never recorded, or waste that was thrown out without an entry.",
      "Check the product actually has Track stock enabled; an untracked product never moves.",
      "Fix it with a movement that states the reason, or with an end-of-day count, not a silent edit.",
    ],
    audiences: ["admin", "manager"],
    tags: ["stock wrong", "incorrect", "quantity", "ledger", "mismatch", "inventory"],
    href: "/admin/inventory",
    linkLabel: "Open inventory",
  },
  {
    id: "cash-variance",
    category: "Troubleshooting",
    question: "The till is short at the end of the shift.",
    answer: "Close the shift with the real counted amount and write the note. A shift closed with a made-up number to make the variance disappear removes the only evidence that could explain it later.",
    steps: [
      "Count again, including the opening float and anything set aside.",
      "Check for a sale charged as cash but paid another way, and for refunds paid out of the drawer.",
      "Close the shift with the true counted amount and a note describing what you checked.",
      "Review the pattern in Shifts — a repeated small shortfall is usually a process problem, not a person.",
    ],
    audiences: ["cashier", "manager", "admin"],
    tags: ["cash short", "variance", "till", "shortage", "over", "count", "shift"],
    href: "/admin/shifts",
    linkLabel: "Open shifts",
  },
  {
    id: "cannot-edit",
    category: "Troubleshooting",
    question: "I can see the page but cannot change anything.",
    answer: "That is the role doing its job. Managers get a read-only view of their branch, and cashiers are returned to the POS. Nothing is broken and nothing needs reinstalling.",
    steps: [
      "Check the role shown in your account chip at the top right.",
      "If you need to make the change yourself, ask an organization admin to adjust your role in Employees.",
      "After a role change, sign out and back in so the new scope applies.",
    ],
    audiences: ["manager", "cashier", "team"],
    tags: ["read only", "cannot edit", "disabled", "permission", "access", "greyed out"],
    href: "/admin/employees",
    linkLabel: "Open employees",
  },
];

export const TOPIC_TO_FAQ: Record<GuideTopic, string> = {
  dashboard: "daily-admin",
  inventory: "stock-movement",
  reports: "export-report",
  shifts: "close-shift",
  products: "product-setup",
  employees: "employee-setup",
  calendar: "calendar",
  pos: "daily-cashier",
  orders: "void-refund",
  "online-ordering": "online-ordering",
  customers: "workspace-map",
  expenses: "expenses",
  suppliers: "suppliers",
  promotions: "discounts",
  branches: "add-branch",
  billing: "billing",
  settings: "settings-scopes",
  devices: "cashier-tablet-link",
  offline: "offline",
};

export const QUICK_LINKS: Array<{ label: string; detail: string; href: string; icon: AdminIconName }> = [
  { label: "Start a sale", detail: "Open the register", href: "/pos", icon: "pos" },
  { label: "Record stock", detail: "Add to the inventory ledger", href: "/admin/inventory?movement=receive#stock-movement", icon: "inventory" },
  { label: "Export a report", detail: "Download a CSV", href: "/admin/reports", icon: "download" },
  { label: "Close a shift", detail: "Review X and Z-readings", href: "/admin/shifts", icon: "history" },
  { label: "Manage employees", detail: "People, access, and schedules", href: "/admin/employees", icon: "employees" },
  { label: "Cashier links", detail: "Branch sign-in links for tablets", href: "/admin/employees#staff-access", icon: "branches" },
  { label: "Online ordering", detail: "Queue, availability, and pause", href: "/admin/online-ordering", icon: "bag" },
  { label: "Open settings", detail: "Tune the backoffice", href: "/admin/settings", icon: "settings" },
];

/**
 * The words that appear on screen and mean something specific here. Every
 * entry is a term a new owner has asked about at least once.
 */
export const GLOSSARY: Array<{ term: string; definition: string }> = [
  { term: "Shift", definition: "One person's period at the till. Every sale, discount, and peso of cash belongs to the shift that was open when it happened." },
  { term: "X-reading", definition: "The running total of a shift that is still open. It keeps moving as sales come in." },
  { term: "Z-reading", definition: "The sealed closeout snapshot of a closed shift. It is append-only and cannot be undone once generated." },
  { term: "Reversal", definition: "The linked record created by a void or refund. The original sale stays visible; net sales exclude both." },
  { term: "Net sales", definition: "Sales after discounts, voids, and refunds. This is the figure Reports, Z-readings, and Branch performance all use." },
  { term: "On hand", definition: "What the stock ledger believes you have right now, from the sum of every recorded movement and sale." },
  { term: "Movement", definition: "One recorded change to stock: stock in, stock out, yield in, waste, or an adjustment — each with a reason." },
  { term: "Yield", definition: "Preparation that turns one tracked product into another, recording the source used, the usable output, and the waste in one entry." },
  { term: "Variance", definition: "The gap between expected stock and the physical count at close. Saving the count records only the difference." },
  { term: "Held order", definition: "A parked cart that frees the register for the next customer. It is not a sale until it is resumed and charged." },
  { term: "Admin PIN", definition: "The organization approval code for custom discounts above your threshold. It is not available while a till is offline." },
  { term: "Branch link", definition: "The per-branch sign-in URL a counter tablet opens. It names the store and grants no access on its own." },
  { term: "Installed app", definition: "Dumala added to a device's home screen from the browser. It runs full screen and keeps the offline cache." },
];
