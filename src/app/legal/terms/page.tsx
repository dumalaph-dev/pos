import type { Metadata } from "next";
import { LegalDocument, LegalList, LegalLink, LegalSection } from "@/components/legal/LegalDocument";
import { legalContact } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The baseline terms for using Dumala POS and its owner workspace.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsOfServicePage() {
  return (
    <LegalDocument
      eyebrow="Terms"
      title="Terms of service"
      description="These draft terms govern access to Dumala POS, the owner workspace, public menus, and related services. They must be completed and reviewed for the final Dumala entity, commercial policy, and Philippine law before publication."
    >
      <LegalSection title="1. Agreement and definitions">
        <p>These Terms of Service are between <strong className="text-ink">{legalContact.legalEntityName}</strong>, doing business as Dumala POS (“Dumala,” “we,” “us,” or “our”), and the person or organization using the service (“you”). “Service” means the Dumala website, POS application, owner workspace, public menu, online-ordering tools, APIs, support, and related features.</p>
        <p>By creating an account, using the Service, accepting an order, or starting a subscription, you agree to these Terms and the documents linked from the <LegalLink href="/legal">Legal center</LegalLink>. If you use Dumala for an organization, you confirm that you have authority to bind it.</p>
      </LegalSection>

      <LegalSection title="2. Eligibility and accounts">
        <LegalList>
          <li>Provide accurate, current business and contact information and keep it updated.</li>
          <li>Use a unique account for each authorized person. Do not share passwords, PINs, payment credentials, or administrator access.</li>
          <li>Protect devices and promptly disable staff, device, or branch access that is no longer authorized.</li>
          <li>Notify Dumala promptly of suspected compromise, unauthorized access, or inaccurate billing.</li>
        </LegalList>
        <p>You are responsible for activity performed through your accounts unless the activity resulted from Dumala’s failure to apply reasonable security after notice.</p>
      </LegalSection>

      <LegalSection title="3. Free trial and subscriptions">
        <p>Dumala currently offers a fourteen-day trial without requiring a card at signup. A paid subscription begins only when you choose an available billing term and complete the applicable checkout. The price, billing interval, branch capacity, taxes, and payment method shown at checkout control that purchase.</p>
        <p>Monthly subscriptions may renew automatically through the payment provider. Annual or other term billing may be prepaid or subject to the renewal setting shown at checkout. Review <LegalLink href="/legal/billing">Billing and refunds</LegalLink> before paying. Cancel before the next renewal if you do not want another charge.</p>
      </LegalSection>

      <LegalSection title="4. Payments, invoices, and taxes">
        <p>Payments may be processed by PayMongo or another provider identified at checkout. Dumala is designed not to store your full card number or security code, but the payment provider may process them under its own terms and security program. You authorize the provider to process the selected payment and any permitted recurring charge.</p>
        <p>Dumala will issue or facilitate the applicable invoice for its own subscription as required by law. A Dumala order slip is not a BIR-accredited official tax invoice unless Dumala expressly states otherwise in writing. Each restaurant remains responsible for issuing its own compliant sales invoice for food or other goods it sells through a menu.</p>
        <p>You are responsible for your business registration, BIR, VAT, invoicing, permits, payroll, food, and other regulatory obligations. Dumala does not provide legal, accounting, tax, food-safety, or employment advice.</p>
      </LegalSection>

      <LegalSection title="5. Restaurant menus and online orders">
        <p>Dumala may provide software that lets a restaurant publish a menu and accept pickup or delivery requests. Unless the checkout expressly identifies Dumala as the seller, the restaurant is the seller and merchant of record for the food, price, preparation, fulfillment, refund, consumer support, permits, and sales invoice. See <LegalLink href="/legal/online-ordering">Online ordering terms</LegalLink>.</p>
        <p>Restaurant users must publish accurate menus, prices, availability, VAT treatment, service areas, contact details, cancellation rules, and permits where applicable. They must not use Dumala to list prohibited, unsafe, counterfeit, or unlawfully regulated goods.</p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>You must not:</p>
        <LegalList>
          <li>access or probe another organization’s data, account, branch, device, or order;</li>
          <li>submit fake, duplicate, fraudulent, abusive, or intentionally misleading orders;</li>
          <li>upload malware, unlawful content, personal data without a lawful basis, or content that infringes another person’s rights;</li>
          <li>circumvent access controls, rate limits, billing, audit trails, or security measures;</li>
          <li>use the Service to send unsolicited commercial messages or to process sensitive information beyond the approved business purpose; or</li>
          <li>resell, copy, reverse engineer, or commercially exploit the Service except as expressly permitted.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="7. Your content and data">
        <p>You retain ownership of business content and information you submit. You grant Dumala a limited, non-exclusive license to host, copy, process, transmit, display, and back up that content as needed to provide, secure, support, and improve the Service.</p>
        <p>You represent that you have the rights, notices, consents, and instructions needed for the data you submit. The <LegalLink href="/legal/privacy">Privacy notice</LegalLink> and any merchant data-processing agreement describe the parties’ privacy roles and responsibilities.</p>
      </LegalSection>

      <LegalSection title="8. Availability, offline mode, and backups">
        <p>Dumala may be unavailable because of maintenance, provider outages, connectivity, device failure, emergency, or events outside our reasonable control. Offline features can queue data locally and may require later synchronization. Users must use approved devices, sign out, protect local storage, and verify synchronization before relying on records.</p>
        <p>We maintain operational backups appropriate to the Service, but backups are not a substitute for your own tax, accounting, business-continuity, and export procedures. We do not promise a particular recovery time or recovery point unless a signed service-level agreement says so.</p>
      </LegalSection>

      <LegalSection title="9. Intellectual property">
        <p>Dumala and its licensors own the Service, software, design, documentation, trademarks, and underlying technology. Except for the limited access granted by these Terms, no rights are transferred. You may use the Dumala name or brand assets only as allowed by us.</p>
        <p>You must have permission to upload logos, photographs, menu descriptions, fonts, and other content. We may restrict or remove content when reasonably necessary to address an infringement, safety, legal, or platform-risk concern.</p>
      </LegalSection>

      <LegalSection title="10. Support and complaints">
        <p>Support, billing disputes, privacy requests, and other complaints should follow the <LegalLink href="/legal/complaints">Complaints and support process</LegalLink>. Restaurant-order complaints should first identify the restaurant and order number so the merchant can investigate. Nothing in these Terms removes a non-waivable right under Philippine consumer, privacy, tax, or other law.</p>
      </LegalSection>

      <LegalSection title="11. Suspension and termination">
        <p>We may suspend or limit access when reasonably necessary to protect people, data, the Service, payment systems, or other customers; to address non-payment, abuse, unlawful content, or a material breach; or to comply with law. We will use reasonable efforts to provide notice and an opportunity to cure when appropriate.</p>
        <p>You may stop using the Service or request account closure through support. Termination does not erase information that must be retained for legal, tax, security, accounting, or dispute purposes. The billing terms determine whether a paid period is refundable.</p>
      </LegalSection>

      <LegalSection title="12. Disclaimers and liability">
        <p>The Service is provided for general business operations and is not a substitute for a BIR-accredited invoicing system, accountant, lawyer, food-safety adviser, employment adviser, or other regulated professional. You remain responsible for reviewing records, prices, taxes, orders, staff actions, and legal obligations before relying on them.</p>
        <p>To the extent permitted by law, Dumala will not be responsible for indirect, incidental, special, consequential, or lost-profit damages arising from use of the Service. Any liability cap, exclusions, and exceptions must be completed after legal review and will not apply to liability that cannot lawfully be limited.</p>
      </LegalSection>

      <LegalSection title="13. Governing law and changes">
        <p>These Terms are governed by the laws of the Philippines, subject to mandatory consumer and other rights. The parties should first use the internal redress process and may use an appropriate court, government agency, or alternative dispute-resolution process when permitted.</p>
        <p>We may update these Terms by publishing a new version. Material changes to paid subscriptions will be communicated through an appropriate channel. Questions may be sent to <strong className="text-ink">{legalContact.supportEmail}</strong>.</p>
      </LegalSection>
    </LegalDocument>
  );
}
