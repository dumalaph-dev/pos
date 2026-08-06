"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  enrollOfflineCredential,
  getOfflineCredential,
  OFFLINE_PIN_MAX_LENGTH,
  OFFLINE_PIN_MIN_LENGTH,
  type OfflineProfileSnapshot,
} from "@/lib/offline";

type OfflinePinSetupProps = {
  profile: OfflineProfileSnapshot;
  enabled?: boolean;
};

export default function OfflinePinSetup({ profile, enabled = true }: OfflinePinSetupProps) {
  const [checking, setChecking] = useState(true);
  const [hasCredential, setHasCredential] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getOfflineCredential().then((credential) => {
      if (!active) return;
      const profileScope = profile.store_id ?? profile.org_id;
      const credentialScope = credential?.profile.store_id ?? credential?.profile.org_id;
      // A branch/device reassignment must allow the cashier to replace the
      // old credential; otherwise the PIN would remain tied to a stale cache
      // scope and offline re-entry would fail closed forever.
      setHasCredential(credential?.user_id === profile.id && credentialScope === profileScope);
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [profile.id, profile.org_id, profile.store_id]);

  if (!enabled || checking || hasCredential || dismissed) return null;

  function updatePin(value: string, setter: (next: string) => void) {
    setter(value.replace(/\D/g, "").slice(0, OFFLINE_PIN_MAX_LENGTH));
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pin.length < OFFLINE_PIN_MIN_LENGTH || pin.length > OFFLINE_PIN_MAX_LENGTH) {
      setError(`Use a ${OFFLINE_PIN_MIN_LENGTH} to ${OFFLINE_PIN_MAX_LENGTH}-digit PIN.`);
      return;
    }
    if (pin !== confirmation) {
      setError("The PIN entries do not match.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await enrollOfflineCredential(profile, pin);
      setHasCredential(true);
      setPin("");
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The offline PIN could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[55] w-[min(22rem,calc(100vw-2rem))] rounded-card border border-primary/25 bg-surface p-4 shadow-[var(--shadow-pop)]">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Prepare for offline sales</p>
      <h2 className="mt-1 text-base font-extrabold text-ink">Create an offline PIN</h2>
      <p className="mt-1 text-sm leading-5 text-ink-muted">This device-only PIN lets you reopen POS when the internet or browser session is unavailable.</p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="block text-xs font-bold text-ink" htmlFor="offline-pin-new">
          New PIN
          <input id="offline-pin-new" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => updatePin(event.target.value, setPin)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-ink outline-none focus:border-primary" />
        </label>
        <label className="block text-xs font-bold text-ink" htmlFor="offline-pin-confirm">
          Confirm PIN
          <input id="offline-pin-confirm" type="password" inputMode="numeric" autoComplete="new-password" value={confirmation} onChange={(event) => updatePin(event.target.value, setConfirmation)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-ink outline-none focus:border-primary" />
        </label>
        {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={() => setDismissed(true)} className="rounded-btn px-3 py-2 text-xs font-bold text-ink-muted hover:text-ink">Later</button>
          <button type="submit" disabled={saving} className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold text-primary-fg disabled:opacity-50">{saving ? "Saving…" : "Save PIN"}</button>
        </div>
      </form>
    </aside>
  );
}
