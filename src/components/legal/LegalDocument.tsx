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
  density?: "default" | "compact";
  backToLegalCenter?: boolean;
  children: ReactNode;
};

export function LegalDocument({ eyebrow, title, description, density = "default", backToLegalCenter = false, children }: LegalDocumentProps) {
  if (process.env.NODE_ENV === "production" && !isLegalConfigurationComplete()) {
    throw new Error("Legal configuration is incomplete. Set the required NEXT_PUBLIC_LEGAL_* values before building for production.");
  }

  const compact = density === "compact";

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

      <section className={compact ? "relative overflow-hidden border-b border-primary/20 bg-primary px-6 py-9 text-primary-fg sm:px-10 sm:py-11 lg:px-16" : "relative overflow-hidden border-b border-primary/20 bg-primary px-6 py-12 text-primary-fg sm:px-10 sm:py-16 lg:px-16"}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block">
          <div className="absolute h-96 w-96 rounded-full border-[26px] border-accent/10" style={{ left: "70%", top: "-8rem" }} />
          <div className="absolute h-44 w-44 rounded-full border border-accent/20" style={{ left: "84%", top: "2.5rem" }} />
          <div className="absolute inset-y-0 w-1/3 opacity-30 [background-image:linear-gradient(135deg,transparent_0%,rgba(255,250,241,0.18)_50%,transparent_51%)] [background-size:22px_22px]" style={{ left: "72%" }} />
        </div>
        <div className="relative mx-auto max-w-[850px]">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
          <h1 className={compact ? "mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl sm:leading-[1.06]" : "mt-3 text-3xl font-black tracking-[-0.045em] sm:text-5xl sm:leading-[1.04]"}>{title}</h1>
          <p className={compact ? "mt-4 max-w-3xl text-sm leading-6 text-primary-fg/75 sm:text-[15px]" : "mt-5 max-w-3xl text-sm leading-7 text-primary-fg/75 sm:text-base"}>{description}</p>
          <div className={compact ? "mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold" : "mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold"}>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-accent">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
              Public policy library
            </span>
            <span className="text-primary-fg/60">Version {LEGAL_DOCUMENT_VERSION} · Effective {legalContact.effectiveDate}</span>
          </div>
        </div>
      </section>

      <section className={compact ? "px-6 py-7 sm:px-10 sm:py-9 lg:px-16" : "px-6 py-10 sm:px-10 sm:py-14 lg:px-16"}>
        <div className="mx-auto max-w-[850px]">
          <section className={compact ? "relative mt-4 overflow-hidden rounded-[20px] border border-primary/20 border-t-2 border-t-accent bg-raised p-5 shadow-[var(--shadow-pop)] sm:p-6" : "relative mt-6 overflow-hidden rounded-[20px] border border-primary/20 border-t-2 border-t-accent bg-raised p-6 shadow-[var(--shadow-pop)] sm:p-7"} aria-labelledby="business-details-heading">
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 hidden w-2/5 opacity-90 sm:block [background-image:radial-gradient(circle,rgba(188,150,87,0.34)_1px,transparent_1.5px)] [background-size:18px_18px]" style={{ left: "62%" }} />
            <div className="relative">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-xs font-black text-accent">✓</span>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Public business information</p>
                  </div>
                  <h2 id="business-details-heading" className={compact ? "mt-2 text-xl font-black tracking-[-0.035em] text-primary" : "mt-2 text-2xl font-black tracking-[-0.035em] text-primary"}>{legalContact.tradeName}</h2>
                  <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-ink-muted">The business identity and official contact points behind these legal policies.</p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-[11px] font-extrabold text-primary">Published details</span>
              </div>
              <dl className={compact ? "mt-5 grid gap-x-8 gap-y-3 border-t border-line/80 pt-5 text-[13px] leading-5 text-ink-muted sm:grid-cols-2" : "mt-6 grid gap-x-8 gap-y-4 border-t border-line/80 pt-6 text-sm text-ink-muted sm:grid-cols-2"}>
                <Detail label="Legal entity" value={legalContact.legalEntityName} />
                <Detail label="Registration" value={legalContact.businessRegistration} />
                <Detail label="Business address" value={legalContact.businessAddress} />
                <div className="min-w-0"><dt className="font-extrabold text-ink">Support</dt><dd className="mt-1 break-words"><ContactLink value={legalContact.supportEmail} type="email" /> · <ContactLink value={legalContact.supportPhone} type="phone" /></dd></div>
                <div className="min-w-0"><dt className="font-extrabold text-ink">Privacy contact</dt><dd className="mt-1 break-words">{legalContact.dpoContact} · <ContactLink value={legalContact.privacyEmail} type="email" /></dd></div>
              </dl>
            </div>
          </section>

          {backToLegalCenter ? (
            <Link href="/legal" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-btn border border-line bg-surface px-4 py-2 text-sm font-extrabold text-primary shadow-[var(--shadow-card)] transition hover:border-accent/60 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span aria-hidden="true" className="text-base leading-none">←</span>
              <span>Back to Legal Center</span>
            </Link>
          ) : null}

          <article className={compact ? "mt-7 space-y-7" : "mt-10 space-y-10"}>{children}</article>

          <section className={compact ? "mt-8 rounded-card border border-line bg-surface p-4 text-[13px] leading-5 text-ink-muted sm:p-5" : "mt-12 rounded-card border border-line bg-surface p-5 text-sm leading-6 text-ink-muted sm:p-6"} aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="text-lg font-black text-primary">Questions or requests?</h2>
            <p className="mt-2">Use the <Link href="/legal/complaints" className="font-bold text-primary underline underline-offset-4">complaints and support process</Link> for service issues, billing concerns, or data-privacy requests.</p>
          </section>
        </div>
      </section>

      <LandingFooter hasAnnualOptions={false} />
    </main>
  );
}

export function LegalSection({ id, title, compact = false, children }: { id?: string; title: string; compact?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className={compact ? "text-lg font-black tracking-[-0.03em] text-primary sm:text-xl" : "text-xl font-black tracking-[-0.03em] text-primary sm:text-2xl"}>{title}</h2>
      <div className={compact ? "mt-2.5 space-y-3 text-[13px] leading-5 text-ink-muted sm:text-sm" : "mt-3 space-y-4 text-sm leading-7 text-ink-muted sm:text-[15px]"}>{children}</div>
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

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="font-extrabold text-ink">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}
