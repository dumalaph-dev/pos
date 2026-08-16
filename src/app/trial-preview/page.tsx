import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { formatBillingDate } from "@/lib/billing";
import { formatTrialRemaining, readTrialLifecycle, TRIAL_DAY_MS, type TrialLifecycle, type TrialReminderKind } from "@/lib/trial";
import TrialCountdown from "@/app/admin/billing/TrialCountdown";
import TrialFeedbackForm from "@/app/admin/billing/TrialFeedbackForm";

// An internal demo of the trial-expiry reminders, pinned to a fixed date. It
// has no business being in a search index.
export const metadata: Metadata = {
  title: "Trial reminder preview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const reminderCopy: Record<TrialReminderKind, { eyebrow: string; title: string; detail: string }> = {
  five_days: {
    eyebrow: "Early reminder",
    title: "Your trial ends in 5 days.",
    detail: "A gentle nudge to choose Premium while your workspace is still fresh.",
  },
  three_days: {
    eyebrow: "Decision reminder",
    title: "Your trial ends in 3 days.",
    detail: "Keep every branch, staff member, and Premium feature active by subscribing.",
  },
  last_day: {
    eyebrow: "Last-day reminder",
    title: "Your trial ends in less than a day.",
    detail: "Subscribe now, or tell us what would make Premium a better fit for your business.",
  },
};

// Keep the demo deterministic across server renders; TrialCountdown uses the real client clock.
const PREVIEW_NOW = Date.parse("2026-08-10T00:00:00.000Z");

export default async function TrialPreviewPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const isLocalRequest = host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host.startsWith("[::1]:");
  if (!isLocalRequest) notFound();

  const now = PREVIEW_NOW;
  const reminderSamples = [
    { kind: "five_days" as const, label: "5 days remaining", trial: createSampleTrial(now, 5 * TRIAL_DAY_MS - 60 * 60 * 1000) },
    { kind: "three_days" as const, label: "3 days remaining", trial: createSampleTrial(now, 3 * TRIAL_DAY_MS - 60 * 60 * 1000) },
    { kind: "last_day" as const, label: "Less than a day remaining", trial: createSampleTrial(now, 10 * 60 * 60 * 1000) },
  ];
  const billingTrial = reminderSamples[0].trial;

  return (
    <main className="min-h-screen bg-bg px-4 pb-16 pt-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-card border border-primary/15 bg-primary p-6 text-primary-fg shadow-[var(--shadow-pop)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary-fg/70">Dumala POS · local preview</p>
            <span className="rounded-pill bg-primary-fg/12 px-3 py-1.5 text-xs font-extrabold text-primary-fg">No real billing changes</span>
          </div>
          <h1 className="mt-6 max-w-3xl text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">Trial reminders that turn interest into retention.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-fg/78 sm:text-base">This local-only page previews the Billing &amp; Plan experience, each reminder threshold, and the final-day feedback flow with a tailored-discount interest option.</p>
        </header>

        <section className="mt-8" aria-labelledby="billing-preview-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Billing &amp; Plan sample</p>
              <h2 id="billing-preview-heading" className="mt-2 text-2xl font-extrabold">Current plan with a live remaining-time countdown.</h2>
            </div>
            <span className="rounded-pill bg-secondary px-3 py-1.5 text-xs font-extrabold text-primary">Trial active</span>
          </div>

          <article className="mt-4 overflow-hidden rounded-card border border-accent/30 bg-secondary text-ink shadow-[var(--shadow-card)]">
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(270px,0.9fr)]">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-xl text-primary-fg">✦</span>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Premium trial</p>
                    <h3 className="mt-1 text-2xl font-extrabold">14-day trial</h3>
                  </div>
                </div>
                <p className="mt-5 max-w-xl text-sm leading-6 text-ink-muted">The customer sees the trial end date here and can choose a monthly Premium plan before access expires.</p>
                <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-ink-muted">
                  <span className="rounded-btn bg-surface px-3 py-2">Trial ends {formatBillingDate(billingTrial.endsAt)}</span>
                  <span className="rounded-btn bg-surface px-3 py-2">PHP 999 / month sample</span>
                </div>
              </div>

              <div className="rounded-card border border-primary/10 bg-primary/5 p-5">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Time remaining</p>
                <p className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-primary">{formatTrialRemaining(billingTrial.remainingMs)}</p>
                {billingTrial.endsAt && billingTrial.remainingMs !== null && <TrialCountdown endsAt={billingTrial.endsAt} initialRemainingMs={billingTrial.remainingMs} />}
                <p className="mt-3 text-xs leading-5 text-ink-muted">The countdown refreshes every second in the real Billing &amp; Plan page.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-10" aria-labelledby="reminder-preview-heading">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Reminder sequence</p>
            <h2 id="reminder-preview-heading" className="mt-2 text-2xl font-extrabold">The customer-facing reminders at a glance.</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">Each card is evaluated from the trial end timestamp, so the message continues to work even if the user logs in late.</p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {reminderSamples.map(({ kind, label, trial }) => <ReminderSample key={kind} kind={kind} label={label} trial={trial} />)}
          </div>
        </section>

        <section id="feedback-preview" className="mt-10" aria-labelledby="feedback-preview-heading">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Retention lead capture</p>
          <h2 id="feedback-preview-heading" className="mt-2 text-2xl font-extrabold">Final-day feedback and discount interest.</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">The modal asks why the customer is not ready, captures optional detail, and flags discount interest for the priority retention queue.</p>
          <TrialFeedbackForm submitted={false} preview autoOpen />
        </section>

        <p className="mt-8 text-center text-xs font-semibold text-ink-muted">Preview only · submissions are simulated locally and are not saved.</p>
      </div>
    </main>
  );
}

function createSampleTrial(now: number, remainingMs: number): TrialLifecycle {
  return readTrialLifecycle({
    status: "trialing",
    trialStartedAt: new Date(now - 9 * TRIAL_DAY_MS).toISOString(),
    trialEndsAt: new Date(now + remainingMs).toISOString(),
    trialDays: 14,
  }, now);
}

function ReminderSample({ kind, label, trial }: { kind: TrialReminderKind; label: string; trial: TrialLifecycle }) {
  const copy = reminderCopy[kind];
  const isLastDay = kind === "last_day";

  return (
    <article className={`rounded-card border p-5 ${isLastDay ? "border-danger/30 bg-danger-soft" : "border-warning/30 bg-warning/10"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg text-white ${isLastDay ? "bg-danger" : "bg-warning"}`}>!</span>
        <div>
          <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${isLastDay ? "text-danger" : "text-accent"}`}>{copy.eyebrow}</p>
          <h3 className="mt-1 text-lg font-extrabold">{copy.title}</h3>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-ink-muted">{copy.detail}</p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
        <span className="text-xs font-extrabold text-ink-muted">{label} · {formatTrialRemaining(trial.remainingMs)}</span>
        <a href={isLastDay ? "#feedback-preview" : "#billing-preview-heading"} className="shrink-0 rounded-btn bg-primary px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">{isLastDay ? "Tell us why" : "Choose Premium"}</a>
      </div>
    </article>
  );
}
