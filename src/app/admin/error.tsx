"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { area: "admin-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-danger">Dashboard error</p>
        <h1 className="mt-2 text-2xl font-extrabold">We could not load the backoffice.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Try again, or return to the POS while the connection recovers.</p>
        <button type="button" onClick={() => retry()} className="mt-6 rounded-btn bg-accent px-4 py-3 text-sm font-extrabold uppercase text-accent-fg transition hover:bg-accent-hover">Try again</button>
      </div>
    </main>
  );
}
