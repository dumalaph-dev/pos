"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { submitTrialFeedback, type TrialFeedbackState } from "./actions";

const INITIAL_STATE: TrialFeedbackState = { ok: false, message: "" };

type TrialFeedbackFormProps = {
  submitted: boolean;
  preview?: boolean;
  autoOpen?: boolean;
};

export default function TrialFeedbackForm({ submitted, preview = false, autoOpen = false }: TrialFeedbackFormProps) {
  const [state, formAction, pending] = useActionState(submitTrialFeedback, INITIAL_STATE);
  const [open, setOpen] = useState(autoOpen);
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const hasSubmitted = submitted || state.ok || previewSubmitted;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handlePreviewSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPreviewSubmitted(true);
    setOpen(false);
  };

  return (
    <>
      <section className="mt-5 rounded-card border border-accent/25 bg-secondary p-5 sm:p-6" aria-labelledby="trial-feedback-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Before you go</p>
            <h2 id="trial-feedback-heading" className="mt-1 text-xl font-extrabold">What would help you choose Premium?</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">A quick answer helps us improve Dumala and lets our team prioritize a useful follow-up while your workspace is still fresh.</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
            <span className="rounded-pill bg-primary/10 px-3 py-1.5 text-xs font-extrabold text-primary">Final-day check-in</span>
            <button type="button" onClick={() => setOpen(true)} className="rounded-btn bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">
              {hasSubmitted ? "Review feedback" : "Tell us why"}
            </button>
          </div>
        </div>

        {hasSubmitted ? (
          <div className="mt-5 rounded-btn border border-success/25 bg-success/10 px-4 py-3" role="status" aria-live="polite">
            <p className="text-sm font-extrabold text-success">Thanks for helping us improve Dumala.</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">{preview ? "This preview submission is simulated locally." : "Your feedback is with our team. If you requested a tailored offer, we will review it before following up."}</p>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-ink-muted">Tell us what held you back, and let us know if a tailored discount or billing option would help.</p>
        )}
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-primary/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 text-ink shadow-[var(--shadow-pop)] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="trial-feedback-modal-heading" aria-describedby="trial-feedback-modal-description">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Final-day check-in</p>
                <h2 id="trial-feedback-modal-heading" className="mt-1 text-2xl font-extrabold">What would help you choose Premium?</h2>
                <p id="trial-feedback-modal-description" className="mt-2 text-sm leading-6 text-ink-muted">Your answer helps us prioritize a useful follow-up. It takes less than a minute.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-lg font-bold text-ink-muted transition hover:border-primary hover:text-primary" aria-label="Close feedback modal">
                ×
              </button>
            </div>

            {hasSubmitted ? (
              <div className="mt-6 rounded-btn border border-success/25 bg-success/10 px-4 py-4" role="status" aria-live="polite">
                <p className="text-sm font-extrabold text-success">Thank you for the feedback.</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">{preview ? "This preview submission is simulated locally." : "We will review your answer and follow up if you requested a tailored offer."}</p>
              </div>
            ) : (
              <form action={preview ? undefined : formAction} onSubmit={preview ? handlePreviewSubmit : undefined} className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink" htmlFor="trial-feedback-reason">
                  Main reason
                  <select id="trial-feedback-reason" name="reason" required defaultValue="" className="mt-1 w-full rounded-btn border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-primary">
                    <option value="" disabled>Choose one</option>
                    <option value="too_expensive">The price is too high right now</option>
                    <option value="still_setting_up">I&apos;m still setting up my business</option>
                    <option value="missing_feature">I need a feature that&apos;s missing</option>
                    <option value="need_more_time">I need more time to decide</option>
                    <option value="not_ready">I&apos;m not ready to subscribe yet</option>
                    <option value="other">Something else</option>
                  </select>
                </label>

                <label className="block text-sm font-semibold text-ink" htmlFor="trial-feedback-details">
                  Anything else? <span className="font-normal text-ink-muted">(optional)</span>
                  <textarea id="trial-feedback-details" name="details" maxLength={1000} rows={3} className="mt-1 w-full resize-y rounded-btn border border-line-strong bg-surface px-4 py-3 text-ink outline-none transition focus:border-primary" placeholder="Tell us what would make Dumala a better fit." />
                </label>

                <label className="flex items-start gap-3 rounded-btn border border-line bg-bg px-4 py-3 text-sm text-ink sm:col-span-2">
                  <input type="checkbox" name="wants_discount" className="mt-1 h-4 w-4 accent-primary" />
                  <span><strong className="font-extrabold">I&apos;d like a tailored offer</strong><small className="mt-0.5 block text-xs leading-5 text-ink-muted">If price is the blocker, our team can review a possible discount or a better-fit billing term.</small></span>
                </label>

                {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-btn border px-4 py-3 text-sm font-semibold sm:col-span-2 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>}
                <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-btn border border-line-strong px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-ink-muted transition hover:border-primary hover:text-primary">Not now</button>
                  <button type="submit" disabled={pending} className="rounded-btn bg-primary px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Sending feedback..." : "Send feedback"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
