import Image from "next/image";
import Link from "next/link";
import SectionLink from "./SectionLink";
import { isEmail, isPhone, legalContact, legalDocumentLinks } from "@/lib/legal-config";

/**
 * Shared by the landing page and every standalone content page, so a new page
 * inherits the site's internal linking instead of growing its own.
 *
 * Section links go through SectionLink, which needs to know whether it is
 * rendering on the landing page — a bare fragment does nothing on /pricing, and
 * a routed one does not scroll on the landing page. The footer is a Server
 * Component so it cannot read the pathname itself; the page passes it.
 */
export default function LandingFooter({
  hasAnnualOptions,
  onLandingPage = false,
}: {
  hasAnnualOptions: boolean;
  onLandingPage?: boolean;
}) {
  return (
    <footer className="lp-sec--footer border-t border-[#ddd5c4] bg-[#f1ebde] px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col gap-9 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" aria-label="Dumala POS home" className="lp-logo inline-block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#173a2b]">
              <Image src="/brand-lockup.png" alt="Dumala POS" width={1535} height={451} sizes="160px" className="h-11 w-auto" />
            </Link>
            <p className="mt-4 text-xs leading-5 text-[#708076]">
              A practical POS and owner workspace for Philippine cafes, restaurants, coffee shops, bakeshops, and other food
              businesses. Free for 14 days, then
              {hasAnnualOptions ? "choose monthly or annual billing" : "continue with monthly billing"} for the same complete product.
            </p>
          </div>

          <div className="grid gap-8 text-xs sm:grid-cols-4 sm:gap-10">
            <div>
              <p className="font-black uppercase tracking-[0.16em] text-[#173a2b]">Product</p>
              <ul className="mt-3 grid gap-2 text-[#708076]">
                <li><SectionLink section="features" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">Features</SectionLink></li>
                <li><SectionLink section="online-menu" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">Online Menu</SectionLink></li>
                <li><SectionLink section="playground" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">Try the POS</SectionLink></li>
                <li><SectionLink section="interfaces" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">Counter POS &amp; dashboard</SectionLink></li>
                <li><SectionLink section="offline" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">Offline first</SectionLink></li>
                <li><SectionLink section="details" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">In detail</SectionLink></li>
                <li><SectionLink section="workspace" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">Workspace</SectionLink></li>
              </ul>
            </div>
            <div>
              <p className="font-black uppercase tracking-[0.16em] text-[#173a2b]">Learn</p>
              <ul className="mt-3 grid gap-2 text-[#708076]">
                <li><SectionLink section="pricing" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">Pricing</SectionLink></li>
                <li><SectionLink section="how-it-works" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">How it works</SectionLink></li>
                <li><SectionLink section="for-teams" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">For teams</SectionLink></li>
                <li><SectionLink section="faq" onLandingPage={onLandingPage} className="lp-navlink hover:text-[#b18448]">FAQ</SectionLink></li>
              </ul>
            </div>
            <div>
              <p className="font-black uppercase tracking-[0.16em] text-[#173a2b]">Access</p>
              <ul className="mt-3 grid gap-2 text-[#708076]">
                <li><Link href="/signup" className="lp-navlink hover:text-[#b18448]">Start free trial</Link></li>
                <li><Link href="/login" className="lp-navlink hover:text-[#b18448]">Owner log in</Link></li>
                {/* The platform operator console is deliberately not linked
                    from here. A followed link off the strongest public page
                    into the internal admin surface hands crawlers a route
                    they have no reason to hold; operators bookmark
                    /platform/login instead. */}
              </ul>
            </div>
            <div>
              <p className="font-black uppercase tracking-[0.16em] text-[#173a2b]">Legal</p>
              <ul className="mt-3 grid gap-2 text-[#708076]">
                <li><Link href="/legal" className="lp-navlink hover:text-[#b18448]">Legal center</Link></li>
                {legalDocumentLinks.map((document) => (
                  <li key={document.href}><Link href={document.href} className="lp-navlink hover:text-[#b18448]">{document.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-[#ddd5c4] pt-6 text-xs leading-5 text-[#708076]">
          <p className="font-bold text-[#173a2b]">{legalContact.tradeName} · {legalContact.legalEntityName}</p>
          <p className="mt-1">{legalContact.businessAddress}</p>
          <p className="mt-1">
            Support: <ContactValue value={legalContact.supportEmail} type="email" /> · <ContactValue value={legalContact.supportPhone} type="phone" /> · Privacy: <ContactValue value={legalContact.privacyEmail} type="email" />
          </p>
        </div>
      </div>
    </footer>
  );
}

function ContactValue({ value, type }: { value: string; type: "email" | "phone" }) {
  const valid = type === "email" ? isEmail(value) : isPhone(value);
  if (!valid) return <span>{value}</span>;
  return <a href={type === "email" ? `mailto:${value}` : `tel:${value}`} className="underline underline-offset-4 hover:text-[#b18448]">{value}</a>;
}
