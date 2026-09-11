import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalSection } from "@/components/legal/LegalDocument";
import { legalDocumentLinks } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Legal center",
  description: "Dumala POS legal, privacy, billing, ordering, tax, consumer, and support information.",
  alternates: { canonical: "/legal" },
};

const documentDescriptions: Record<string, string> = {
  "/legal/privacy": "How Dumala and the restaurants using it handle personal information, privacy requests, and security.",
  "/legal/terms": "The rules for using Dumala POS, the owner workspace, menus, and related services.",
  "/legal/online-ordering": "What to expect when placing a pickup or delivery order through a Dumala-powered menu.",
  "/legal/billing": "Subscription plans, renewals, cancellation, refunds, invoices, and payment-provider terms.",
  "/legal/cookies": "How cookies, browser storage, and offline POS data support the service.",
  "/legal/complaints": "Where to go for account, billing, technical, restaurant-order, or privacy assistance.",
};

const legalFrameworks = [
  {
    title: "Internet Transactions Act (RA 11967)",
    href: "https://lawphil.net/statutes/repacts/ra2023/ra_11967_2023.html",
    summary: "Online-business disclosures, transaction records, invoices, privacy safeguards, and redress.",
  },
  {
    title: "Data Privacy Act (RA 10173)",
    href: "https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html",
    summary: "Transparency, lawful processing, security, retention, and data-subject rights.",
  },
  {
    title: "Consumer Act (RA 7394)",
    href: "https://lawphil.net/statutes/repacts/ra1992/ra_7394_1992.html",
    summary: "Fair information, protection from deceptive practices, and consumer remedies.",
  },
  {
    title: "Electronic Commerce Act (RA 8792)",
    href: "https://lawphil.net/statutes/repacts/ra2000/ra_8792_2000.html",
    summary: "Recognition of electronic data, records, signatures, and commercial transactions.",
  },
  {
    title: "Food Safety Act (RA 10611)",
    href: "https://lawphil.net/statutes/repacts/ra2013/ra_10611_2013.html",
    summary: "Food-safety, labeling, and food-business responsibilities for restaurant sellers.",
  },
  {
    title: "Tax and invoicing guidance",
    href: "https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025.pdf",
    summary: "BIR registration, invoicing, and electronic-invoicing rules may apply by taxpayer type.",
  },
] as const;

export default function LegalCenterPage() {
  return (
    <LegalDocument
      eyebrow="Legal center"
      title="Clear policies for every order, subscription, and account."
      description="Review the terms that shape how Dumala POS handles restaurant orders, subscriptions, payments, privacy, and support—all in one place."
      density="compact"
    >
      <LegalSection title="Choose a document" compact>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {legalDocumentLinks.map((document) => (
            <Link key={document.href} href={document.href} className="group rounded-card border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="flex items-start justify-between gap-4">
                <span className="text-sm font-extrabold leading-5 text-primary group-hover:text-accent-hover">{document.label}</span>
                <span aria-hidden="true" className="text-base font-black leading-5 text-accent transition-transform group-hover:translate-x-1">→</span>
              </span>
              <span className="mt-2 block text-[12px] leading-5 text-ink-muted">{documentDescriptions[document.href]}</span>
            </Link>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="How these policies apply" compact>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-card border border-line bg-secondary/35 p-4">
            <h3 className="text-sm font-extrabold leading-5 text-primary">Dumala accounts and subscriptions</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">The Terms of Service and Billing and refunds policy apply when you create an account, use the POS workspace, or subscribe to Dumala.</p>
          </article>
          <article className="rounded-card border border-line bg-secondary/35 p-4">
            <h3 className="text-sm font-extrabold leading-5 text-primary">Restaurant orders</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">The restaurant shown on the menu is normally responsible for the food transaction, preparation, fulfillment, support, and applicable refund.</p>
          </article>
          <article className="rounded-card border border-line bg-secondary/35 p-4">
            <h3 className="text-sm font-extrabold leading-5 text-primary">Personal information</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">Dumala is responsible for data used for its own accounts, billing, support, and security. A restaurant generally controls customer and staff data it submits to the service.</p>
          </article>
          <article className="rounded-card border border-line bg-secondary/35 p-4">
            <h3 className="text-sm font-extrabold leading-5 text-primary">Payments, tax, and invoices</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">Payment-provider terms may also apply. Dumala handles its own subscription records; each restaurant handles the tax treatment and sales invoice for its food transactions.</p>
          </article>
        </div>
        <p>For account, billing, technical, or privacy questions, contact Dumala. For a food-order question, contact the restaurant shown on the order. Restaurant-specific policies supplement these general documents, and mandatory law controls where applicable.</p>
      </LegalSection>

      <LegalSection title="Relevant Philippine legal framework" compact>
        <p>These are the main legal frameworks relevant to the current Dumala feature set. They are provided for context; the policy that applies to a specific transaction and any mandatory law control where they differ.</p>
        <details className="rounded-card border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-extrabold text-primary marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            View official sources <span aria-hidden="true" className="ml-1 text-accent">↗</span>
          </summary>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {legalFrameworks.map((framework) => (
              <a key={framework.href} href={framework.href} target="_blank" rel="noreferrer" className="rounded-xl border border-line bg-secondary/35 p-3 transition hover:border-accent/60 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[12px] font-extrabold leading-4 text-primary">{framework.title}</span>
                  <span aria-hidden="true" className="text-xs font-black text-accent">↗</span>
                </span>
                <span className="mt-1.5 block text-[11px] leading-4 text-ink-muted">{framework.summary}</span>
              </a>
            ))}
          </div>
        </details>
      </LegalSection>

      <LegalSection title="Your protections and responsibilities" compact>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-card border border-line bg-surface p-4">
            <h3 className="text-sm font-extrabold leading-5 text-primary">Before you order</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">Review the restaurant, items, prices, fees, taxes, fulfillment method, contact details, and cancellation terms shown before checkout.</p>
          </article>
          <article className="rounded-card border border-line bg-surface p-4">
            <h3 className="text-sm font-extrabold leading-5 text-primary">If something goes wrong</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">Contact the restaurant for food-order issues and Dumala for platform, subscription, billing, technical, or privacy issues. The <Link href="/legal/complaints" className="font-bold text-primary underline underline-offset-4">support process</Link> explains escalation.</p>
          </article>
          <article className="rounded-card border border-line bg-surface p-4">
            <h3 className="text-sm font-extrabold leading-5 text-primary">Use the service safely</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">Keep account access secure, submit only information you may lawfully provide, and never send passwords, full card details, or unnecessary government identifiers.</p>
          </article>
        </div>
        <p className="text-[12px] leading-5">This Legal Center is a plain-language summary, not an exhaustive statement of every law that may apply. Additional obligations can depend on a seller’s products, employees, location, payment setup, and data processing.</p>
      </LegalSection>
    </LegalDocument>
  );
}
