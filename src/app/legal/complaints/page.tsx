import type { Metadata } from "next";
import { LegalDocument, LegalList, LegalLink, LegalSection, LegalSubsection } from "@/components/legal/LegalDocument";
import { isEmail, legalContact } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Complaints and support",
  description: "Dumala POS support, billing, online-order, and privacy-request redress process.",
  alternates: { canonical: "/legal/complaints" },
};

export default function ComplaintsAndSupportPage() {
  const supportHref = isEmail(legalContact.supportEmail) ? `mailto:${legalContact.supportEmail}` : null;
  const privacyHref = isEmail(legalContact.privacyEmail) ? `mailto:${legalContact.privacyEmail}` : null;

  return (
    <LegalDocument
      eyebrow="Help and redress"
      title="Complaints and support"
      description="This draft process gives customers, business owners, staff users, and data subjects a clear route for reporting a problem and requesting a response. Complete the real support contacts before launch."
    >
      <LegalSection title="1. Start with the right party">
        <LegalList>
          <li><strong className="text-ink">Restaurant order:</strong> contact the restaurant shown on the menu first. It controls food preparation, availability, delivery, payment-at-arrival, refunds, and the sales invoice unless the checkout says otherwise.</li>
          <li><strong className="text-ink">Dumala account, software, or subscription:</strong> contact Dumala support using the details below.</li>
          <li><strong className="text-ink">Privacy request:</strong> contact the organization that controls the data, and copy Dumala when Dumala processes the data for that organization.</li>
          <li><strong className="text-ink">Urgent safety, fraud, or security issue:</strong> report it immediately and do not include passwords, full card details, or unnecessary government identifiers.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="2. How to submit a support complaint">
        <p>Send a message to {supportHref ? <a href={supportHref} className="font-bold text-primary underline underline-offset-4">{legalContact.supportEmail}</a> : <strong className="text-ink">{legalContact.supportEmail}</strong>}. You may also use the support channel published in your account or order confirmation.</p>
        <p>Include only what is needed to investigate:</p>
        <LegalList>
          <li>your name and a safe reply address or mobile number;</li>
          <li>organization, store, or restaurant name;</li>
          <li>order number, invoice or provider reference, and date where relevant;</li>
          <li>a short description of what happened, the requested resolution, and supporting screenshots with unrelated personal data removed.</li>
        </LegalList>
        <p>Do not email passwords, card numbers, CVC/security codes, authentication codes, or complete government ID numbers.</p>
      </LegalSection>

      <LegalSection title="3. What happens next">
        <LegalSubsection title="Acknowledgment">
          <p>We aim to acknowledge a support complaint within two business days where reasonably possible, identify the responsible party, and request only information needed to investigate.</p>
        </LegalSubsection>
        <LegalSubsection title="Investigation and response">
          <p>We will review the account, order, payment, security, or privacy facts available to us; coordinate with the responsible restaurant or provider where appropriate; and explain the resolution, next step, or reason a request cannot be granted.</p>
        </LegalSubsection>
        <LegalSubsection title="Escalation">
          <p>For an Internet Transactions Act complaint, an internal redress request that remains unresolved after seven calendar days may be taken to an appropriate government agency, court, or alternative dispute-resolution channel as permitted by law. This process does not limit emergency reporting, mandatory regulatory reporting, or non-waivable rights.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection title="4. Privacy requests">
        <p>Send data-access, correction, objection, deletion, portability, or consent-withdrawal requests to {privacyHref ? <a href={privacyHref} className="font-bold text-primary underline underline-offset-4">{legalContact.privacyEmail}</a> : <strong className="text-ink">{legalContact.privacyEmail}</strong>}. We may verify identity and coordinate with the merchant PIC when Dumala is acting as processor. Some requests may be limited by tax, accounting, security, legal-retention, or dispute obligations.</p>
        <p>See the <LegalLink href="/legal/privacy">Privacy notice</LegalLink> for the categories of information, purposes, providers, retention requirements, and rights involved.</p>
      </LegalSection>

      <LegalSection title="5. Payment disputes">
        <p>For a Dumala subscription, include the account email and provider reference. For a restaurant order, include the order number and store. Never send full card details. If a provider-side payment dispute remains unresolved, you may also contact the payment provider using its official support channel.</p>
      </LegalSection>

      <LegalSection title="6. Contact details to complete">
        <p>Before publication, confirm that the published business name, physical address, support phone, support email, and privacy/DPO contact in this document are monitored by the responsible team. The current application intentionally shows placeholders when those values have not been configured.</p>
      </LegalSection>
    </LegalDocument>
  );
}
