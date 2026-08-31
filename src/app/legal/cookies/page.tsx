import type { Metadata } from "next";
import { LegalDocument, LegalList, LegalLink, LegalSection, LegalSubsection } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Cookies and offline storage",
  description: "How Dumala POS uses necessary cookies, browser storage, service workers, and payment-provider sessions.",
  alternates: { canonical: "/legal/cookies" },
};

export default function CookiesAndOfflineStoragePage() {
  return (
    <LegalDocument
      eyebrow="Browser storage"
      title="Cookies and offline storage"
      description="This draft explains the essential cookies and local browser storage used by Dumala POS. It is especially important for shared tablets, terminals, and offline POS devices."
    >
      <LegalSection title="1. What we use">
        <p>Dumala uses small files and browser storage to keep the service secure, remember necessary session or branch context, provide the app-like POS experience, and support offline operation. We do not currently use non-essential advertising or analytics cookies in the reviewed application. If that changes, this document must be updated and any required consent or opt-out must be added.</p>
      </LegalSection>

      <LegalSection title="2. Necessary cookies">
        <LegalList>
          <li><strong className="text-ink">Authentication and session cookies:</strong> keep an owner or staff session active and help protect authenticated routes.</li>
          <li><strong className="text-ink">Branch and application context:</strong> remember the branch or workspace context needed to render the correct POS experience.</li>
          <li><strong className="text-ink">Security and request controls:</strong> support secure navigation, form submissions, and abuse prevention.</li>
        </LegalList>
        <p>Blocking necessary cookies can prevent login, checkout, order tracking, or POS functions from working.</p>
      </LegalSection>

      <LegalSection title="3. Local storage and IndexedDB">
        <LegalSubsection title="Offline POS data">
          <p>The POS may keep catalog data, workspace settings, device information, queued orders or sales, and audit data in IndexedDB or local storage so that work can continue during a connectivity interruption. Unsynchronized records may remain on the device until they are successfully synchronized or intentionally cleared.</p>
        </LegalSubsection>
        <LegalSubsection title="Cached business information">
          <p>Depending on the enabled workspace features, a browser may cache branch, product, inventory, receipt, shift, report, or other operational information. Some data can be sensitive personal or business information. The organization must use device locks, unique accounts, sign-out, permissions, and device-revocation procedures.</p>
        </LegalSubsection>
        <LegalSubsection title="How to clear it">
          <p>Sign out where the application provides that control, then clear the site’s cookies and storage through the browser settings when a device is transferred, lost, shared, or retired. Clearing storage before synchronization can remove unsent records; follow the organization’s recovery procedure first.</p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection title="4. Service worker and public assets">
        <p>Dumala may use a service worker to cache public application assets and support installation or offline behavior. The reviewed design avoids caching private authenticated HTML, but users should still treat a POS device as a sensitive endpoint and keep its operating system, browser, lock, and user access secure.</p>
      </LegalSection>

      <LegalSection title="5. Payment-provider sessions">
        <p>When a subscription payment is started, the payment provider may set or use its own browser or security mechanisms. Those mechanisms are controlled by the provider’s terms and privacy notice. Dumala is designed not to store the full card number or security code.</p>
      </LegalSection>

      <LegalSection title="6. Managing preferences and questions">
        <p>You can manage or clear cookies through your browser. Essential storage cannot be turned off without affecting the Service. For questions about personal data, contact the address in the <LegalLink href="/legal/privacy">Privacy notice</LegalLink>. For operational or device issues, use <LegalLink href="/legal/complaints">Complaints and support</LegalLink>.</p>
      </LegalSection>
    </LegalDocument>
  );
}
