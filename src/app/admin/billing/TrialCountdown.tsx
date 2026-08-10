"use client";

import { useEffect, useState } from "react";
import { formatBillingDate } from "@/lib/billing";
import { formatTrialRemaining } from "@/lib/trial";

export default function TrialCountdown({
  endsAt,
  initialRemainingMs,
  inverse = false,
}: {
  endsAt: string;
  initialRemainingMs: number;
  inverse?: boolean;
}) {
  const [remainingMs, setRemainingMs] = useState(Math.max(0, initialRemainingMs));

  useEffect(() => {
    const tick = () => setRemainingMs(Math.max(0, Date.parse(endsAt) - Date.now()));
    tick();
    const intervalId = window.setInterval(tick, 1_000);
    return () => window.clearInterval(intervalId);
  }, [endsAt]);

  return (
    <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-btn border px-4 py-3 ${inverse ? "border-primary-fg/15 bg-primary-fg/10" : "border-primary/15 bg-primary/5"}`} aria-live="polite">
      <div>
        <p className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${inverse ? "text-primary-fg/65" : "text-primary"}`}>Live trial countdown</p>
        <p className={`mt-1 text-xs ${inverse ? "text-primary-fg/75" : "text-ink-muted"}`}>Ends {formatBillingDate(endsAt)}</p>
      </div>
      <strong className={`tnums text-lg font-extrabold ${inverse ? "text-primary-fg" : "text-primary"}`}>{formatTrialRemaining(remainingMs)}</strong>
    </div>
  );
}
