import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import LandingHeader from "@/components/landing/LandingHeader";
import ScrollReveal from "@/components/landing/ScrollReveal";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import { DEFAULT_MONTHLY_PRICE_CENTAVOS } from "@/lib/platform-operations";
import { readPlatformBillingCatalog } from "@/lib/platform-operations-server";

export const metadata: Metadata = {
  title: "Dumala POS | Run your business with less stress",
  description:
    "An offline-first POS for Philippine counters: a tablet sell screen for cashiers, an owner dashboard for the business, and every branch in one workspace. Start with a 14-day free trial.",
};

type FeatureIconName = "bag" | "chart" | "people" | "bolt";

const featureCards: Array<{
  icon: FeatureIconName;
  title: string;
  description: string;
  points: string[];
}> = [
  {
    icon: "bag",
    title: "Sell with speed",
    description: "Keep checkout clear and quick for every customer, even during the rush.",
    points: ["Fixed-price and by-weight items", "Senior and PWD discounts", "Cash, e-wallet, and card"],
  },
  {
    icon: "chart",
    title: "See what is happening",
    description: "Follow sales, orders, products, and stock from one calm workspace.",
    points: ["Daily and period reports", "Best sellers and slow movers", "CSV export for your books"],
  },
  {
    icon: "people",
    title: "Manage with ease",
    description: "Give managers and cashiers the right access for the branch they work in.",
    points: ["Owner, manager, cashier roles", "Branch-scoped by default", "Every change is logged"],
  },
  {
    icon: "bolt",
    title: "Keep moving",
    description: "Stay ready for busy shifts with a POS designed to work through interruptions.",
    points: ["Sells with no internet", "Queues and syncs on its own", "Install it on any tablet"],
  },
];

const detailPanels: Array<{
  mark: string;
  title: string;
  description: string;
  specs: string[];
}> = [
  {
    mark: "01",
    title: "Checkout that keeps up",
    description:
      "The sell screen is built products-first, so the tap a cashier makes most is the easiest one to reach. Weight items open a keypad; everything else is one tap.",
    specs: [
      "Fixed-price and by-weight items on one ticket",
      "Senior and PWD discounts with ID capture",
      "Cash with change due, GCash, Maya, or card",
      "Hold orders and come back to them",
    ],
  },
  {
    mark: "02",
    title: "A sale is never lost",
    description:
      "The counter should not stop because the internet did. Every order is written to the device first and queued for sync, so the till keeps moving either way.",
    specs: [
      "Orders save locally, then sync in the background",
      "Order numbers are prefixed per branch and device",
      "Prices are snapshotted onto each line item",
      "A status pill shows what is still pending",
    ],
  },
  {
    mark: "03",
    title: "Receipts on the printer you own",
    description:
      "One adapter covers the three ways a receipt printer usually connects, so you are not buying new hardware to start.",
    specs: [
      "Bluetooth, Wi-Fi, or USB behind one adapter",
      "52mm, 58mm, and 80mm ESC/POS layouts",
      "Reconnects between sales on its own",
      "A failed print never loses the sale",
    ],
  },
];

type ModuleIconName =
  | "counter"
  | "receipt"
  | "box"
  | "layers"
  | "user"
  | "truck"
  | "wallet"
  | "bars"
  | "trend"
  | "clock"
  | "tag"
  | "store";

const workspaceModules: Array<{
  icon: ModuleIconName;
  title: string;
  description: string;
}> = [
  { icon: "counter", title: "POS counter", description: "Ring up orders, hold tickets, and print receipts." },
  { icon: "receipt", title: "Orders", description: "One register of every sale, with a receipt-style detail view." },
  { icon: "box", title: "Products", description: "Prices, categories, units, and POS visibility in one place." },
  { icon: "layers", title: "Inventory", description: "Track stock movement and catch low counts early." },
  { icon: "user", title: "Customers", description: "Keep a live directory instead of scattered notes." },
  { icon: "truck", title: "Suppliers", description: "Know who you buy from and how to reach them." },
  { icon: "wallet", title: "Expenses", description: "Log operating costs per branch and keep them auditable." },
  { icon: "bars", title: "Reports", description: "Read the period, compare payments, and export as CSV." },
  { icon: "trend", title: "Sales", description: "Trends by day and hour, best sellers, and period summaries." },
  { icon: "clock", title: "Shifts", description: "Open and close the drawer with counted-versus-expected cash." },
  { icon: "tag", title: "Promotions", description: "See which discounts ran and what they cost you." },
  { icon: "store", title: "Branches & staff", description: "Add a branch, invite the team, set who sees what." },
];

const roles: Array<{ label: string; title: string; points: string[] }> = [
  {
    label: "Owner",
    title: "The whole business",
    points: ["Every branch in one dashboard", "Catalog, pricing, and promotions", "Staff access and the audit log"],
  },
  {
    label: "Manager",
    title: "Their branch",
    points: ["Review orders and inventory", "Log expenses and suppliers", "Close shifts and read the day"],
  },
  {
    label: "Cashier",
    title: "The counter",
    points: ["The sell screen and held orders", "Their own shift and cash count", "No backoffice to get lost in"],
  },
];

const syncSteps: Array<{ step: string; title: string; text: string }> = [
  {
    step: "Local first",
    title: "The sale is saved on the device",
    text: "Every order is written to the tablet before anything else happens. Nothing waits on a network call, so the total never hangs mid-queue.",
  },
  {
    step: "Offline",
    title: "The queue keeps building",
    text: "Signal drops, the counter carries on. Orders, receipts, and shift records keep working, and a status pill shows how many are still pending.",
  },
  {
    step: "Online",
    title: "Everything syncs itself",
    text: "When the connection returns the queue clears in the background. Order numbers are prefixed per branch and device, so nothing is entered twice.",
  },
];

const pricingIncludes = [
  "The tablet POS and the owner dashboard",
  "Offline-first selling with automatic sync",
  "Unlimited branches, staff, and products",
  "ESC/POS receipt printing over BT, Wi-Fi, USB",
  "Inventory, suppliers, and expense tracking",
  "Sales, reports, and CSV export",
  "Shifts, cash counts, and the audit log",
  "Owner, manager, and cashier roles",
];

function buildFaqs(premiumPrice: string): Array<{ question: string; answer: string }> {
  return [
  {
    question: "How does the free trial work?",
    answer:
      "You get 14 days of the full product, free. Every feature is switched on during the trial — nothing is held back or locked behind an upgrade. When the 14 days are up you can subscribe to Premium to keep going.",
  },
  {
    question: "What does it cost after the trial?",
    answer:
      `${premiumPrice} per month for Premium. That is the only paid plan — there are no tiers, no per-branch pricing, and no add-ons to compare. One subscription covers your whole business.`,
  },
  {
    question: "Does it keep working when the internet drops?",
    answer:
      "Yes. Orders are written to the device first and queued for sync, so a cashier can keep selling and printing through an outage. When the connection returns, the queue clears on its own and nothing is entered twice.",
  },
  {
    question: "Can I run more than one branch?",
    answer:
      "Yes. Each branch keeps its own catalog, settings, printer, and staff, and orders stay scoped to the branch they were rung up in. Owners get a consolidated view across all of them.",
  },
  {
    question: "Which receipt printers are supported?",
    answer:
      "ESC/POS printers over Bluetooth, Wi-Fi, or USB, in 52mm, 58mm, and 80mm widths. The printer is configured per device, so each tablet can pair with the printer sitting next to it.",
  },
  {
    question: "Are these BIR-accredited official receipts?",
    answer:
      "Not yet. Dumala prints order slips today, not accredited official receipts. If your business is required to issue official receipts, keep using your accredited process alongside Dumala.",
  },
  {
    question: "What do I need to get started?",
    answer:
      "An owner account and your first branch. You can add products, set your prices, and start ringing up sales before anyone else joins. Your team gets their own logins through a branch access link later.",
  },
  {
    question: "Do I have to install anything?",
    answer:
      "No. Dumala runs in the browser and installs to a tablet or desktop home screen as an app when you want the full-screen experience. There is no app store review to wait on.",
  },
  ];
}

const marqueeItems = [
  "Offline-first, always",
  "Tablet POS + owner dashboard",
  "14-day free trial",
  "Multi-branch ready",
  "Role-based access",
  "ESC/POS receipts",
  "Shift handover",
  "Peso-first pricing",
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="lp-arrow h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10h13M11 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#dfe7dc] text-[#16392b]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="m3.2 8.3 3 3 6.6-6.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function BulletIcon({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${tone === "dark" ? "text-[#c39756]" : "text-[#7f9a83]"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <path d="m3.2 8.3 3 3 6.6-6.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <span className="grid h-11 w-11 place-items-center rounded-full border border-[#173a2b] bg-[#fbf7ef] text-[#173a2b] transition duration-300 group-hover:scale-105 group-hover:bg-[#173a2b] group-hover:text-[#fbf7ef]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="ml-0.5 h-4 w-4" fill="currentColor">
        <path d="M4.25 2.85a.75.75 0 0 1 1.14-.64l6.28 4.15a.75.75 0 0 1 0 1.28l-6.28 4.15a.75.75 0 0 1-1.14-.64V2.85Z" />
      </svg>
    </span>
  );
}

function FeatureIcon({ name }: { name: FeatureIconName }) {
  const paths: Record<FeatureIconName, React.ReactNode> = {
    bag: <><path d="M4.2 6.2h7.6l.7 7.3H3.5l.7-7.3Z" /><path d="M5.7 6.1V4.9a2.3 2.3 0 0 1 4.6 0v1.2" /></>,
    chart: <><path d="M3.5 13.5V8.9M8 13.5V5.7m4.5 7.8V2.5" /><path d="M2.5 13.5h11" /></>,
    people: <><circle cx="6" cy="5.2" r="2.1" /><circle cx="11.4" cy="6.4" r="1.6" /><path d="M2.7 13.5c.2-2.3 1.3-3.6 3.3-3.6s3.1 1.3 3.3 3.6M9.1 10.4c1.9-.7 3.6.4 4.2 2.8" /></>,
    bolt: <path d="m9.2 2.3-5 6.4h3.5l-.9 5 5-6.5H8.3l.9-4.9Z" />,
  };

  return (
    <span className="lp-card__icon grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-[#15382a] text-[#d2a15c] shadow-[0_10px_24px_rgba(21,56,42,0.16)]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-7 w-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35">
        {paths[name]}
      </svg>
    </span>
  );
}

function ModuleIcon({ name }: { name: ModuleIconName }) {
  const paths: Record<ModuleIconName, React.ReactNode> = {
    counter: <><path d="M3.5 5.5h17v10h-17z" /><path d="M8.5 20h7M12 15.5V20" /></>,
    receipt: <><path d="M6.5 3h11v18l-2.4-1.4L12.7 21 12 20.3 11.3 21l-2.4-1.4L6.5 21z" /><path d="M9.8 8.5h4.4M9.8 12.5h4.4" /></>,
    box: <><path d="M12 3.2 20.3 7.5v9L12 20.8 3.7 16.5v-9z" /><path d="M3.7 7.5 12 12l8.3-4.5M12 12v8.8" /></>,
    layers: <><path d="m12 3 8.5 4.3L12 11.6 3.5 7.3z" /><path d="m3.5 12 8.5 4.3 8.5-4.3M3.5 16.7 12 21l8.5-4.3" /></>,
    user: <><circle cx="12" cy="8.2" r="3.7" /><path d="M4.8 20.4c.7-4 3.5-6 7.2-6s6.5 2 7.2 6" /></>,
    truck: <><path d="M3 6.5h10.5v10H3z" /><path d="M13.5 10h3.8l3.2 3.2v3.3h-7" /><circle cx="7" cy="17.6" r="1.9" /><circle cx="17.2" cy="17.6" r="1.9" /></>,
    wallet: <><path d="M3.6 7.6a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v10.8a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z" /><path d="M15.6 13h4.8" /></>,
    bars: <><path d="M5.5 20v-8M12 20V4.5M18.5 20v-5.5" /><path d="M3 20h18" /></>,
    trend: <><path d="m3.5 15.5 5-5 4 3.5 7.5-7" /><path d="M15.5 6.6h4.9v4.9" /></>,
    clock: <><circle cx="12" cy="12" r="8.3" /><path d="M12 7.4V12l3.2 2" /></>,
    tag: <><path d="M11.4 3.2H20v8.6l-8.7 8.7-8.6-8.6z" /><circle cx="16" cy="7.6" r="1.5" /></>,
    store: <><path d="M4.5 10V20h15V10" /><path d="M3 9.8 5.2 4h13.6L21 9.8z" /><path d="M9.8 20v-5.6h4.4V20" /></>,
  };

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e2ddd0] bg-[#f4efe4] text-[#173a2b] transition duration-300 group-hover:border-[#c39756] group-hover:bg-[#15382a] group-hover:text-[#d2a15c]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        {paths[name]}
      </svg>
    </span>
  );
}

/** Schematic of the cashier's tablet sell screen, drawn in the brand palette. */
function PosTabletMock() {
  return (
    <div aria-hidden="true" className="rounded-[20px] border-[6px] border-[#25302a] bg-[#25302a] shadow-[0_18px_40px_rgba(18,43,32,0.22)]">
      <div className="overflow-hidden rounded-[13px] bg-[#f8f4ec]">
        <div className="flex items-center justify-between bg-[#173a2b] px-3 py-2">
          <span className="text-[7px] font-black tracking-[0.16em] text-[#fffaf1]">DUMALA POS</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e2a20] px-2 py-1 text-[6px] font-bold text-[#a9c4ae]">
            <span className="h-1 w-1 rounded-full bg-[#7fb185]" /> OFFLINE · 3 PENDING
          </span>
        </div>
        <div className="grid grid-cols-[34px_minmax(0,1fr)_74px] gap-1.5 p-1.5">
          <div className="grid content-start gap-1 rounded-lg bg-[#e9efe6] p-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-4 rounded ${i === 0 ? "bg-[#173a2b]" : "bg-[#cfdccd]"}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="grid gap-1 rounded-lg border border-[#e3e0d5] bg-[#fffdf8] p-1">
                <span className={`block h-6 rounded ${i % 3 === 0 ? "bg-[#d4a55f]" : "bg-[#c8d4c6]"}`} />
                <span className="block h-1 w-3/4 rounded bg-[#dcdcd2]" />
              </span>
            ))}
          </div>
          <div className="grid content-start gap-1 rounded-lg border border-[#e3e0d5] bg-[#fffdf8] p-1.5">
            <span className="block h-1.5 w-2/3 rounded bg-[#173a2b]" />
            {[0, 1, 2].map((i) => (
              <span key={i} className="mt-0.5 flex items-center justify-between gap-1">
                <span className="block h-1 w-8 rounded bg-[#dcdcd2]" />
                <span className="block h-1 w-4 rounded bg-[#c8c8bd]" />
              </span>
            ))}
            <span className="mt-1 block h-px w-full bg-[#e3e0d5]" />
            <span className="block h-2 w-full rounded bg-[#173a2b]" />
            <span className="block h-4 w-full rounded bg-[#c39756]" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Schematic of the owner's backoffice dashboard. */
function AdminDashboardMock() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-[16px] border border-[#d7d3c6] bg-[#fbf8f1] shadow-[0_18px_40px_rgba(18,43,32,0.16)]">
      <div className="flex items-center gap-1.5 border-b border-[#e5e1d7] bg-[#f1ede3] px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[#cfc9ba]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#cfc9ba]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#cfc9ba]" />
        <span className="ml-2 h-2 w-24 rounded-full bg-[#e4e0d4]" />
      </div>
      <div className="grid grid-cols-[52px_minmax(0,1fr)]">
        <div className="grid content-start gap-1 bg-[#173a2b] p-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`h-2.5 rounded ${i === 0 ? "bg-[#c39756]" : "bg-[#2c5341]"}`} />
          ))}
        </div>
        <div className="p-2.5">
          <div className="grid grid-cols-4 gap-1.5">
            {["₱28.6k", "142", "356", "28"].map((value) => (
              <span key={value} className="grid gap-1 rounded-lg border border-[#e3e0d5] bg-[#fffdf8] px-1.5 py-1.5">
                <span className="block h-1 w-2/3 rounded bg-[#ddd9cd]" />
                <strong className="text-[8px] font-black tabular-nums leading-none text-[#173a2b]">{value}</strong>
              </span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-1.5">
            <span className="rounded-lg border border-[#e3e0d5] bg-[#fffdf8] p-1.5">
              <svg viewBox="0 0 160 46" className="h-[46px] w-full overflow-visible">
                <path d="M3 40 27 36 51 26 75 30 99 18 123 23 157 6" fill="none" stroke="#183b2c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 40 27 36 51 26 75 30 99 18 123 23 157 6V46H3Z" fill="#dce8dc" opacity=".6" />
              </svg>
            </span>
            <span className="grid content-start gap-1.5 rounded-lg border border-[#e3e0d5] bg-[#fffdf8] p-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className={`h-2 w-2 shrink-0 rounded ${i % 2 === 0 ? "bg-[#d4a55f]" : "bg-[#9bb39a]"}`} />
                  <span className="block h-1 w-full rounded bg-[#e0dcd0]" />
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The device render is a transparent PNG, so it gets a built stage to sit on:
 * a warm gradient panel, a dot grid, gold arcs, and a horizon band that reads
 * as the counter surface. Chips sit outside the panel so they are not clipped.
 */
function HeroVisual() {
  return (
    <div
      className="relative mx-auto w-full max-w-[790px]"
      data-lp-reveal="scale"
      style={{ "--lp-delay": "260ms" } as React.CSSProperties}
    >
      <div className="lp-stage relative overflow-hidden rounded-[36px] border border-[#e6dfcd] bg-[linear-gradient(155deg,#fdfbf6_0%,#f6efe0_52%,#efe6d2_100%)] px-5 pb-6 pt-9 shadow-[0_26px_60px_rgba(23,58,43,0.13)] sm:px-9 sm:pb-8 sm:pt-11">
        <div className="lp-dots pointer-events-none absolute inset-0 text-[#173a2b] opacity-[0.07]" />
        <div className="lp-spin-slow pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-dashed border-[#c39756]/45" />
        <div className="pointer-events-none absolute -right-8 top-10 h-44 w-44 rounded-full border border-[#c39756]/30" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] bg-[linear-gradient(180deg,rgba(23,58,43,0)_0%,rgba(23,58,43,0.08)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-[36%] h-px bg-[linear-gradient(90deg,transparent,rgba(195,151,86,0.5),transparent)]" />
        <div className="lp-glow pointer-events-none absolute bottom-[-26%] left-1/2 h-[62%] w-[80%] -translate-x-1/2 rounded-full bg-[#173a2b]/15 blur-[58px]" />

        <div className="relative mb-5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e0d7c2] bg-[#fffdf8]/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5c6b60]">
            Owner dashboard
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e0d7c2] bg-[#fffdf8]/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5c6b60]">
            <span className="lp-dot-pulse h-1.5 w-1.5 rounded-full bg-[#4e7f57]" />
            Synced
          </span>
        </div>

        <div className="lp-float relative">
          <Image
            src="/hero-device.png"
            alt="The Dumala POS owner dashboard on a counter terminal, beside a card reader"
            width={1387}
            height={751}
            priority
            sizes="(min-width: 1024px) 720px, 92vw"
            className="h-auto w-full drop-shadow-[0_28px_44px_rgba(18,43,32,0.26)]"
          />
        </div>
      </div>

      <div className="lp-chip lp-float-slow absolute -left-2 top-[26%] flex items-center gap-3 rounded-2xl border border-[#e2ddd0] bg-[#fffdf8]/95 px-3.5 py-2.5 shadow-[0_16px_34px_rgba(23,58,43,0.14)] backdrop-blur-sm sm:-left-5">
        <span className="lp-dot-pulse grid h-9 w-9 place-items-center rounded-xl bg-[#15382a] text-[#c39756]">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6">
            <path d="M3.5 13.5V8.9M8 13.5V5.7m4.5 7.8V2.5" />
          </svg>
        </span>
        <span className="leading-tight">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-[#8b968b]">Today</span>
          <strong className="block text-[13px] font-black tabular-nums text-[#173a2b]">₱28,650.00</strong>
        </span>
      </div>

      <div className="lp-chip absolute -bottom-4 right-0 flex items-center gap-3 rounded-2xl border border-[#e2ddd0] bg-[#fffdf8]/95 px-3.5 py-2.5 shadow-[0_16px_34px_rgba(23,58,43,0.14)] backdrop-blur-sm sm:right-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#dfe7dc] text-[#16392b]">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2">
            <path d="m3.2 8.3 3 3 6.6-6.7" />
          </svg>
        </span>
        <span className="leading-tight">
          <strong className="block text-[13px] font-black text-[#173a2b]">Sale complete</strong>
          <span className="block text-[10px] font-semibold text-[#798478]">Receipt printed</span>
        </span>
      </div>
    </div>
  );
}

// Keep <main> free of `overflow-hidden`: it would become the scroll container
// and break the sticky header. Sections clip their own decorative overflow.
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const admin = createAdminClient();
  const catalog = admin ? await readPlatformBillingCatalog(admin) : null;
  const premiumPrice = formatPeso(catalog?.monthlyPriceCentavos ?? DEFAULT_MONTHLY_PRICE_CENTAVOS);
  const faqs = buildFaqs(premiumPrice);

  return (
    <main className="lp min-h-screen bg-[#f8f3eb] text-[#102d21]">
      <noscript>
        <style>{`.lp [data-lp-reveal]{opacity:1;transform:none}`}</style>
      </noscript>
      <script
        type="application/ld+json"
        // Same source array as the rendered FAQ, so the two cannot drift apart.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: { "@type": "Answer", text: faq.answer },
            })),
          }),
        }}
      />
      <ScrollReveal />
      <LandingHeader />

      {/* Hero — cream ------------------------------------------------------ */}
      <section className="lp-sec--hero relative overflow-hidden">
        <div className="lp-glow pointer-events-none absolute -left-40 top-0 h-[26rem] w-[26rem] rounded-full bg-[#e8e4d8] opacity-50 blur-3xl" />
        <div className="pointer-events-none absolute right-[-8%] top-[-16%] h-[520px] w-[520px] rounded-full border border-[#dfcda9]/50" />

        <div className="relative mx-auto grid max-w-[1440px] items-center gap-10 px-6 pb-16 pt-8 sm:px-10 sm:pb-20 sm:pt-12 lg:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.18fr)] lg:gap-8 lg:px-16 lg:pb-24 lg:pt-14">
          <div className="max-w-[560px]">
            <p
              className="lp-in inline-flex items-center gap-2.5 rounded-full bg-[#15382a] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#fffaf1] shadow-[0_8px_20px_rgba(21,56,42,0.14)]"
              style={{ "--lp-delay": "60ms" } as React.CSSProperties}
            >
              <span className="lp-dot-pulse h-1.5 w-1.5 rounded-full bg-[#d1a05b]" />
              Offline-first POS · 14-day free trial
            </p>

            <h1
              className="lp-in mt-7 max-w-[560px] text-[clamp(3.1rem,6vw,5.9rem)] font-black leading-[0.94] tracking-[-0.065em] text-[#102d21]"
              style={{ "--lp-delay": "160ms" } as React.CSSProperties}
            >
              Run your business.
              <br />
              <span className="relative inline-block text-[#b18448]">
                Better sales.
                <svg
                  aria-hidden="true"
                  viewBox="0 0 300 14"
                  preserveAspectRatio="none"
                  className="lp-underline absolute -bottom-1 left-0 h-[10px] w-full text-[#c39756]/70"
                  fill="none"
                >
                  <path d="M2 9.5c62-6 128-8 296-4.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
              <br />
              Less stress.
            </h1>

            <p
              className="lp-in mt-7 max-w-[490px] text-base leading-7 text-[#526157] sm:text-lg sm:leading-8"
              style={{ "--lp-delay": "260ms" } as React.CSSProperties}
            >
              A tablet POS for your cashiers and a dashboard for you, on one account. It sells offline first and syncs when
              the connection comes back, so the counter never waits on the internet.
            </p>

            <div className="lp-in mt-8 flex flex-wrap items-center gap-5" style={{ "--lp-delay": "340ms" } as React.CSSProperties}>
              <Link
                href="/signup"
                className="lp-btn inline-flex min-h-14 items-center gap-4 rounded-xl bg-[#15382a] px-5 text-sm font-bold text-[#fffaf1] shadow-[0_12px_28px_rgba(21,56,42,0.2)] hover:bg-[#0e2a20] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657] sm:px-6"
              >
                Start your 14-day free trial <ArrowIcon />
              </Link>
              <a
                href="#how-it-works"
                className="group inline-flex items-center gap-3 text-sm font-bold text-[#173a2b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657]"
              >
                <PlayIcon /> See how it works
              </a>
            </div>

            <div
              className="lp-in mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#667269]"
              style={{ "--lp-delay": "420ms" } as React.CSSProperties}
            >
              <span className="inline-flex items-center gap-2"><CheckIcon /> 14 days free, no card</span>
              <span className="inline-flex items-center gap-2"><CheckIcon /> Then {premiumPrice}/month — one plan</span>
              <span className="inline-flex items-center gap-2"><CheckIcon /> Sells with no internet</span>
            </div>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* Capability marquee — sand ----------------------------------------- */}
      <section aria-label="What Dumala POS covers" className="lp-sec--marquee border-y border-[#e3dccb] py-4">
        <div className="lp-marquee overflow-hidden">
          <div className="lp-marquee__track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1 || undefined}>
                {marqueeItems.map((item) => (
                  <span key={item} className="flex items-center gap-6 whitespace-nowrap px-6 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6c7a6f]">
                    {item}
                    <span className="text-[#c39756]">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — paper --------------------------------------------------- */}
      <section id="features" className="lp-sec--features scroll-mt-24 py-14 sm:py-20">
        <div className="mx-auto max-w-[1380px] px-6 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-2xl text-center" data-lp-reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">Why Dumala</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.6rem] sm:leading-[1.05]">
              Built around the counter, not the spreadsheet.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#657168] sm:text-base">
              Four things a growing shop needs on a busy day, and none of the enterprise weight that gets in the way of them.
            </p>
          </div>

          {/* The reveal wrapper is separate from the card so each element owns
              one transition: the wrapper reveals, the card handles hover. */}
          <div className="mt-11 grid overflow-hidden rounded-[24px] border border-[#ddd8cc] bg-[#fbf8f1] shadow-[0_10px_35px_rgba(35,48,37,0.05)] sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map((feature, index) => (
              <div
                key={feature.title}
                data-lp-reveal
                style={{ "--lp-delay": `${index * 90}ms` } as React.CSSProperties}
                className={index > 0 ? "border-t border-[#e5e1d7] sm:border-l lg:border-t-0" : undefined}
              >
                <article className="lp-card flex h-full flex-col gap-4 p-6">
                  <FeatureIcon name={feature.icon} />
                  <div>
                    <h3 className="text-base font-black text-[#173a2b]">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-5 text-[#68736a]">{feature.description}</p>
                  </div>
                  <ul className="mt-auto grid gap-2 border-t border-[#e9e5db] pt-4 text-xs leading-5 text-[#5f6c62]">
                    {feature.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <BulletIcon />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two interfaces — warm sand ----------------------------------------- */}
      <section id="interfaces" className="lp-sec--interfaces scroll-mt-24 border-y border-[#e6dfd0] py-14 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-2xl text-center" data-lp-reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">Two interfaces</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.6rem] sm:leading-[1.05]">
              A screen for the counter. A screen for the owner.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#657168] sm:text-base">
              Dumala is two purpose-built interfaces on one account — not one crowded screen asked to do both jobs. Both are
              included in the same subscription.
            </p>
          </div>

          <div className="mt-11 grid gap-4 lg:grid-cols-[minmax(0,1fr)_104px_minmax(0,1fr)] lg:gap-0">
            <div data-lp-reveal="left">
              <article className="lp-detail flex h-full flex-col rounded-[24px] border border-[#e2dbca] bg-[#fdfaf3] p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="lp-detail__mark grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#15382a] text-[#d2a15c]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2.6" y="4.6" width="18.8" height="14.8" rx="2.2" />
                      <path d="M17.4 12h.01" />
                    </svg>
                  </span>
                  <span className="rounded-full border border-[#dfd6c3] bg-[#f4efe4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#5c6b60]">
                    For cashiers
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-black tracking-[-0.03em] text-[#173a2b]">The tablet POS</h3>
                <p className="mt-3 text-sm leading-6 text-[#68736a]">
                  A full-screen sell interface sized for a tablet on the counter. Big tap targets, products first, and a
                  running order panel the customer can follow. It keeps selling with no internet at all.
                </p>
                <div className="mt-6">
                  <PosTabletMock />
                </div>
                <ul className="mt-6 grid gap-2.5 border-t border-[#eae3d5] pt-5 text-[13px] leading-5 text-[#5f6c62]">
                  {[
                    "Category rail, product grid, and live order panel",
                    "Weight keypad, discounts, and held orders",
                    "Prints the receipt on the printer beside it",
                    "Cashiers sign in with their own branch login",
                  ].map((point) => (
                    <li key={point} className="lp-spec flex gap-2.5">
                      <BulletIcon />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            {/* Sync connector: horizontal in the middle grid column on desktop,
                vertical between the stacked cards on smaller screens. */}
            <div className="relative flex items-center justify-center py-3 lg:py-0" aria-hidden="true">
              <span className="lp-sync-x absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 lg:block" />
              <span className="lp-sync-y absolute inset-y-0 left-1/2 w-px -translate-x-1/2 lg:hidden" />
              <span className="lp-sync-dot lp-sync-dot--right absolute left-1/2 top-1/2 hidden h-2 w-2 rounded-full bg-[#c39756] lg:block" />
              <span className="lp-sync-dot lp-sync-dot--left absolute left-1/2 top-1/2 hidden h-2 w-2 rounded-full bg-[#15382a] lg:block" />
              <span className="lp-sync-dot lp-sync-dot--down absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-[#c39756] lg:hidden" />
              <span className="lp-sync-dot lp-sync-dot--up absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-[#15382a] lg:hidden" />
              <span className="lp-sync-badge relative grid h-14 w-14 place-items-center rounded-full border border-[#dfd6c3] bg-[#fdfaf3] text-[#173a2b] shadow-[0_10px_24px_rgba(23,58,43,0.12)]">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.2 12a8.2 8.2 0 0 1-13.7 6.1M3.8 12a8.2 8.2 0 0 1 13.7-6.1" />
                  <path d="M17.6 2.4v3.6h-3.6M6.4 21.6V18h3.6" />
                </svg>
              </span>
            </div>

            <div data-lp-reveal="right">
              <article className="lp-detail flex h-full flex-col rounded-[24px] border border-[#e2dbca] bg-[#fdfaf3] p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="lp-detail__mark grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#15382a] text-[#d2a15c]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.4 5.4h17.2v10.2H3.4z" />
                      <path d="M8.6 19.4h6.8M12 15.6v3.8" />
                    </svg>
                  </span>
                  <span className="rounded-full border border-[#dfd6c3] bg-[#f4efe4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#5c6b60]">
                    For owners
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-black tracking-[-0.03em] text-[#173a2b]">The admin dashboard</h3>
                <p className="mt-3 text-sm leading-6 text-[#68736a]">
                  A separate backoffice for the person running the business. Watch the day across every branch, manage the
                  catalog and stock, and read the numbers without standing at the till.
                </p>
                <div className="mt-6">
                  <AdminDashboardMock />
                </div>
                <ul className="mt-6 grid gap-2.5 border-t border-[#eae3d5] pt-5 text-[13px] leading-5 text-[#5f6c62]">
                  {[
                    "Sales, orders, inventory, and expenses in one place",
                    "Every branch on one dashboard, or one at a time",
                    "Products, pricing, promotions, and staff access",
                    "Open it from any browser, at the shop or at home",
                  ].map((point) => (
                    <li key={point} className="lp-spec flex gap-2.5">
                      <BulletIcon />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-[#e2dbca] bg-[#fdfaf3] p-6 sm:p-7" data-lp-reveal>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3.5">
                <span className="lp-sync-badge grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#15382a] text-[#d2a15c]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.2 12a8.2 8.2 0 0 1-13.7 6.1M3.8 12a8.2 8.2 0 0 1 13.7-6.1" />
                    <path d="M17.6 2.4v3.6h-3.6M6.4 21.6V18h3.6" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-base font-black tracking-[-0.02em] text-[#173a2b]">The two screens stay in sync</h3>
                  <p className="mt-1 text-sm leading-5 text-[#68736a]">One account, one set of records — no exporting between them.</p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#cfe0d2] bg-[#eef3ea] px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#2f5c43]">
                <span className="lp-dot-pulse h-1.5 w-1.5 rounded-full bg-[#4e7f57]" />
                Connected
              </span>
            </div>

            <ol className="mt-6 grid gap-3 border-t border-[#eae3d5] pt-6 sm:grid-cols-3">
              {[
                { n: "1", t: "Rung up on the tablet", d: "A cashier completes the sale and the receipt prints." },
                { n: "2", t: "Held on the device", d: "If the connection is down it queues locally and keeps selling." },
                { n: "3", t: "In your dashboard", d: "The moment it syncs, the sale lands in your reports and stock." },
              ].map((item) => (
                <li key={item.n} className="lp-sync-hop rounded-2xl border border-[#e6dfd0] bg-[#f9f5ed] p-4">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#15382a] text-[11px] font-black text-[#d2a15c]">
                    {item.n}
                  </span>
                  <p className="mt-3 text-[13px] font-black text-[#173a2b]">{item.t}</p>
                  <p className="mt-1.5 text-xs leading-5 text-[#68736a]">{item.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Offline-first — deep forest ----------------------------------------- */}
      <section id="offline" className="lp-sec--offline relative scroll-mt-24 overflow-hidden px-6 py-16 text-[#fffaf1] sm:px-10 sm:py-20 lg:px-16">
        <div className="lp-dots pointer-events-none absolute inset-0 text-[#fffaf1] opacity-[0.045]" />
        <div className="lp-glow pointer-events-none absolute -right-24 top-[-20%] h-80 w-80 rounded-full bg-[#c39756]/12 blur-3xl" />

        <div className="relative mx-auto max-w-[1280px]">
          <div className="max-w-2xl" data-lp-reveal="left">
            <p className="inline-flex items-center gap-2.5 rounded-full bg-[#1d4834] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#fffaf1]">
              <span className="lp-dot-pulse h-1.5 w-1.5 rounded-full bg-[#d1a05b]" />
              Offline first, online when it can be
            </p>
            <h2 className="mt-6 text-3xl font-black leading-[1.04] tracking-[-0.05em] sm:text-[2.8rem]">
              The counter never waits for the internet.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#cad6ca] sm:text-base">
              Dumala is local-first by design. The tablet is the source of truth during a sale, and the cloud catches up
              afterwards — not the other way around. A brownout, a dead router, or a slow mobile signal does not stop a sale.
            </p>
          </div>

          <div className="mt-11 grid gap-3 md:grid-cols-3">
            {syncSteps.map((item, index) => (
              <div key={item.step} data-lp-reveal style={{ "--lp-delay": `${index * 110}ms` } as React.CSSProperties}>
                <article className="lp-step h-full rounded-2xl border border-[#3f5f4c] bg-[#17402f] p-5 sm:p-6">
                  <span className="relative inline-flex items-center gap-2 rounded-full bg-[#0f2c20] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#d2a15c]">
                    {item.step}
                  </span>
                  <h3 className="relative mt-4 text-base font-black leading-5">{item.title}</h3>
                  <p className="relative mt-3 text-sm leading-6 text-[#c8d4c9]">{item.text}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Detail panels — warm sand ------------------------------------------ */}
      <section id="details" className="lp-sec--details scroll-mt-24 py-14 sm:py-20">
        <div className="mx-auto max-w-[1380px] px-6 sm:px-10 lg:px-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between" data-lp-reveal="left">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">In detail</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.6rem] sm:leading-[1.05]">
                Made for the way a counter actually works.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#657168]">
              Peso pricing, weighed goods, senior and PWD discounts, and a network that comes and goes. The details are the
              product.
            </p>
          </div>

          <div className="mt-11 grid gap-4 lg:grid-cols-3">
            {detailPanels.map((panel, index) => (
              <div key={panel.mark} data-lp-reveal style={{ "--lp-delay": `${index * 100}ms` } as React.CSSProperties}>
                <article className="lp-detail flex h-full flex-col rounded-[22px] border border-[#e2dbca] bg-[#fdfaf3] p-6 sm:p-7">
                  <span className="lp-detail__mark inline-grid h-11 w-11 place-items-center rounded-[14px] bg-[#15382a] text-[13px] font-black tracking-[0.06em] text-[#d2a15c]">
                    {panel.mark}
                  </span>
                  <h3 className="mt-5 text-xl font-black tracking-[-0.03em] text-[#173a2b]">{panel.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#68736a]">{panel.description}</p>
                  <ul className="mt-5 grid gap-2.5 border-t border-[#eae3d5] pt-5 text-[13px] leading-5">
                    {panel.specs.map((spec) => (
                      <li key={spec} className="lp-spec flex gap-2.5 text-[#5f6c62]">
                        <BulletIcon />
                        {spec}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workspace modules — light paper ------------------------------------ */}
      <section id="workspace" className="lp-sec--workspace scroll-mt-24 py-14 sm:py-20">
        <div className="mx-auto max-w-[1380px] px-6 sm:px-10 lg:px-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between" data-lp-reveal="left">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">One workspace</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.6rem] sm:leading-[1.05]">
                Everything the day needs, in one place.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#657168]">
              Every part of Dumala shares the same branch context, so the counter, the stockroom, and the owner are never
              looking at different numbers.
            </p>
          </div>

          <div className="mt-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {workspaceModules.map((module, index) => (
              <div key={module.title} data-lp-reveal style={{ "--lp-delay": `${(index % 4) * 80}ms` } as React.CSSProperties}>
                <article className="group h-full rounded-2xl border border-[#e2ddd0] bg-[#fbf8f1] p-5 transition duration-300 hover:-translate-y-1 hover:border-[#cfc7b5] hover:bg-[#fffdf8] hover:shadow-[0_18px_38px_rgba(35,48,37,0.08)]">
                  <ModuleIcon name={module.icon} />
                  <h3 className="mt-4 text-sm font-black text-[#173a2b]">{module.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-[#68736a]">{module.description}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — forest ---------------------------------------------- */}
      <section id="how-it-works" className="relative scroll-mt-24 overflow-hidden bg-[#15382a] px-6 py-16 text-[#fffaf1] sm:px-10 sm:py-24 lg:px-16">
        <div className="lp-glow pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#c39756]/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-[-10%] h-[420px] w-[420px] rounded-full border border-[#c39756]/15" />
        <div className="lp-tex-grid-warm pointer-events-none absolute inset-0" />

        <div className="relative mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-20">
          <div data-lp-reveal="left">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d1a05b]">Simple by design</p>
            <h2 className="mt-4 max-w-lg text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-5xl">
              The right tools for the work in front of you.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#cad6ca] sm:text-base">
              Start small, then make the workspace your own as your business grows. Dumala keeps the important things close
              without making the counter feel complicated.
            </p>
            <Link
              href="/signup"
              className="lp-btn lp-btn--gold mt-8 inline-flex items-center gap-3 rounded-xl bg-[#c39756] px-5 py-3.5 text-sm font-black text-[#16392b] hover:bg-[#d4aa6b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fffaf1]"
            >
              Start with Dumala <ArrowIcon />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { number: "01", title: "Set up your workspace", text: "Create your business account and first branch in a few focused steps." },
              { number: "02", title: "Give your team access", text: "Share a unique branch link with managers and cashiers, each with their own login." },
              { number: "03", title: "Run the day", text: "Sell, watch the numbers, and make decisions with less manual work." },
            ].map((step, index) => (
              <div key={step.number} data-lp-reveal="right" style={{ "--lp-delay": `${index * 110}ms` } as React.CSSProperties}>
                <article className="lp-step h-full rounded-2xl border border-[#55705d] bg-[#1a422f] p-5">
                  <span className="lp-step__ghost" aria-hidden="true">{step.number}</span>
                  <span className="relative text-xs font-black tracking-[0.18em] text-[#c39756]">{step.number}</span>
                  <h3 className="relative mt-10 text-base font-black leading-5">{step.title}</h3>
                  <p className="relative mt-3 text-sm leading-6 text-[#c8d4c9]">{step.text}</p>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles — deep sand --------------------------------------------------- */}
      <section id="for-teams" className="lp-sec--teams scroll-mt-24 border-b border-[#e6dfd0] py-14 sm:py-20">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-2xl text-center" data-lp-reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">For teams</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.6rem] sm:leading-[1.05]">
              Everyone sees the part that is theirs.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#657168] sm:text-base">
              Access follows the role and the branch, so a cashier never lands in the backoffice and a manager never has to
              ask the owner for the day&apos;s numbers.
            </p>
          </div>

          <div className="mt-11 grid gap-4 md:grid-cols-3">
            {roles.map((role, index) => (
              <div key={role.label} data-lp-reveal style={{ "--lp-delay": `${index * 100}ms` } as React.CSSProperties}>
                <article className="lp-role flex h-full flex-col rounded-[22px] border border-[#ded6c4] bg-[#fbf8f1] p-6">
                  <span className="lp-role__badge inline-flex w-fit items-center rounded-full bg-[#15382a] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#d2a15c]">
                    {role.label}
                  </span>
                  <h3 className="mt-4 text-lg font-black tracking-[-0.03em] text-[#173a2b]">{role.title}</h3>
                  <ul className="mt-4 grid gap-2.5 border-t border-[#eae3d5] pt-4 text-[13px] leading-5 text-[#5f6c62]">
                    {role.points.map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <BulletIcon />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — cream ------------------------------------------------------ */}
      <section id="pricing" className="lp-sec--pricing scroll-mt-24 py-14 sm:py-20">
        <div className="mx-auto max-w-[1100px] px-6 sm:px-10">
          <div className="mx-auto max-w-2xl text-center" data-lp-reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">Pricing</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.6rem] sm:leading-[1.05]">
              Try it free for 14 days. Then one plan, one price.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#657168] sm:text-base">
              There is no Starter, no Pro, and no enterprise call. Every business on Dumala gets the same complete product —
              the tablet POS and the owner dashboard together.
            </p>
          </div>

          <div className="mt-11 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div data-lp-reveal="left">
              <article className="flex h-full flex-col justify-center rounded-[24px] border border-dashed border-[#c9bfa6] bg-[#fdfaf3] p-7 text-center sm:p-9">
                <span className="lp-dot-pulse mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#dfe7dc] text-[#16392b]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8.4" />
                    <path d="M12 7.2V12l3.3 2.1" />
                  </svg>
                </span>
                <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[#b18448]">Start here</p>
                <p className="mt-2 text-[3.4rem] font-black leading-none tracking-[-0.06em] text-[#173a2b]">14</p>
                <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[#173a2b]">days free</p>
                <p className="mx-auto mt-4 max-w-[16rem] text-sm leading-6 text-[#68736a]">
                  The complete product, unlocked, with no card required. Set up your branch and start ringing up real sales
                  the same day.
                </p>
              </article>
            </div>

            <div data-lp-reveal="right">
              <article className="relative h-full overflow-hidden rounded-[24px] border border-[#25503b] bg-[#15382a] p-7 text-[#fffaf1] shadow-[0_26px_54px_rgba(21,56,42,0.24)] sm:p-9">
                <div className="lp-dots pointer-events-none absolute inset-0 text-[#fffaf1] opacity-[0.05]" />
                <div className="lp-spin-slow pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full border border-dashed border-[#c39756]/30" />

                <div className="relative flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-[#c39756] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#16392b]">
                    Premium
                  </span>
                  <span className="rounded-full border border-[#3f5f4c] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#a9c4ae]">
                    The only paid plan
                  </span>
                </div>

                <p className="relative mt-6 flex flex-wrap items-baseline gap-2">
                  <span className="text-[3.6rem] font-black leading-none tracking-[-0.06em] tabular-nums">{premiumPrice}</span>
                  <span className="text-sm font-bold text-[#a9c4ae]">/ month</span>
                </p>
                <p className="relative mt-3 max-w-md text-sm leading-6 text-[#cad6ca]">
                  Premium is a monthly subscription, billed after your trial ends. One plan covers every branch, every staff
                  login, and both interfaces — cancel whenever you like.
                </p>

                <ul className="relative mt-6 grid gap-2.5 border-t border-[#2c5341] pt-6 text-[13px] leading-5 text-[#dbe4da] sm:grid-cols-2">
                  {pricingIncludes.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <BulletIcon tone="dark" />
                      {item}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className="lp-btn lp-btn--gold relative mt-7 inline-flex min-h-13 items-center gap-3 rounded-xl bg-[#c39756] px-5 py-3.5 text-sm font-black text-[#16392b] hover:bg-[#d4aa6b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fffaf1]"
                >
                  Start your 14-day free trial <ArrowIcon />
                </Link>
                <p className="relative mt-3 text-xs text-[#9fb5a5]">No card required to start. Subscribe when the trial ends.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — cream --------------------------------------------------------- */}
      <section id="faq" className="lp-sec--faq scroll-mt-24 py-14 sm:py-20">
        <div className="mx-auto max-w-[900px] px-6 sm:px-10">
          <div className="text-center" data-lp-reveal>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">Questions</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.6rem] sm:leading-[1.05]">
              The things owners ask first.
            </h2>
          </div>

          <div className="mt-10 grid gap-3">
            {faqs.map((faq, index) => (
              <div key={faq.question} data-lp-reveal style={{ "--lp-delay": `${index * 60}ms` } as React.CSSProperties}>
                <details className="lp-faq group rounded-2xl border border-[#e2ddd0] bg-[#fbf8f1] px-5 py-4 sm:px-6">
                  <summary className="flex items-center justify-between gap-4 text-sm font-black text-[#173a2b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657] sm:text-base">
                    {faq.question}
                    <span className="lp-faq__chevron grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#ddd8cc] text-[#173a2b]">
                      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="m3.5 6 4.5 4.5L12.5 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <p className="lp-faq__body mt-3 max-w-[68ch] text-sm leading-6 text-[#68736a]">{faq.answer}</p>
                </details>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA ------------------------------------------------------------ */}
      <section id="start" className="lp-sec--cta scroll-mt-24 px-6 py-16 sm:px-10 sm:py-24 lg:px-16">
        <div className="mx-auto max-w-[1280px]">
          <div
            className="relative overflow-hidden rounded-[28px] border border-[#d9d4c8] bg-[linear-gradient(150deg,#f2ede1_0%,#eae3d3_100%)] px-6 py-11 sm:px-10 lg:px-14"
            data-lp-reveal="scale"
          >
            <div className="lp-dots pointer-events-none absolute inset-0 text-[#173a2b] opacity-[0.05]" />
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full border-[18px] border-[#e0c48e]/40 lp-spin-slow" />
            <div className="pointer-events-none absolute -left-16 bottom-[-40%] h-56 w-56 rounded-full bg-[#c39756]/12 blur-2xl" />
            <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b18448]">Ready when you are</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.045em] text-[#173a2b] sm:text-4xl">
                  Give your business a calmer way to run.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#657168] sm:text-base">
                  Take the full product for 14 days, free and without a card. Keep it for {premiumPrice} a month — the one
                  plan that includes both the tablet POS and your owner dashboard.
                </p>
              </div>
              <div className="shrink-0">
                <Link
                  href="/signup"
                  className="lp-btn inline-flex items-center gap-4 rounded-xl bg-[#15382a] px-5 py-3.5 text-sm font-bold text-[#fffaf1] shadow-[0_10px_22px_rgba(21,56,42,0.16)] hover:bg-[#0e2a20] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657]"
                >
                  Start your free trial <ArrowIcon />
                </Link>
                <p className="mt-3 text-xs text-[#7d887f]">14 days free · then {premiumPrice}/month</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer — deep sand ---------------------------------------------------- */}
      <footer className="lp-sec--footer border-t border-[#ddd5c4] px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[1280px]">
          <div className="flex flex-col gap-9 sm:flex-row sm:justify-between">
            <div className="max-w-xs">
              <Link href="/" aria-label="Dumala POS home" className="lp-logo inline-block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#173a2b]">
                <Image src="/brand-lockup.png" alt="Dumala POS" width={1535} height={451} sizes="160px" className="h-11 w-auto" />
              </Link>
              <p className="mt-4 text-xs leading-5 text-[#708076]">
                An offline-first tablet POS and owner dashboard, built for Philippine counters and peso pricing. Free for 14
                days, then {premiumPrice} a month — one plan, everything included.
              </p>
            </div>

            <div className="grid gap-8 text-xs sm:grid-cols-3 sm:gap-12">
              <div>
                <p className="font-black uppercase tracking-[0.16em] text-[#173a2b]">Product</p>
                <ul className="mt-3 grid gap-2 text-[#708076]">
                  <li><a href="#features" className="lp-navlink hover:text-[#b18448]">Features</a></li>
                  <li><a href="#interfaces" className="lp-navlink hover:text-[#b18448]">Tablet POS &amp; dashboard</a></li>
                  <li><a href="#offline" className="lp-navlink hover:text-[#b18448]">Offline first</a></li>
                  <li><a href="#details" className="lp-navlink hover:text-[#b18448]">In detail</a></li>
                  <li><a href="#workspace" className="lp-navlink hover:text-[#b18448]">Workspace</a></li>
                </ul>
              </div>
              <div>
                <p className="font-black uppercase tracking-[0.16em] text-[#173a2b]">Learn</p>
                <ul className="mt-3 grid gap-2 text-[#708076]">
                  <li><a href="#pricing" className="lp-navlink hover:text-[#b18448]">Pricing</a></li>
                  <li><a href="#how-it-works" className="lp-navlink hover:text-[#b18448]">How it works</a></li>
                  <li><a href="#for-teams" className="lp-navlink hover:text-[#b18448]">For teams</a></li>
                  <li><a href="#faq" className="lp-navlink hover:text-[#b18448]">FAQ</a></li>
                </ul>
              </div>
              <div>
                <p className="font-black uppercase tracking-[0.16em] text-[#173a2b]">Access</p>
                <ul className="mt-3 grid gap-2 text-[#708076]">
                  <li><Link href="/signup" className="lp-navlink hover:text-[#b18448]">Start free trial</Link></li>
                  <li><Link href="/login" className="lp-navlink hover:text-[#b18448]">Owner log in</Link></li>
                  <li><Link href="/platform/login" className="lp-navlink hover:text-[#b18448]">Platform access</Link></li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      </footer>
    </main>
  );
}
