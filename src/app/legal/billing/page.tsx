import type { Metadata } from "next";
import { LegalDocument, LegalLink, LegalSection } from "@/components/legal/LegalDocument";
import { legalContact } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Billing and refunds",
  description: "Dumala POS subscription billing, cancellation, refund, and payment-provider terms.",
  alternates: { canonical: "/legal/billing" },
};

export default function BillingPolicyPage() {
  return (
    <LegalDocument
      eyebrow="Subscriptions"
      title="Billing, cancellation, and refunds"
      description="This draft policy explains the current Dumala POS subscription model. Confirm the final refund, tax-invoice, renewal, and support rules with Philippine legal and tax advisers before accepting paid subscriptions."
    >
      <LegalSection title="1. Trial and paid plans">
        <p>Dumala currently offers a fourteen-day trial with no card required to start. During the trial, the account can use the features made available for the trial. A paid subscription begins only after the owner chooses an available plan and completes checkout.</p>
        <p>The pricing page and checkout show the applicable price, currency, billing interval, branch capacity, promotion, and amount due. If those details differ, do not complete payment until the discrepancy is resolved.</p>
      </LegalSection>

      <LegalSection title="2. Renewal authorization">
        <p>Monthly plans may renew automatically through the payment provider. Annual or other term plans may be prepaid or may follow the renewal setting shown at checkout. By completing a recurring checkout, the account owner authorizes the payment provider to charge the selected payment method for the stated recurring amount and interval, subject to applicable law and any permitted price-change notice.</p>
        <p>Owners are responsible for reviewing the billing page, keeping payment details current, and cancelling before the next renewal when they do not want another charge.</p>
      </LegalSection>

      <LegalSection title="3. Cancellation">
        <p>You may request cancellation through the billing area or by contacting <strong className="text-ink">{legalContact.supportEmail}</strong>. Unless a mandatory legal right or a written offer says otherwise, cancellation stops the next renewal and access continues through the already paid period. Cancellation does not automatically erase the account, orders, invoices, audit records, or other information that must be retained.</p>
        <p>If the account is in a free trial, cancel before the trial ends to avoid starting a paid plan. If a payment has already been authorized, contact support promptly with the account email, payment date, amount, and provider reference. Never send the full card number or security code.</p>
      </LegalSection>

      <LegalSection title="4. Refunds and chargebacks">
        <p>Except where required by law, for duplicate or unauthorized charges, or where Dumala approves an exception, paid subscription fees are not automatically prorated or refundable after a billing period begins. This rule is subject to the final policy approved for the business and does not waive non-waivable consumer rights.</p>
        <p>For a suspected unauthorized charge, contact Dumala and the payment provider promptly. A chargeback should be used for a genuine unresolved payment dispute; fraudulent or abusive chargebacks may cause an account review or suspension.</p>
      </LegalSection>

      <LegalSection title="5. Taxes and invoices">
        <p>Prices, VAT, taxes, and any other charges must be displayed accurately at checkout. Dumala will provide the applicable invoice or billing record for its own subscription once the final BIR invoicing position and registration requirements are confirmed. The current POS order slip is not a BIR-accredited official tax invoice.</p>
        <p>Business customers are responsible for providing accurate billing information and for their own tax, accounting, withholding, and record-retention obligations.</p>
      </LegalSection>

      <LegalSection title="6. Payment provider and card data">
        <p>PayMongo or another identified provider processes payment-card details, authentication, recurring payment, and payment-status events. Dumala receives payment tokens, identifiers, status, and limited billing information needed to activate and support the subscription. Dumala is designed not to store the full card number or security code.</p>
        <p>Payment-provider terms, security controls, supported methods, authentication steps, settlement, refund, and chargeback rules may also apply. Contact Dumala for a Dumala billing problem and the provider for a provider-side payment problem.</p>
      </LegalSection>

      <LegalSection title="7. Failed payments and suspension">
        <p>If a payment fails, is reversed, expires, or becomes past due, Dumala may notify the account owner, retry or request an updated payment method through the provider, limit paid features, or suspend the workspace after reasonable notice. The account owner remains responsible for valid charges incurred before cancellation or suspension.</p>
      </LegalSection>

      <LegalSection title="8. Price or plan changes">
        <p>We may change plans, prices, features, or payment methods. Changes to a future renewal will be communicated through an appropriate channel when required. A price change does not change the amount already paid for a current term unless the owner accepts an upgrade, branch-capacity change, or other new purchase.</p>
      </LegalSection>

      <LegalSection title="9. Help with billing">
        <p>For a billing question, include the account email, organization name, relevant plan, transaction date, and provider reference. Use the <LegalLink href="/legal/complaints">Complaints and support process</LegalLink> if a billing issue is not resolved.</p>
      </LegalSection>
    </LegalDocument>
  );
}
