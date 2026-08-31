import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import LandingFooter from "@/components/landing/LandingFooter";
import {
  isEmail,
  isLegalConfigurationComplete,
  isPhone,
  legalContact,
  LEGAL_DOCUMENT_VERSION,
} from "@/lib/legal-config";

type LegalDocumentProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function LegalDocument({ eyebrow, title, description, children }: LegalDocumentProps) {
  const configured = isLegalConfigurationComplete();

  return (
    <main className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line bg-surface px-6 py-4 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-5">
          <Link href="/" aria-label="Dumala POS home" className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <Image src="/brand-lockup.png" alt="Dumala POS" width={1535} height={451} priority sizes="180px" className="h-10 w-auto sm:h-12" />
          </Link>
          <nav aria-label="Legal" className="flex items-center gap-3 text-xs font-bold text-ink-muted sm:gap-5 sm:text-sm">
            <Link href="/legal" className="rounded-lg px-2 py-2 transition hover:bg-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Legal center</Link>
            <Link href="/signup" className="rounded-btn bg-primary px-3 py-2 text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Start free</Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-primary/20 bg-primary px-6 py-12 text-primary-fg sm:px-10 sm:py-16 lg:px-16">
        <div className="mx-auto max-w-[850px]">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] sm:text-5xl sm:leading-[1.04]">{title}</h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-primary-fg/75 sm:text-base">{description}</p>
          <p className="mt-5 text-xs font-semibold text-primary-fg/60">Document version: {LEGAL_DOCUMENT_VERSION} · Effective date: {legalContact.effectiveDate}</p>
        </div>
      </section>

      <section className="px-6 py-10 sm:px-10 sm:py-14 lg:px-16">
        <div className="mx-auto max-w-[850px]">
          <div className="rounded-card border border-accent/35 bg-accent/10 px-4 py-4 text-sm leading-6 text-ink" role="note">
            <strong className="font-extrabold">{configured ? "Review notice." : "Draft for legal review."}</strong>{" "}
            {configured
              ? "These documents are still a baseline implementation and should be reviewed by Philippine counsel before relying on them."
              : "Replace every bracketed configuration value, choose the final commercial policies, and obtain Philippine legal and tax review before public launch."}
          </div>

          <section className="mt-6 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="published-details-heading">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Published business details</p>
            <h2 id="published-details-heading" className="mt-2 text-lg font-black tracking-[-0.025em] text-primary">{legalContact.tradeName}</h2>
            <dl className="mt-4 grid gap-3 text-sm text-ink-muted sm:grid-cols-2">
              <div><dt className="font-extrabold text-ink">Legal entity</dt><dd className="mt-1 break-words">{legalContact.legalEntityName}</dd></div>
              <div><dt className="font-extrabold text-ink">Business address</dt><dd className="mt-1 break-words">{legalContact.businessAddress}</dd></div>
              <div><dt className="font-extrabold text-ink">Support</dt><dd className="mt-1 break-words"><ContactLink value={legalContact.supportEmail} type="email" /> · <ContactLink value={legalContact.supportPhone} type="phone" /></dd></div>
              <div><dt className="font-extrabold text-ink">Privacy/DPO contact</dt><dd className="mt-1 break-words">{legalContact.dpoContact} · <ContactLink value={legalContact.privacyEmail} type="email" /></dd></div>
            </dl>
          </section>

          <article className="mt-10 space-y-10">{children}</article>

          <section className="mt-12 rounded-card border border-line bg-surface p-5 text-sm leading-6 text-ink-muted sm:p-6" aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="text-lg font-black text-primary">Questions or requests?</h2>
            <p className="mt-2">Use the <Link href="/legal/complaints" className="font-bold text-primary underline underline-offset-4">complaints and support process</Link> for service issues, billing concerns, or data-privacy requests.</p>
          </section>
        </div>
      </section>

      <LandingFooter hasAnnualOptions={false} />
    </main>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-xl font-black tracking-[-0.03em] text-primary sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-4 text-sm leading-7 text-ink-muted sm:text-[15px]">{children}</div>
    </section>
  );
}

export function LegalSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-extrabold text-ink">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="grid list-disc gap-2 pl-5 marker:text-accent">{children}</ul>;
}

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="font-bold text-primary underline underline-offset-4 hover:text-accent-hover">{children}</Link>;
}

function ContactLink({ value, type }: { value: string; type: "email" | "phone" }) {
  const valid = type === "email" ? isEmail(value) : isPhone(value);
  if (!valid) return <span>{value}</span>;
  return <a href={type === "email" ? `mailto:${value}` : `tel:${value}`} className="font-semibold text-primary underline underline-offset-4">{value}</a>;
}
