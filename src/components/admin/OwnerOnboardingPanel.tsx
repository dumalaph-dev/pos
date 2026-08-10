"use client";

import NextLink from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OWNER_GUIDANCE, OWNER_MONITORING_GUIDE, OWNER_ONBOARDING_PHASES, type OwnerGuidanceTopic, type OwnerOnboardingState } from "@/lib/admin/onboarding";
import { AdminIcon } from "./AdminIcon";

const ONBOARDING_DISMISSED_KEY = "pos.owner-onboarding.dismissed";
const GUIDANCE_DISMISSED_PREFIX = "pos.owner-guidance.dismissed.";
const RESET_EVENT = "pos.owner-guidance-reset";

function readDismissed(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string, dismissed: boolean) {
  try {
    if (dismissed) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // Private browsing or restricted storage should not block the guide.
  }
}

function resetOwnerGuidance() {
  writeDismissed(ONBOARDING_DISMISSED_KEY, false);
  Object.keys(OWNER_GUIDANCE).forEach((topic) => writeDismissed(`${GUIDANCE_DISMISSED_PREFIX}${topic}`, false));
  window.dispatchEvent(new Event(RESET_EVENT));
}

function notifyGuidanceChange() {
  window.dispatchEvent(new Event(RESET_EVENT));
}

function subscribeToGuidance(callback: () => void) {
  window.addEventListener(RESET_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(RESET_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useDismissedGuidance(key: string) {
  return useSyncExternalStore(
    subscribeToGuidance,
    () => readDismissed(key),
    () => false,
  );
}

const STEP_ICONS = {
  business: "settings",
  branch: "branches",
  pos: "pos",
  catalog: "box",
  inventory: "inventory",
  staff: "employees",
  dashboard: "chart",
} as const;

function OwnerSetupDialog({ state, nextStep, onClose, isLechonHouseBusiness }: { state: OwnerOnboardingState; nextStep: OwnerOnboardingState["steps"][number] | undefined; onClose: () => void; isLechonHouseBusiness: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="owner-onboarding-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="owner-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-onboarding-dialog-heading" aria-describedby="owner-onboarding-dialog-description">
        <div className="owner-onboarding-dialog__header">
          <div>
            <p className="owner-onboarding__eyebrow">Store owner setup</p>
            <h2 id="owner-onboarding-dialog-heading">{state.isComplete ? "Review your setup and daily routine" : "Create in this order"}</h2>
            <p id="owner-onboarding-dialog-description">{state.isComplete ? "Your essentials are ready. Use this short routine to keep sales, stock, and closing counts reliable." : "Start with the business profile, then create the branch and POS counter. Add the menu and opening stock before preparing staff and alerts."}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="owner-onboarding-dialog__close" aria-label="Close setup guide" onClick={onClose}><span aria-hidden="true">{"\u00D7"}</span></button>
        </div>

        <div className="owner-onboarding-dialog__scroll">
          <div className="owner-onboarding-dialog__progress" aria-label={`${state.completedCount} of ${state.totalCount} setup steps complete`}>
            <div className="owner-onboarding__progress-meta"><span>{state.completedCount} of {state.totalCount} complete</span><strong>{state.progressPercent}%</strong></div>
            <div className="owner-onboarding__progress-track"><span style={{ width: `${state.progressPercent}%` }} /></div>
          </div>

          <section className="owner-onboarding-dialog__section" aria-labelledby="owner-onboarding-plan-heading">
            <div className="owner-onboarding-dialog__section-heading">
              <div><p className="owner-onboarding__eyebrow">The setup plan</p><h3 id="owner-onboarding-plan-heading">Create first, then monitor</h3></div>
              <span className="owner-onboarding-dialog__section-note">{nextStep ? `Next: ${nextStep.title}` : "All essentials ready"}</span>
            </div>

            <div className="owner-onboarding__phases">
              {OWNER_ONBOARDING_PHASES.map((phase, phaseIndex) => {
                const phaseSteps = phase.stepIds.flatMap((id) => {
                  const step = state.steps.find((candidate) => candidate.id === id);
                  return step ? [step] : [];
                });
                const completedInPhase = phaseSteps.filter((step) => step.complete).length;
                const isNextPhase = nextStep ? phase.stepIds.includes(nextStep.id) : phaseIndex === 0;

                return (
                  <details key={phase.title} className="owner-onboarding__phase" open={isNextPhase}>
                    <summary>
                      <span className="owner-onboarding__phase-number">{phaseIndex + 1}</span>
                      <span className="owner-onboarding__phase-summary"><strong>{phase.title}</strong><small>{completedInPhase} of {phaseSteps.length} ready</small></span>
                      <AdminIcon name="arrow" size={14} />
                    </summary>
                    <div className="owner-onboarding__phase-body">
                      <p>{phase.description}</p>
                      <ol className="owner-onboarding__plan-list">
                        {phaseSteps.map((step) => (
                          <li key={step.id} className={`owner-onboarding__plan-step ${step.complete ? "is-complete" : ""}`}>
                            <span className="owner-onboarding__plan-step-icon"><AdminIcon name={step.complete ? "check" : STEP_ICONS[step.id]} size={15} /></span>
                            <div className="owner-onboarding__plan-step-copy"><div className="owner-onboarding__step-title"><span>{step.title}</span>{step.complete && <small>Ready</small>}</div><p>{step.description}</p><span>{step.suggestion}</span></div>
                            <NextLink href={step.href} className="owner-onboarding__step-link">{step.complete ? "Review" : step.actionLabel}<AdminIcon name="arrow" size={12} /></NextLink>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>

          <section className="owner-onboarding-dialog__section owner-onboarding-dialog__monitoring" aria-labelledby="owner-onboarding-monitoring-heading">
            <div className="owner-onboarding-dialog__section-heading"><div><p className="owner-onboarding__eyebrow">After setup</p><h3 id="owner-onboarding-monitoring-heading">How to monitor the business</h3></div></div>
            <p className="owner-onboarding-dialog__section-description">Once the basics are ready, use this simple rhythm to keep the operation accurate.</p>
            <div className="owner-onboarding__monitoring-list">
              {OWNER_MONITORING_GUIDE.filter((item) => isLechonHouseBusiness || item.title !== "Record preparation honestly").map((item, index) => (
                <article key={item.title} className="owner-onboarding__monitoring-item">
                  <span className="owner-onboarding__monitoring-number">{index + 1}</span>
                  <div><h4>{item.title}</h4><p>{item.body}</p><NextLink href={item.href}>{item.actionLabel}<AdminIcon name="arrow" size={12} /></NextLink></div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="owner-onboarding-dialog__footer"><span>Need this later? You can restore the guide from Settings.</span><button type="button" className="owner-onboarding-dialog__done" onClick={onClose}>Done for now</button></div>
      </div>
    </div>
  );
}

export function OwnerOnboardingPanel({ state, isLechonHouseBusiness }: { state: OwnerOnboardingState; isLechonHouseBusiness: boolean }) {
  const dismissed = useDismissedGuidance(ONBOARDING_DISMISSED_KEY);
  const [isOpen, setIsOpen] = useState(false);
  const nextStep = state.steps.find((step) => !step.complete);
  const closeDialog = useCallback(() => setIsOpen(false), []);

  if (dismissed) {
    return (
      <div className="owner-onboarding-reopen">
        <span><AdminIcon name="help" size={15} /> Setup guide is hidden for now.</span>
        <button type="button" onClick={() => { writeDismissed(ONBOARDING_DISMISSED_KEY, false); notifyGuidanceChange(); }}>Show setup guide</button>
      </div>
    );
  }

  return (
    <section className="owner-onboarding owner-onboarding--compact" aria-labelledby="owner-onboarding-heading">
      <div className="owner-onboarding__header">
        <div className="owner-onboarding__heading">
          <span className="owner-onboarding__mark"><AdminIcon name="star" size={17} /></span>
          <div>
            <p className="owner-onboarding__eyebrow">Store owner setup</p>
            <h2 id="owner-onboarding-heading">{state.isComplete ? "Your workspace is ready" : "Set up your workspace in the right order"}</h2>
            <p>{state.isComplete ? "Review the daily monitoring routine, or revisit any setup area when your business changes." : "Create your business profile first, then branch and POS. Next add categories and products, opening inventory, staff, and dashboard settings."}</p>
          </div>
        </div>
        <div className="owner-onboarding__actions">
          <button type="button" className="owner-onboarding__open" onClick={() => setIsOpen(true)}>{state.isComplete ? "Review setup" : "View setup steps"}<AdminIcon name="arrow" size={13} /></button>
          <button type="button" className="owner-onboarding__dismiss" onClick={() => { writeDismissed(ONBOARDING_DISMISSED_KEY, true); notifyGuidanceChange(); }}>Hide for now</button>
        </div>
      </div>

      <div className="owner-onboarding__footer">
        <div className="owner-onboarding__progress" aria-label={`${state.completedCount} of ${state.totalCount} setup steps complete`}>
          <div className="owner-onboarding__progress-meta"><span>{state.completedCount} of {state.totalCount} complete</span><strong>{state.progressPercent}%</strong></div>
          <div className="owner-onboarding__progress-track"><span style={{ width: `${state.progressPercent}%` }} /></div>
        </div>
        <div className="owner-onboarding__next">{nextStep ? <><strong>Next: {nextStep.title}</strong><span>{nextStep.suggestion}</span></> : <><strong>Next: keep monitoring</strong><span>{isLechonHouseBusiness ? "Use the dashboard, inventory yield, supplier, and closing-count guides as your routine grows." : "Use the dashboard, supplier, and closing-count guides as your routine grows."}</span></>}</div>
      </div>

      {isOpen && <OwnerSetupDialog state={state} nextStep={nextStep} onClose={closeDialog} isLechonHouseBusiness={isLechonHouseBusiness} />}
    </section>
  );
}

export function OwnerGuidance({ topic, visible = true, compact = false }: { topic: OwnerGuidanceTopic; visible?: boolean; compact?: boolean }) {
  const content = OWNER_GUIDANCE[topic];
  const storageKey = `${GUIDANCE_DISMISSED_PREFIX}${topic}`;
  const dismissed = useDismissedGuidance(storageKey);

  if (!visible || dismissed) return null;

  return (
    <aside className={`owner-guidance ${compact ? "owner-guidance--compact" : ""}`} aria-labelledby={`owner-guidance-${topic}`}>
      <div className="owner-guidance__icon"><AdminIcon name="help" size={17} /></div>
      <div className="owner-guidance__body">
        <p className="owner-guidance__eyebrow">{content.eyebrow}</p>
        <h2 id={`owner-guidance-${topic}`}>{content.title}</h2>
        <p className="owner-guidance__description">{content.body}</p>
        {!compact && <ul>{content.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
        <NextLink href={content.href} className="owner-guidance__link">{content.actionLabel}<AdminIcon name="arrow" size={13} /></NextLink>
      </div>
      <button type="button" className="owner-guidance__dismiss" aria-label={`Dismiss ${content.title} tip`} onClick={() => { writeDismissed(storageKey, true); notifyGuidanceChange(); }}><span aria-hidden="true">{"\u00D7"}</span></button>
    </aside>
  );
}

export function RestoreOwnerGuidanceButton() {
  const [restored, setRestored] = useState(false);

  return (
    <button type="button" className="owner-guidance-reset" onClick={() => { resetOwnerGuidance(); setRestored(true); }}>
      <AdminIcon name={restored ? "check" : "refresh"} size={15} />
      {restored ? "Guide restored" : "Show guide again"}
    </button>
  );
}
