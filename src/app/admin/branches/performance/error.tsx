"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

export default function BranchPerformanceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { area: "branch-performance-report", digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-danger">Report error</p>
        <h1 className="mt-2 text-2xl font-extrabold">We could not load branch performance.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Try again, or narrow the date range while the connection recovers.</p>
        <button type="button" onClick={() => reset()} className="mt-6 rounded-btn bg-accent px-4 py-3 text-sm font-extrabold uppercase text-accent-fg transition hover:bg-accent-hover">Try again</button>
      </div>
    </main>
  );
}
