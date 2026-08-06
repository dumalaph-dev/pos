"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  OFFLINE_PIN_MAX_LENGTH,
  OFFLINE_PIN_MAX_ATTEMPTS,
  OFFLINE_PIN_MIN_LENGTH,
  type OfflineCredential,
  verifyOfflinePin,
} from "@/lib/offline";

type OfflinePinUnlockProps = {
  credential: OfflineCredential;
  onUnlock: (credential: OfflineCredential) => void | Promise<void>;
};

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "backspace"] as const;

export default function OfflinePinUnlock({ credential, onUnlock }: OfflinePinUnlockProps) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState(
    Math.max(0, OFFLINE_PIN_MAX_ATTEMPTS - credential.failed_attempts),
  );
  const [lockedUntil, setLockedUntil] = useState<number | null>(credential.locked_until);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= lockedUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = secondsLeft > 0;

  function updatePin(next: string) {
    if (busy || locked) return;
    setPin(next.replace(/\D/g, "").slice(0, OFFLINE_PIN_MAX_LENGTH));
    setError(null);
  }

  function pressKey(key: (typeof keypad)[number]) {
    if (key === "clear") return updatePin("");
    if (key === "backspace") return updatePin(pin.slice(0, -1));
    updatePin(pin + key);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || busy) return;
    if (pin.length < OFFLINE_PIN_MIN_LENGTH || pin.length > OFFLINE_PIN_MAX_LENGTH) {
      setError(`Enter a ${OFFLINE_PIN_MIN_LENGTH} to ${OFFLINE_PIN_MAX_LENGTH}-digit PIN.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await verifyOfflinePin(pin);
      if (result.ok) {
        await onUnlock(result.credential);
        return;
      }
      setRemainingAttempts(result.remainingAttempts);
      setLockedUntil(result.lockedUntil);
      if (result.reason === "locked") {
        setError("Too many incorrect attempts. Try again when the lockout ends.");
      } else if (result.reason === "unavailable") {
        setError("Offline PIN access is not available on this device.");
      } else {
        setError(
          result.remainingAttempts > 0
            ? `Incorrect PIN. ${result.remainingAttempts} attempt${result.remainingAttempts === 1 ? "" : "s"} remaining.`
            : "Incorrect PIN.",
        );
      }
      setPin("");
    } catch {
      setError("The offline PIN could not be checked. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-btn border border-primary/25 bg-primary/5 p-4" aria-label="Offline POS unlock">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Offline POS</p>
      <h2 className="mt-1 text-lg font-extrabold text-ink">Unlock this tablet</h2>
      <p className="mt-1 text-sm leading-5 text-ink-muted">Enter the PIN created for this cashier device.</p>

      {locked ? (
        <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-3 py-2 text-sm font-semibold text-ink">
          Offline unlock is paused for {secondsLeft}s.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <label className="sr-only" htmlFor="offline-pin">Offline PIN</label>
          <input
            id="offline-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            autoFocus
            value={pin}
            onChange={(event) => updatePin(event.target.value)}
            maxLength={OFFLINE_PIN_MAX_LENGTH}
            className="w-full rounded-btn border border-line-strong bg-surface px-4 py-3 text-center text-2xl font-extrabold tracking-[0.45em] text-ink outline-none focus:border-primary"
            aria-describedby="offline-pin-help"
          />
          <p id="offline-pin-help" className="mt-2 text-center text-xs text-ink-muted">
            {remainingAttempts > 0 ? `${remainingAttempts} attempts remaining` : "Enter your PIN to continue"}
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2" aria-label="PIN keypad">
            {keypad.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pressKey(key)}
                className="min-h-11 rounded-btn border border-line bg-surface px-2 py-2 text-sm font-extrabold text-ink transition hover:border-primary hover:text-primary disabled:opacity-50"
                disabled={busy}
                aria-label={key === "backspace" ? "Delete last digit" : key === "clear" ? "Clear PIN" : `Digit ${key}`}
              >
                {key === "backspace" ? "⌫" : key === "clear" ? "Clear" : key}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}
          <button type="submit" disabled={busy || pin.length < OFFLINE_PIN_MIN_LENGTH} className="mt-3 w-full rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg disabled:opacity-50">
            {busy ? "Checking…" : "Unlock POS"}
          </button>
        </form>
      )}
    </section>
  );
}
