"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { area: "global-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-ink">
        <main className="grid min-h-screen place-items-center p-6 text-center">
          <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-danger">Dumala POS</p>
            <h1 className="mt-2 text-2xl font-extrabold">Something went wrong.</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">The error has been recorded. Try loading this screen again.</p>
            <button type="button" onClick={() => reset()} className="mt-6 rounded-btn bg-accent px-4 py-3 text-sm font-extrabold uppercase text-accent-fg transition hover:bg-accent-hover">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
