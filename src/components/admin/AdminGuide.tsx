"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminIcon, type AdminIconName } from "./AdminIcon";
import { AdminLink as Link } from "./AdminLink";
import type { GuideTopic } from "./admin-guide-data";
import styles from "./AdminGuide.module.css";

export type GuideRole = "admin" | "cashier" | "manager" | "team";

type GuideCategory =
  | "Daily workflow"
  | "POS & orders"
  | "Inventory"
  | "Reports & finance"
  | "Team"
  | "Settings";

type GuideFaq = {
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

type Workflow = {
  eyebrow: string;
  title: string;
  description: string;
  icon: AdminIconName;
  steps: string[];
  href: string;
  linkLabel: string;
};

const ROLE_OPTIONS: Array<{ id: GuideRole; label: string; detail: string }> = [
  { id: "admin", label: "Admin", detail: "Run the business" },
  { id: "cashier", label: "Cashier", detail: "Serve customers" },
  { id: "manager", label: "Manager", detail: "Keep the shift moving" },
  { id: "team", label: "HR & team", detail: "Support your people" },
];

const CATEGORY_FILTERS: Array<"All" | GuideCategory> = [
  "All",
  "Daily workflow",
  "POS & orders",
  "Inventory",
  "Reports & finance",
  "Team",
  "Settings",
];

const ROLE_LABELS: Record<GuideRole, string> = {
  admin: "Admins",
  cashier: "Cashiers",
  manager: "Managers",
  team: "HR & team leads",
};

const WORKFLOWS: Record<GuideRole, Workflow> = {
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

const GUIDE_FAQS: GuideFaq[] = [
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
    id: "branch-switching",
    category: "Settings",
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
    id: "online-ordering",
    category: "POS & orders",
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
    id: "calendar",
    category: "Settings",
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
  {
    id: "settings",
    category: "Settings",
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
];

const TOPIC_TO_FAQ: Record<GuideTopic, string> = {
  dashboard: "daily-admin",
  inventory: "stock-movement",
  reports: "export-report",
  shifts: "close-shift",
  products: "product-setup",
  employees: "employee-setup",
  calendar: "calendar",
};

const QUICK_LINKS: Array<{ label: string; detail: string; href: string; icon: AdminIconName }> = [
  { label: "Start a sale", detail: "Open the register", href: "/pos", icon: "pos" },
  { label: "Record stock", detail: "Add to the inventory ledger", href: "/admin/inventory?movement=receive#stock-movement", icon: "inventory" },
  { label: "Export a report", detail: "Download a CSV", href: "/admin/reports", icon: "download" },
  { label: "Close a shift", detail: "Review X and Z-readings", href: "/admin/shifts", icon: "history" },
  { label: "Manage employees", detail: "People, access, and schedules", href: "/admin/employees", icon: "employees" },
  { label: "Open settings", detail: "Tune the backoffice", href: "/admin/settings", icon: "settings" },
];

const DEFAULT_ROLE: GuideRole = "admin";

function roleForProfile(role: GuideRole | null | undefined): GuideRole {
  return role === "cashier" || role === "manager" || role === "team" ? role : DEFAULT_ROLE;
}

function faqMatches(faq: GuideFaq, query: string) {
  if (!query) return true;
  const haystack = [faq.question, faq.answer, faq.category, ...faq.steps ?? [], ...faq.tags].join(" ").toLowerCase();
  return haystack.includes(query);
}

export function AdminGuide({
  currentRole,
  organizationName,
  initialTopic,
}: {
  currentRole?: GuideRole | null;
  organizationName?: string;
  initialTopic?: GuideTopic;
}) {
  const [activeRole, setActiveRole] = useState<GuideRole>(roleForProfile(currentRole));
  const [activeCategory, setActiveCategory] = useState<"All" | GuideCategory>("All");
  const [query, setQuery] = useState("");
  const [openFaqId, setOpenFaqId] = useState<string | null>(initialTopic ? TOPIC_TO_FAQ[initialTopic] : null);
  const searchRef = useRef<HTMLInputElement>(null);
  const workflow = WORKFLOWS[activeRole];
  const normalizedQuery = query.trim().toLowerCase();

  const visibleFaqs = useMemo(() => {
    return GUIDE_FAQS
      .filter((faq) => activeCategory === "All" || faq.category === activeCategory)
      .filter((faq) => faqMatches(faq, normalizedQuery))
      .sort((first, second) => {
        const firstRecommended = first.audiences.includes(activeRole) ? 0 : 1;
        const secondRecommended = second.audiences.includes(activeRole) ? 0 : 1;
        return firstRecommended - secondRecommended;
      });
  }, [activeCategory, activeRole, normalizedQuery]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (!initialTopic) return;
    const faqId = TOPIC_TO_FAQ[initialTopic];
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`guide-faq-${faqId}`)?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialTopic]);

  function selectRole(role: GuideRole) {
    setActiveRole(role);
    setOpenFaqId(null);
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.hero} aria-labelledby="guide-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Help &amp; Guide</p>
          <h1 id="guide-title">Run your store with confidence.</h1>
          <p className={styles.heroLead}>
            Practical answers for every shift, count, report, and team task{organizationName ? ` at ${organizationName}` : ""}.
          </p>
          <div className={styles.heroMeta}>
            <span><AdminIcon name="check" size={14} /> Built for the backoffice</span>
            <span><AdminIcon name="help" size={14} /> {GUIDE_FAQS.length} answers</span>
          </div>
        </div>

        <div className={styles.searchCard}>
          <label className={styles.searchLabel} htmlFor="guide-search">Search the guide</label>
          <div className={styles.searchField}>
            <AdminIcon name="search" size={18} />
            <input
              ref={searchRef}
              id="guide-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “stock movement”"
              autoComplete="off"
            />
            <kbd>⌘ K</kbd>
          </div>
          <p>Search by question, workspace, or task. Use the role guide below for the routine that fits your day.</p>
        </div>
      </section>

      <section id="role-guide" className={styles.roleSection} aria-labelledby="role-guide-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Choose a starting point</p>
            <h2 id="role-guide-title">What are you here to do?</h2>
          </div>
          <p>Switch roles to see the most relevant daily rhythm and FAQs.</p>
        </div>

        <div className={styles.roleSwitcher} role="group" aria-label="Choose your role">
          {ROLE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.roleButton} ${activeRole === option.id ? styles.roleButtonActive : ""}`}
              aria-pressed={activeRole === option.id}
              onClick={() => selectRole(option.id)}
            >
              <span className={styles.roleButtonLabel}>{option.label}</span>
              <span className={styles.roleButtonDetail}>{option.detail}</span>
            </button>
          ))}
        </div>

        <div className={styles.workflowCard}>
          <div className={styles.workflowIntro}>
            <span className={styles.iconTile}><AdminIcon name={workflow.icon} size={23} /></span>
            <div>
              <p className={styles.cardEyebrow}>{workflow.eyebrow}</p>
              <h3>{workflow.title}</h3>
              <p>{workflow.description}</p>
            </div>
          </div>
          <ol className={styles.workflowSteps}>
            {workflow.steps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <Link href={workflow.href} className={styles.workflowLink}>{workflow.linkLabel}<AdminIcon name="arrow" size={15} /></Link>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section id="guide-faqs" className={styles.faqSection} aria-labelledby="faq-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Answers on demand</p>
              <h2 id="faq-title">Frequently asked questions</h2>
            </div>
            <p aria-live="polite">{visibleFaqs.length} result{visibleFaqs.length === 1 ? "" : "s"}</p>
          </div>

          <div className={styles.categoryScroller} aria-label="Filter guide topics" role="group">
            {CATEGORY_FILTERS.map((category) => (
              <button
                key={category}
                type="button"
                className={`${styles.categoryButton} ${activeCategory === category ? styles.categoryButtonActive : ""}`}
                aria-pressed={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className={styles.faqList}>
            {visibleFaqs.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}><AdminIcon name="search" size={20} /></span>
                <h3>No guide answer yet</h3>
                <p>Try a broader search, or clear the category filter to browse every FAQ.</p>
                <button type="button" onClick={() => { setQuery(""); setActiveCategory("All"); }} className={styles.textButton}>Show all answers</button>
              </div>
            ) : visibleFaqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              const isRecommended = faq.audiences.includes(activeRole);
              const panelId = `guide-answer-${faq.id}`;
              return (
                <article key={faq.id} id={`guide-faq-${faq.id}`} className={`${styles.faqItem} ${isOpen ? styles.faqItemOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.faqTrigger}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  >
                    <span className={styles.faqTriggerCopy}>
                      <span className={styles.faqMeta}>
                        <span>{faq.category}</span>
                        {isRecommended && <span className={styles.recommendedBadge}>For {ROLE_LABELS[activeRole]}</span>}
                      </span>
                      <strong>{faq.question}</strong>
                    </span>
                    <span className={styles.faqChevron}><AdminIcon name="chevron" size={17} /></span>
                  </button>
                  {isOpen && (
                    <div id={panelId} className={styles.faqAnswer} role="region">
                      <p>{faq.answer}</p>
                      {faq.steps && (
                        <ol>
                          {faq.steps.map((step) => <li key={step}>{step}</li>)}
                        </ol>
                      )}
                      <div className={styles.faqFooter}>
                        <span className={styles.audienceNote}>Useful for {faq.audiences.map((audience) => ROLE_LABELS[audience]).join(" · ")}</span>
                        {faq.href && faq.linkLabel && <Link href={faq.href} className={styles.faqLink}>{faq.linkLabel}<AdminIcon name="arrow" size={14} /></Link>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <aside className={styles.aside} aria-label="Guide shortcuts">
          <section className={styles.quickLinksCard} aria-labelledby="quick-links-title">
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.cardEyebrow}>Jump straight in</p>
                <h2 id="quick-links-title">Quick links</h2>
              </div>
              <span className={styles.cardHeadingIcon}><AdminIcon name="arrow" size={16} /></span>
            </div>
            <div className={styles.quickLinkList}>
              {QUICK_LINKS.map((item) => (
                <Link key={item.href} href={item.href} className={styles.quickLink}>
                  <span className={styles.quickLinkIcon}><AdminIcon name={item.icon} size={17} /></span>
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  <AdminIcon name="arrow" size={14} />
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.noteCard} aria-labelledby="ledger-note-title">
            <span className={styles.noteIcon}><AdminIcon name="check" size={18} /></span>
            <div>
              <p className={styles.cardEyebrow}>A good habit</p>
              <h2 id="ledger-note-title">Leave a useful trail.</h2>
              <p>Record the reason whenever a movement is waste or an adjustment. Future-you will know what changed and why.</p>
              <Link href="/admin/inventory?movement=receive#stock-movement" className={styles.noteLink}>Open the ledger <AdminIcon name="arrow" size={14} /></Link>
            </div>
          </section>

          <section className={styles.coverageCard} aria-labelledby="coverage-title">
            <p className={styles.cardEyebrow}>Guide coverage</p>
            <h2 id="coverage-title">One place to get unstuck.</h2>
            <div className={styles.coverageStats}>
              <span><strong>{GUIDE_FAQS.length}</strong><small>answers</small></span>
              <span><strong>4</strong><small>roles</small></span>
              <span><strong>6</strong><small>workspaces</small></span>
            </div>
            <p>Start with a question, then use the link in the answer to continue the task in Dumala POS.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
