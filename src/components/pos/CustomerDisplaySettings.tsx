"use client";

import { useMemo, useState } from "react";
import {
  displayPairingUrl,
  generateDisplayPairingToken,
  normalizeDisplayPairingToken,
} from "@/lib/display";

export default function CustomerDisplaySettings({
  initialToken,
  onSave,
  onClose,
  onToast,
}: {
  initialToken: string | null;
  onSave: (token: string | null) => Promise<void>;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [token, setToken] = useState(initialToken ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => {
    const normalized = normalizeDisplayPairingToken(token);
    return normalized ? displayPairingUrl(normalized) : "";
  }, [token]);

  const createToken = () => {
    setToken(generateDisplayPairingToken());
    setCopied(false);
  };

  const copyUrl = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onToast("Customer display link copied.");
    } catch {
      onToast("Copy is unavailable in this browser. Select the link and copy it manually.");
    }
  };

  const save = async () => {
    const normalized = normalizeDisplayPairingToken(token);
    if (!normalized) {
      onToast("Create a pairing token before saving.");
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
      onClose();
    } catch (error) {
      onToast(`Couldn't save customer display pairing: ${(error as Error).message ?? error}`);
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-card bg-raised p-5 shadow-[var(--shadow-pop)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Customer display</p>
            <h2 className="mt-1 text-xl font-extrabold text-primary">Pair a second screen</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Open the link on the customer-facing tablet or monitor. The display mirrors this terminal’s order and never interrupts a sale.</p>
          </div>
          <span className="rounded-pill bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary">P5</span>
        </div>

        <div className="mt-5 rounded-card border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Pairing token</p>
              <p className="mt-1 text-xs text-ink-muted">Keep this link private to the counter.</p>
            </div>
            <button type="button" onClick={createToken} className="rounded-btn bg-secondary px-3 py-2 text-xs font-bold text-ink">{token ? "Rotate token" : "Create token"}</button>
          </div>
          <input value={token} onChange={(event) => { setToken(event.target.value); setCopied(false); }} placeholder="Create a secure pairing token" className={`${input} mt-3 font-mono text-xs`} aria-label="Customer display pairing token" />
          {url && (
            <>
              <label className="mt-3 block text-xs font-bold text-ink" htmlFor="customer-display-url">Display link</label>
              <input id="customer-display-url" readOnly value={url} className={`${input} mt-1 font-mono text-xs text-ink-muted`} onFocus={(event) => event.currentTarget.select()} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyUrl()} className="rounded-btn bg-primary px-3 py-2 text-xs font-bold text-primary-fg">{copied ? "Copied" : "Copy link"}</button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-btn bg-secondary px-3 py-2 text-xs font-bold text-ink">Open display</a>
              </div>
            </>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-btn bg-secondary py-3 font-bold text-ink">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving || !normalizeDisplayPairingToken(token)} className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40">{saving ? "Saving…" : "Save pairing"}</button>
        </div>
      </div>
    </div>
  );
}
