import type { Metadata } from "next";
import { LegalDocument, LegalList, LegalLink, LegalSection, LegalSubsection } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Online ordering terms",
  description: "Terms for ordering food through Dumala-powered public menus.",
  alternates: { canonical: "/legal/online-ordering" },
};

export default function OnlineOrderingTermsPage() {
  return (
    <LegalDocument
      eyebrow="Customer orders"
      title="Online ordering terms"
      description="These draft terms explain how pickup and delivery requests work on Dumala-powered restaurant menus. The restaurant shown on the menu remains responsible for the food transaction unless the checkout expressly says otherwise."
    >
      <LegalSection title="1. Who is selling to you">
        <p>Dumala provides ordering software and may host the public menu. The restaurant, café, or food business named on the menu is normally the seller of the food and the party responsible for preparation, availability, fulfillment, food information, refunds, complaints, permits, and the applicable sales invoice. If a checkout identifies another seller or merchant of record, that identification controls for the relevant transaction.</p>
        <p>Before placing an order, review the store name, branch address, contact information, menu, prices, VAT display, delivery area, estimated timing, payment method, and store-specific cancellation policy. The restaurant must complete those details accurately.</p>
      </LegalSection>

      <LegalSection title="2. Placing an order">
        <LegalList>
          <li>Add available items, choose pickup or delivery, and provide accurate name and mobile details.</li>
          <li>For delivery, provide a complete address and any useful rider note within the permitted field limits.</li>
          <li>Review items, quantities, timing, fees, VAT display, and total before submitting.</li>
          <li>Submitting the request does not guarantee acceptance. The store may confirm, adjust, or cancel an order when an item is unavailable, the store is closed, the address is outside the service area, the request is fraudulent, or another lawful operational reason applies.</li>
          <li>Keep the order number and the mobile number used at checkout. They may be needed to track or resolve the order.</li>
        </LegalList>
        <p>Preparation and delivery times are estimates. They can change with demand, weather, traffic, staffing, supply, or events outside the store’s reasonable control.</p>
      </LegalSection>

      <LegalSection title="3. Prices, VAT, and payment">
        <p>The total shown at checkout should identify the item subtotal, applicable delivery fee, VAT inclusion where configured by the store, and total amount due. The restaurant is responsible for setting lawful prices and correct tax treatment. A delivery fee may apply even when an item is refunded or unavailable if the store’s disclosed policy and applicable law permit it.</p>
        <p>The current flow collects payment at the store counter for pickup or when the order arrives for delivery. Do not send card details through an order note. If online payment is added, the checkout must identify the payment provider, authorization, refund, and chargeback terms before payment.</p>
      </LegalSection>

      <LegalSection title="4. Cancellations, changes, and refunds">
        <p>Contact the restaurant as soon as possible using the contact details displayed for the menu. A request may be cancellable before the restaurant accepts or starts preparing it. Once preparation or delivery has begun, cancellation may be limited because food is perishable and because a rider or store may already have incurred costs.</p>
        <p>The store’s specific cancellation policy is shown during checkout and supplements these terms. It must be applied consistently and does not remove mandatory consumer remedies for defective, unsafe, missing, or materially nonconforming goods. For a missing, incorrect, damaged, unsafe, or materially delayed order, report the issue promptly with the order number and a concise description.</p>
      </LegalSection>

      <LegalSection title="5. Pickup and delivery">
        <LegalSubsection title="Pickup">
          <p>Arrive at the selected branch during the stated window and show the order number. The store may require payment and reasonable confirmation before handover. If an order is not collected, any applicable no-show or disposal policy must be disclosed by the store and must comply with law.</p>
        </LegalSubsection>
        <LegalSubsection title="Delivery">
          <p>Be available at the address and phone number provided. The store or its rider may contact you to confirm the location. An incomplete address, inaccessible location, lack of recipient, unsafe conditions, or an out-of-area address may delay or prevent delivery. Any additional delivery charge or refund treatment must be disclosed and lawful.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection title="6. Food information and safety">
        <p>The restaurant is responsible for accurate descriptions, ingredients, allergen information, preparation, packaging, and food-safety controls. If you have an allergy, dietary restriction, or health concern, contact the restaurant before ordering and do not rely solely on a menu note. Dumala does not inspect or certify the food, restaurant, supplier, or delivery rider.</p>
      </LegalSection>

      <LegalSection title="7. Customer information and messages">
        <p>The name, mobile number, address, order details, and notes you provide are used to confirm, prepare, deliver, track, secure, and support the order. They may be shared with the restaurant and fulfillment personnel who need them for that purpose. Transactional messages may be sent to the mobile number provided. Marketing messages require a separate lawful basis and an appropriate opt-out.</p>
        <p>See the <LegalLink href="/legal/privacy">Privacy notice</LegalLink> and <LegalLink href="/legal/cookies">Cookies and offline storage</LegalLink> documents. Do not include passwords, full payment-card details, government ID numbers, or unrelated sensitive information in an order note.</p>
      </LegalSection>

      <LegalSection title="8. Invoices and support">
        <p>The restaurant should issue the applicable paper or electronic sales invoice when the sale is completed. Dumala’s order confirmation or order slip is not, by itself, a BIR-accredited tax invoice. For a food-order concern, contact the restaurant first; for a platform, privacy, or technical concern, use the <LegalLink href="/legal/complaints">Complaints and support process</LegalLink>.</p>
      </LegalSection>

      <LegalSection title="9. Customer conduct">
        <p>Place only genuine orders and provide accurate contact and delivery information. Fraudulent, prank, duplicate, abusive, or intentionally misleading orders may be rejected, cancelled, or reported where appropriate. Nothing in these terms limits a non-waivable right under Philippine consumer or other law.</p>
      </LegalSection>
    </LegalDocument>
  );
}
