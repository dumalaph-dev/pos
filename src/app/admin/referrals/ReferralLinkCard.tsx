"use client";

import { useState } from "react";

export function ReferralLinkCard({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-card border border-primary/20 bg-primary-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Your referral link</p>
          <h2 className="mt-2 text-xl font-extrabold text-ink">Share this with another business owner</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">The new owner receives the normal 14-day trial. When their first paid subscription is confirmed, your organization earns 7 complimentary Premium days.</p>
        </div>
        <span className="rounded-full bg-surface px-3 py-1.5 font-mono text-xs font-extrabold tracking-[0.16em] text-primary">{code}</span>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input aria-label="Referral link" readOnly value={link} className="min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-3 py-3 text-xs text-ink outline-none" />
        <button type="button" onClick={copyLink} className="rounded-btn bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">Share the complete link so the invitation is attached when the customer creates their workspace.</p>
    </div>
  );
}
