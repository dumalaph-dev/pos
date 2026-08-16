import "../LandingPage.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingPricing from "@/components/landing/LandingPricing";
import { formatPeso } from "@/lib/money";
import {
  DEFAULT_BILLING_VARIANTS,
  DEFAULT_MONTHLY_PRICE_CENTAVOS,
  billingVariantMonthlyEquivalent,
  calculateBillingVariantPrice,
  type BillingCatalog,
} from "@/lib/platform-operations";
import { readCachedPlatformBillingCatalog } from "@/lib/platform-operations-server";
import { readBillingSummary, type BillingSummary } from "@/lib/pricing-billing-summary";
import { PRICING_DETAIL, PRICING_EXCLUSIONS, PRICING_INCLUDES } from "@/lib/pricing-content";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

const TITLE = "POS System Pricing in the Philippines";
const DESCRIPTION =
  "One price for the complete Dumala POS workspace — no per-terminal, per-branch, or per-staff fees. Free for 14 days, then monthly or annual billing in pesos.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/pricing" },
  // These objects replace the root layout's rather than merging field by field,
  // so the shared keys are repeated. Dropping them is silent — the tags simply
  // stop being emitted and the Twitter card degrades to `summary`.
  openGraph: {
    type: "website",
    siteName: "Dumala POS",
    locale: "en_PH",
    title: `${TITLE} | Dumala POS`,
    description: DESCRIPTION,
    url: "/pricing",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Dumala POS`,
    description: DESCRIPTION,
  },
};

// Matches the root layout: the nonce CSP needs request-time rendering.
export const dynamic = "force-dynamic";

function buildPricingFaqs(catalog: BillingCatalog, billing: BillingSummary) {
  const monthly = formatPeso(catalog.monthlyPriceCentavos);
  const annual = catalog.variants
    .filter((variant) => variant.isActive && variant.intervalUnit === "year")
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const annualAnswer = annual.length > 0
    ? `Yes. ${annual
        .map((variant) => {
          const price = calculateBillingVariantPrice(catalog.monthlyPriceCentavos, variant.intervalUnit, variant.intervalCount, variant.discountPercent);
          const perMonth = billingVariantMonthlyEquivalent(catalog, variant);
          return `${variant.intervalCount} ${variant.intervalCount === 1 ? "year" : "years"} costs ${formatPeso(price)} upfront, about ${formatPeso(perMonth)} per month`;
        })
        .join("; ")}. The picker above shows the current totals.`
    : "Not yet. Monthly billing is the current public option, and annual terms will appear here when they are enabled.";

  return [
    {
      question: "How much does Dumala POS cost?",
      answer: `${monthly} per month for the complete workspace after a 14-day free trial. There are no feature tiers, and no per-terminal, per-branch, or per-staff charges.`,
    },
    {
      question: "Is there a free trial, and do I need a card?",
      answer:
        "There is a 14-day free trial and no card is required to start. You get the complete current product with your own branch, menu, and team — there is no reduced trial version.",
    },
    {
      question: "Can I pay annually and save?",
      answer: annualAnswer,
    },
    {
      question: "How do I pay?",
      answer:
        billing.methods.length > 0
          ? `${billing.methods.map((method) => `${method.name}: ${method.detail}`).join(" ")} ${billing.note}`
          : `Checkout is being finalised with our payment provider. Start the free trial and we will confirm the payment options before it ends.`,
    },
    {
      question: "Does the price change if I open another branch?",
      answer:
        "No. Branches, terminals, staff accounts, and products are unlimited on the same price. Each branch keeps its own catalog, settings, printer, and staff, and the owner sees them together.",
    },
    {
      question: "What happens when the trial ends?",
      answer:
        "You choose a billing term and continue with the same workspace and the same data. If you do not subscribe, the workspace is suspended rather than deleted, so nothing is lost while you decide.",
    },
    {
      question: "Do I have to buy hardware from you?",
      answer:
        "No. If your receipt printer speaks ESC/POS it should work over Bluetooth, Wi-Fi, or USB in 52mm, 58mm, or 80mm. Dumala runs in a browser on the tablet or desktop you already have.",
    },
    {
      question: "Will the price on this page stay current?",
      answer:
        "Yes. This page reads the same pricing catalog the checkout uses, so it updates when the price does. Price changes apply to new checkouts; existing subscriptions are not repriced automatically.",
    },
  ];
}

export default async function PricingPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const catalog = await readCachedPlatformBillingCatalog();
  const billingCatalog: BillingCatalog = catalog ?? {
    currency: "PHP",
    monthlyPriceCentavos: DEFAULT_MONTHLY_PRICE_CENTAVOS,
    variants: DEFAULT_BILLING_VARIANTS,
    schemaAvailable: false,
  };
  const billing = readBillingSummary();
  const faqs = buildPricingFaqs(billingCatalog, billing);
  const hasAnnualOptions = billingCatalog.variants.some((variant) => variant.isActive && variant.intervalUnit === "year");
  const monthlyPrice = formatPeso(billingCatalog.monthlyPriceCentavos);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${siteUrl()}/pricing#product`,
        name: "Dumala POS",
        description: DESCRIPTION,
        brand: { "@type": "Brand", name: "Dumala POS" },
        category: "Point of sale software",
        offers: {
          "@type": "Offer",
          price: (billingCatalog.monthlyPriceCentavos / 100).toFixed(2),
          priceCurrency: billingCatalog.currency,
          availability: "https://schema.org/InStock",
          url: absoluteUrl("/signup"),
        },
      },
      {
        "@type": "FAQPage",
        // Same array as the rendered FAQ below, so the two cannot drift.
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };

  return (
    <main className="lp min-h-screen bg-[#f8f3eb] text-[#102d21]">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingHeader />

      {/* Hero ------------------------------------------------------------- */}
      <section className="lp-sec--hero px-6 pb-10 pt-12 sm:px-10 sm:pb-14 sm:pt-16 lg:px-16">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">Pricing</p>
          <h1 className="mt-3 text-[clamp(2.3rem,5vw,3.6rem)] font-black leading-[1.02] tracking-[-0.05em] text-[#102d21]">
            One price for the whole workspace.
          </h1>
          <p className="mx-auto mt-5 max-w-[620px] text-base leading-7 text-[#526157] sm:text-lg sm:leading-8">
            Dumala POS costs {monthlyPrice} per month for Philippine cafes, restaurants, coffee shops, and bakeshops — the
            complete counter POS and owner workspace, with no per-terminal, per-branch, or per-staff fees. Free for 14 days
            first, and no card is required to start.
          </p>
        </div>
      </section>

      {/* Price picker ------------------------------------------------------ */}
      <section className="px-6 pb-16 sm:px-10 lg:px-16" aria-labelledby="plans-heading">
        <div className="mx-auto max-w-[1100px]">
          <h2 id="plans-heading" className="sr-only">Plans and billing terms</h2>
          <LandingPricing catalog={billingCatalog} pricingIncludes={PRICING_INCLUDES} />
        </div>
      </section>

      {/* What's included --------------------------------------------------- */}
      <section className="border-y border-[#e3dccb] bg-[#fdfaf3] px-6 py-14 sm:px-10 sm:py-20 lg:px-16" aria-labelledby="included-heading">
        <div className="mx-auto max-w-[1100px]">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">What you get</p>
            <h2 id="included-heading" className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.4rem] sm:leading-[1.05]">
              Everything is in the one price.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#657168] sm:text-base">
              There is one product and one price. Nothing below is an upgrade you buy later.
            </p>
          </div>

          <dl className="mt-11 grid gap-4 sm:grid-cols-2">
            {PRICING_DETAIL.map((item) => (
              <div key={item.title} className="rounded-[20px] border border-[#e2dbca] bg-[#fffdf8] p-6">
                <dt className="text-base font-black tracking-[-0.02em] text-[#173a2b]">{item.title}</dt>
                <dd className="mt-2 text-sm leading-6 text-[#657168]">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* What you don't pay for -------------------------------------------- */}
      <section className="px-6 py-14 sm:px-10 sm:py-20 lg:px-16" aria-labelledby="exclusions-heading">
        <div className="mx-auto max-w-[1100px]">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">No surprises</p>
            <h2 id="exclusions-heading" className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.4rem] sm:leading-[1.05]">
              What you never pay extra for.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#657168] sm:text-base">
              Most POS pricing in this market is per terminal, per branch, or per seat. If you are comparing quotes, these are
              the lines that usually move the total.
            </p>
          </div>

          <ul className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRICING_EXCLUSIONS.map((item) => (
              <li key={item.title} className="rounded-[20px] border border-[#e2dbca] bg-[#fdfaf3] p-6">
                <p className="flex items-start gap-2.5 text-base font-black tracking-[-0.02em] text-[#173a2b]">
                  <CheckIcon />
                  {item.title}
                </p>
                <p className="mt-2 pl-6 text-sm leading-6 text-[#657168]">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How billing works -------------------------------------------------- */}
      <section className="border-y border-[#e3dccb] bg-[#fdfaf3] px-6 py-14 sm:px-10 sm:py-20 lg:px-16" aria-labelledby="billing-heading">
        <div className="mx-auto grid max-w-[1100px] gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">After the trial</p>
            <h2 id="billing-heading" className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.4rem] sm:leading-[1.05]">
              How billing works.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#657168] sm:text-base">
              The trial runs for 14 days with no card. When it ends you choose a term and keep the same workspace and the same
              data. If you do not subscribe, the workspace is suspended rather than deleted.
            </p>
            <p className="mt-4 text-sm leading-6 text-[#657168]">{billing.note}</p>
          </div>

          <div className="grid gap-4">
            {billing.methods.length > 0 ? (
              billing.methods.map((method) => (
                <div key={method.name} className="rounded-[20px] border border-[#e2dbca] bg-[#fffdf8] p-6">
                  <p className="text-base font-black tracking-[-0.02em] text-[#173a2b]">{method.name}</p>
                  <p className="mt-2 text-sm leading-6 text-[#657168]">{method.detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-[#e2dbca] bg-[#fffdf8] p-6">
                <p className="text-base font-black tracking-[-0.02em] text-[#173a2b]">Checkout is being finalised</p>
                <p className="mt-2 text-sm leading-6 text-[#657168]">
                  Start the free trial now — we will confirm the payment options with you well before it ends.
                </p>
              </div>
            )}
            <div className="rounded-[20px] border border-[#e2dbca] bg-[#fffdf8] p-6">
              <p className="text-base font-black tracking-[-0.02em] text-[#173a2b]">Prices are in Philippine pesos</p>
              <p className="mt-2 text-sm leading-6 text-[#657168]">
                {hasAnnualOptions
                  ? "Monthly and annual terms are both shown above. Annual terms are billed upfront, and the saving uses the monthly price as the reference."
                  : "Monthly billing is the current public option. Annual terms will appear above when they are enabled."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* BIR ---------------------------------------------------------------- */}
      <section className="px-6 py-14 sm:px-10 sm:py-20 lg:px-16" aria-labelledby="bir-heading">
        <div className="mx-auto max-w-[820px] rounded-[24px] border border-[#dfcda9] bg-[#fdf6e9] p-7 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">Read this before you buy</p>
          <h2 id="bir-heading" className="mt-3 text-2xl font-black tracking-[-0.04em] text-[#173a2b] sm:text-[1.9rem]">
            Dumala is not a BIR-accredited receipt system.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#5c6b60] sm:text-base">
            Dumala prints order slips, not BIR-accredited official receipts. If your business is required to issue official
            receipts from an accredited CRM or POS machine, Dumala does not replace that — you would keep your accredited
            process and use Dumala for the counter, stock, and reporting alongside it.
          </p>
          <p className="mt-4 text-sm leading-7 text-[#5c6b60] sm:text-base">
            Plenty of small food businesses are not in that position, and for them this changes nothing. We would rather you
            know now than discover it after paying, so if you are unsure whether accreditation applies to you, check with your
            accountant or your BIR RDO before you subscribe.
          </p>
        </div>
      </section>

      {/* FAQ ----------------------------------------------------------------- */}
      <section className="border-t border-[#e3dccb] px-6 py-14 sm:px-10 sm:py-20 lg:px-16" aria-labelledby="pricing-faq-heading">
        <div className="mx-auto max-w-[820px]">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b18448]">Pricing questions</p>
            <h2 id="pricing-faq-heading" className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#173a2b] sm:text-[2.4rem] sm:leading-[1.05]">
              Answers before you commit.
            </h2>
          </div>

          <div className="mt-10 grid gap-3">
            {faqs.map((faq) => (
              <details key={faq.question} className="lp-faq group rounded-[18px] border border-[#e2dbca] bg-[#fdfaf3] p-5 sm:p-6">
                <summary className="flex cursor-pointer items-start justify-between gap-4 text-left text-base font-black tracking-[-0.02em] text-[#173a2b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657]">
                  {faq.question}
                  <PlusIcon />
                </summary>
                <p className="mt-3 text-sm leading-7 text-[#657168]">{faq.answer}</p>
              </details>
            ))}
          </div>

          <p className="mt-8 text-center text-sm leading-6 text-[#657168]">
            Still deciding? <Link href="/#playground" className="font-bold text-[#b18448] underline underline-offset-4">Try the POS in your browser</Link>{" "}
            — no account needed.
          </p>
        </div>
      </section>

      {/* CTA ------------------------------------------------------------------ */}
      <section className="px-6 pb-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-[820px] rounded-[24px] bg-[#15382a] p-8 text-center text-[#fffaf1] sm:p-12">
          <h2 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">Start with 14 days free.</h2>
          <p className="mx-auto mt-3 max-w-[30rem] text-sm leading-6 text-[#cad6ca]">
            Set up your branch and menu, run real sales, and decide at the end. No card required.
          </p>
          <Link
            href="/signup"
            className="lp-btn lp-btn--gold mt-7 inline-flex min-h-13 items-center gap-3 rounded-xl bg-[#c39756] px-6 py-3.5 text-sm font-black text-[#16392b] hover:bg-[#d4aa6b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fffaf1]"
          >
            Start your free trial <ArrowIcon />
          </Link>
        </div>
      </section>

      <LandingFooter hasAnnualOptions={hasAnnualOptions} />
    </main>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-[5px] h-3.5 w-3.5 shrink-0 text-[#4e7f57]" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="m3.2 8.3 3 3 6.6-6.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1 h-4 w-4 shrink-0 text-[#b18448] transition-transform group-open:rotate-45" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="lp-arrow h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10h13M11 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
