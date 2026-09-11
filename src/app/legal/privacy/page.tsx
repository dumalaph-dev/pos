import type { Metadata } from "next";
import { LegalDocument, LegalList, LegalLink, LegalSection, LegalSubsection } from "@/components/legal/LegalDocument";
import { legalContact } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How Dumala POS collects, uses, shares, protects, and retains personal data.",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyNoticePage() {
  return (
    <LegalDocument
      eyebrow="Privacy"
      title="Privacy notice"
      description="This notice explains how Dumala POS handles personal data under the Philippine Data Privacy Act."
      backToLegalCenter
    >
      <LegalSection title="1. Who this notice covers">
        <p>This notice applies to Dumala POS websites, account registration, POS and owner-workspace services, billing and support, public menus, online ordering, and related communications. It applies to visitors, business owners, staff users, restaurant customers, and other individuals whose information is submitted through the service.</p>
        <p>For an organization’s customer, employee, attendance, payroll, supplier, or expense information, the organization using Dumala is generally the personal information controller (PIC). Dumala generally acts as its personal information processor (PIP) and processes that information on the organization’s documented instructions. Dumala is the PIC for information it uses for its own account administration, billing, support, security, and business operations. The final data-role allocation must be documented in each merchant agreement.</p>
      </LegalSection>

      <LegalSection title="2. Information we process">
        <LegalSubsection title="Account and business information">
          <p>Name, email address, business and branch names, branch address, account role, authentication information, billing status, support communications, referrals, and business settings.</p>
        </LegalSubsection>
        <LegalSubsection title="POS and workforce information">
          <p>Products, sales, payments and payment references, shifts, audit activity, employee names and contact details, attendance, payroll, leave requests, customers, suppliers, expenses, and other information entered by a subscribing organization.</p>
        </LegalSubsection>
        <LegalSubsection title="Online-order information">
          <p>Customer name, mobile number, pickup or delivery details, delivery address and notes, order items, order status, verification records, and messages needed to confirm or fulfill an order. The restaurant receiving the order is responsible for its own customer-facing notice and lawful use of this information.</p>
        </LegalSubsection>
        <LegalSubsection title="Payment and technical information">
          <p>Billing plan, invoice and transaction references, payment status, PayMongo customer or payment identifiers, device and browser information, security events, request metadata, and limited logs needed to operate and protect the service. Dumala is designed not to store the full payment-card number or security code.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection title="3. Why we use information">
        <p>Depending on the activity, we process information to:</p>
        <LegalList>
          <li>create and secure accounts, authenticate users, manage roles, and provide the POS workspace;</li>
          <li>process subscriptions, payments, invoices, refunds, support requests, and account changes;</li>
          <li>publish a merchant’s menu, accept and verify online orders, send transactional messages, and coordinate fulfillment;</li>
          <li>maintain audit trails, prevent fraud and abuse, troubleshoot incidents, restore service, and improve reliability;</li>
          <li>comply with tax, accounting, legal, regulatory, and dispute-resolution obligations; and</li>
          <li>send service communications and, only where permitted, marketing communications with an appropriate opt-out.</li>
        </LegalList>
        <p>The applicable legal basis may include contract performance, legal obligation, consent, or a documented legitimate interest. We will not rely on consent where another lawful basis is more appropriate, and consent may be withdrawn where consent is the basis.</p>
      </LegalSection>

      <LegalSection title="4. Sharing and service providers">
        <p>We may share information with the subscribing organization and its authorized users; the restaurant and fulfillment personnel for an order; payment, hosting, database, messaging, email, security, backup, and support providers; professional advisers; regulators or law-enforcement bodies where legally required; and a successor in a permitted business transaction.</p>
        <p>Service providers may include Supabase for database, authentication, and storage; Vercel or equivalent hosting; PayMongo for payment processing; and messaging, email, security, backup, and support providers. We use appropriate contractual and security safeguards for these providers and do not sell personal data.</p>
      </LegalSection>

      <LegalSection title="5. International processing">
        <p>Some providers or support personnel may process information outside the Philippines. Where this occurs, Dumala uses appropriate contractual, organizational, and technical safeguards and provides any disclosures required by applicable law.</p>
      </LegalSection>

      <LegalSection title="6. Cookies, browser storage, and offline data">
        <p>We use necessary cookies for authentication, session continuity, security, and branch context. The POS may use local storage and IndexedDB to support offline operation, including cached catalog, workspace, settings, queued transactions, and audit data. These records can remain on a device until they are synchronized, signed out, expired, or cleared according to the final retention design.</p>
        <p>See <LegalLink href="/legal/cookies">Cookies and offline storage</LegalLink> for the current detail. Do not use a shared or public device for the POS without the organization’s approved lock, sign-out, and device-revocation controls.</p>
      </LegalSection>

      <LegalSection title="7. Security">
        <p>We use access controls, organization and branch scoping, row-level database policies, authentication safeguards, rate limiting, hashed verification codes, secure transport, security headers, audit trails, backups, and provider controls appropriate to the service. No method of transmission or storage is completely risk-free. Organizations remain responsible for strong passwords, unique accounts, MFA where available, device security, staff permissions, and promptly revoking access.</p>
        <p>Dumala uses organizational, physical, and technical safeguards appropriate to the service and maintains procedures for risk assessment, recovery, access review, retention, and incident response. Where a reportable breach occurs, Dumala and the relevant PIC will coordinate the notifications required by Philippine law.</p>
      </LegalSection>

      <LegalSection title="8. Retention and deletion">
        <p>We retain information only for as long as necessary for the stated purpose, contractual service, security, dispute handling, and applicable legal or tax obligations. The following schedule describes Dumala’s current retention approach. A longer period may apply where required by law, tax rules, a legal claim, a security investigation, or a documented merchant instruction.</p>
        <LegalList>
          <li>Account data: while the account is active and approximately 30 days after closure, subject to legal, tax, security, and dispute exceptions.</li>
          <li>Subscriptions, invoices, payment references, and tax records: for the applicable legal, tax, accounting, and dispute period confirmed by Dumala’s accountant or adviser.</li>
          <li>Restaurant customer, order, delivery, and order-note data: approximately 90 days after fulfillment or cancellation, unless a longer period is required for a claim, safety matter, fraud review, tax/accounting record, or merchant instruction. Employee and payroll data remains subject to the restaurant’s retention schedule when Dumala acts as processor.</li>
          <li>Phone-verification records: verification codes expire after 10 minutes and used or expired records should be purged within 24 hours.</li>
          <li>Security and application logs: 12 months, with longer retention for an active incident, investigation, or claim.</li>
          <li>Support communications: 2 years, unless a longer legal or dispute period applies.</li>
          <li>Offline browser caches and queued data: until synchronized, signed out, expired, or cleared according to the approved device policy. Backups follow the hosting provider’s documented lifecycle and may persist temporarily after source deletion.</li>
        </LegalList>
        <p>Deletion may be limited where information must be retained for a legal obligation, tax record, fraud prevention, security investigation, or dispute.</p>
      </LegalSection>

      <LegalSection title="9. Your rights and requests">
        <p>Subject to applicable law and reasonable verification, individuals may have rights to be informed, access, correct, object to or restrict certain processing, withdraw consent, request deletion or blocking, obtain portability where applicable, and seek damages or lodge a complaint. A merchant’s employee or customer should normally direct a request to the merchant that controls the data; Dumala will assist where it acts as processor.</p>
        <p>Send a privacy request to <strong className="text-ink">{legalContact.privacyEmail}</strong>. Include the request type, the organization or store involved, enough information to locate the record, and a safe way to respond. Do not send passwords, full card details, or unnecessary government identifiers.</p>
      </LegalSection>

      <LegalSection title="10. Children and sensitive information">
        <p>The service is intended for businesses and adult customers. Organizations must not collect children’s or sensitive personal information through Dumala unless they have a lawful purpose, appropriate notice, safeguards, and any required consent. Senior citizen/PWD discount references and government-issued identifiers must be minimized, access-restricted, and retained only as long as justified by tax or legal requirements.</p>
      </LegalSection>

      <LegalSection title="11. Changes and contact">
        <p>We may update this notice to reflect changes in the service, providers, law, or processing. We will publish the new version and update the document version above. Questions about this notice may be sent to <strong className="text-ink">{legalContact.privacyEmail}</strong> or through <LegalLink href="/legal/complaints">Complaints and support</LegalLink>.</p>
      </LegalSection>
    </LegalDocument>
  );
}
