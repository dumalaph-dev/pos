"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  clearAdminLocalFirstCache,
  clearAdminLocalFirstScope,
} from "@/lib/admin/local-first-store";
import {
  enrollOfflineCredential,
  getOfflineAdminScope,
  getOfflineCredential,
  OFFLINE_PIN_MAX_LENGTH,
  OFFLINE_PIN_MIN_LENGTH,
  type OfflineProfileSnapshot,
} from "@/lib/offline";

export function OfflineAdminSetup({
  profile,
  storeId,
  branchName,
  enabled = true,
}: {
  profile: OfflineProfileSnapshot;
  storeId: string | null;
  branchName: string;
  enabled?: boolean;
}) {
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [online, setOnline] = useState(true);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void getOfflineCredential().then(async (credential) => {
      if (!active) return;
      const scope = getOfflineAdminScope(credential);
      if (credential && (credential.user_id !== profile.id || credential.profile.org_id !== profile.org_id)) {
        await clearAdminLocalFirstCache().catch(() => {});
      } else if (credential && scope && (scope.store_id !== storeId || scope.role !== profile.role)) {
        await clearAdminLocalFirstScope({
          userId: credential.user_id,
          orgId: scope.org_id,
          storeId: scope.store_id,
          role: scope.role,
        }).catch(() => {});
      }
      if (!active) return;
      setHasAccess(Boolean(
        credential?.user_id === profile.id &&
        scope?.org_id === profile.org_id &&
        scope.store_id === storeId &&
        scope.role === profile.role,
      ));
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [profile.id, profile.org_id, profile.role, storeId]);

  const adminRole = profile.role === "admin" || profile.role === "manager" ? profile.role : null;
  if (
    !enabled ||
    checking ||
    hasAccess ||
    dismissed ||
    !online ||
    !adminRole
  ) return null;

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
      if (!adminRole) throw new Error("Only an admin or manager can enable offline admin recovery.");
      const existing = await getOfflineCredential();
      const enrollmentProfile = existing && existing.user_id === profile.id && existing.profile.org_id === profile.org_id && existing.profile.role === profile.role
        ? { ...existing.profile, full_name: profile.full_name, brand_logo_url: profile.brand_logo_url }
        : profile;
      await enrollOfflineCredential(enrollmentProfile, pin, {
        adminScope: {
          org_id: profile.org_id,
          store_id: storeId,
          role: adminRole,
          enabled_at: new Date().toISOString(),
        },
      });
      setHasAccess(true);
      setPin("");
      setConfirmation("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Offline admin access could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[55] w-[min(24rem,calc(100vw-2rem))] rounded-card border border-primary/25 bg-surface p-4 shadow-[var(--shadow-pop)]">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Secure offline admin</p>
      <h2 className="mt-1 text-base font-extrabold text-ink">Enable read-only recovery</h2>
      <p className="mt-1 text-sm leading-5 text-ink-muted">Save a device PIN for {branchName}. It can reopen cached orders, inventory, audit, and shift readings while offline. Sensitive changes still require an online session.</p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="block text-xs font-bold text-ink" htmlFor="offline-admin-pin-new">
          Device PIN
          <input id="offline-admin-pin-new" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => updatePin(event.target.value, setPin)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-ink outline-none focus:border-primary" />
        </label>
        <label className="block text-xs font-bold text-ink" htmlFor="offline-admin-pin-confirm">
          Confirm PIN
          <input id="offline-admin-pin-confirm" type="password" inputMode="numeric" autoComplete="new-password" value={confirmation} onChange={(event) => updatePin(event.target.value, setConfirmation)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-ink outline-none focus:border-primary" />
        </label>
        {error && <p role="alert" className="text-xs font-semibold text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={() => setDismissed(true)} className="rounded-btn px-3 py-2 text-xs font-bold text-ink-muted hover:text-ink">Later</button>
          <button type="submit" disabled={saving} className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold text-primary-fg disabled:opacity-50">{saving ? "Saving…" : "Enable offline admin"}</button>
        </div>
      </form>
    </aside>
  );
}
