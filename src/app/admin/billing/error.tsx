"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { reportError } from "@/lib/monitoring";

export default function BillingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { area: "billing-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center bg-bg p-6 text-center text-ink">
      <section className="w-full max-w-lg rounded-[22px] border border-warning/35 bg-surface p-7 shadow-[var(--shadow-pop)] sm:p-9" role="alert" aria-labelledby="billing-error-heading">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-warning/15 text-accent"><AdminIcon name="wallet" size={25} /></span>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Billing &amp; Plan</p>
        <h1 id="billing-error-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">We couldn&apos;t load your plan.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Your account is safe. Billing details are temporarily unavailable, so try again or return to your account while the connection recovers.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => retry()} className="rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Try again</button>
          <Link href="/account" className="rounded-btn border border-line-strong bg-surface-raised px-4 py-3 text-sm font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Back to account</Link>
        </div>
      </section>
    </main>
  );
}
