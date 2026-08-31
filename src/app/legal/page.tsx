import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalList, LegalSection } from "@/components/legal/LegalDocument";
import { legalDocumentLinks } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Legal center",
  description: "Dumala POS legal, privacy, billing, ordering, and support documents.",
  alternates: { canonical: "/legal" },
};

export default function LegalCenterPage() {
  return (
    <LegalDocument
      eyebrow="Legal center"
      title="Clear terms for the businesses and customers we serve."
      description="These documents describe how Dumala POS provides its software, supports online ordering, handles payments, and processes personal data. They are draft launch documents until the marked business details and policies are completed and reviewed."
    >
      <LegalSection title="Choose a document">
        <div className="grid gap-3 sm:grid-cols-2">
          {legalDocumentLinks.map((document) => (
            <Link key={document.href} href={document.href} className="group rounded-card border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="text-base font-extrabold text-primary group-hover:text-accent-hover">{document.label}</span>
              <span className="mt-2 block text-sm leading-6 text-ink-muted">Read the current Dumala POS baseline for this area.</span>
            </Link>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="Before public launch">
        <p>The legal pages are connected to the signup, subscription, and public ordering journeys, but publication alone does not make the service compliant. Complete the identity and contact fields, confirm the final commercial policies, and obtain Philippine legal, privacy, and tax review.</p>
        <LegalList>
          <li>Confirm whether Dumala is acting as a software provider, online merchant, digital platform, or e-marketplace for each transaction.</li>
          <li>Confirm the BIR invoice, CAS, and electronic-invoicing position for Dumala and each restaurant using the platform.</li>
          <li>Complete the privacy impact assessment, data-processing agreements, retention schedule, and breach-response plan.</li>
          <li>Publish only after the business identity, support, privacy, and DPO values on this page are real and monitored.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Document hierarchy">
        <p>If a specific restaurant menu or checkout shows a merchant-specific policy, that policy supplements these general documents for the relevant order. If a term conflicts with a non-waivable consumer, tax, privacy, or other legal requirement, the applicable law controls.</p>
      </LegalSection>
    </LegalDocument>
  );
}
