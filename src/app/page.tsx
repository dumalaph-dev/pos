"use client";

import { useEffect, useState, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginWithEmployeeId, type LoginState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { clearOfflineCaches } from "@/lib/offline-cache";
import { clearOfflineSession, getOfflineCredential, loadCachedCatalog, type OfflineCredential, type OfflineProfileSnapshot } from "@/lib/offline";
import SellScreen from "@/components/pos/SellScreen";
import OfflinePinUnlock from "@/components/OfflinePinUnlock";

type LoginMode = "employee" | "email";

const initialEmployeeLoginState: LoginState = { message: "" };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("employee");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [posPath, setPosPath] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(false);
  const [offlineCredential, setOfflineCredential] = useState<OfflineCredential | null>(null);
  const [offlineCatalogReady, setOfflineCatalogReady] = useState(false);
  const [offlineProfile, setOfflineProfile] = useState<OfflineProfileSnapshot | null>(null);
  const [employeeState, employeeAction, employeePending] = useActionState(loginWithEmployeeId, initialEmployeeLoginState);

  // Backstop for every sign-out path that lands here, not just SignOutButton:
  // wipe the app-shell caches so nothing from the last session is left for the
  // next person on this terminal. Read off `location` rather than
  // `useSearchParams` to keep this page out of a Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const signedOut = params.has("signed-out");
    const authError = params.get("auth_error");
    let noticeTimer: number | undefined;
    if (signedOut) {
      void clearOfflineSession();
      void clearOfflineCaches();
    }
    if (authError) noticeTimer = window.setTimeout(() => setAuthNotice(authError), 0);
    if (signedOut || authError) window.history.replaceState(null, "", "/");
    return () => {
      if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
    };
  }, []);

  // When the service worker has to serve the public shell for an offline
  // /pos reload, recover the POS from the device-local PIN credential and its
  // matching branch-scoped catalog cache. Private HTML never enters Cache Storage.
  useEffect(() => {
    let active = true;
    const pathIsPos = window.location.pathname.startsWith("/pos");
    const browserIsOffline = !navigator.onLine;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this reads browser-owned navigation state once.
    setPosPath(pathIsPos);
    setBrowserOffline(browserIsOffline);
    const onOffline = () => {
      setBrowserOffline(true);
      void checkOfflineAccess();
    };
    const onOnline = () => setBrowserOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!pathIsPos && !browserIsOffline) {
      return () => {
        active = false;
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
      };
    }

    async function checkOfflineAccess() {
      const credential = await getOfflineCredential();
      const cached = credential
        ? await loadCachedCatalog(credential.profile.store_id ?? credential.profile.org_id, credential.user_id).catch(() => null)
        : null;
      if (!active) return;
      setOfflineCredential(credential);
      setOfflineCatalogReady(Boolean(cached));
    }

    void checkOfflineAccess();
    return () => {
      active = false;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  async function openOfflinePos(credential: OfflineCredential) {
    const cached = await loadCachedCatalog(credential.profile.store_id ?? credential.profile.org_id, credential.user_id).catch(() => null);
    if (!cached) throw new Error("Offline POS is not ready yet. Sign in online and open POS once to cache this branch menu.");
    setOfflineProfile(cached.profile);
  }

  if (offlineProfile) return <SellScreen offlineProfile={offlineProfile} />;

  async function onEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEmailError(null);
    setEmailLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: emailPassword,
    });
    if (error || !data.user) {
      setEmailError(error?.message || "Email or password is incorrect.");
      setEmailLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, password_change_required")
      .eq("id", data.user.id)
      .single();
    if (profileError || !profile) {
      await supabase.auth.signOut();
      setEmailError("Your employee profile is not ready. Ask an administrator for help.");
      setEmailLoading(false);
      return;
    }

    if (profile.password_change_required) {
      router.replace("/account/password?required=1");
      return;
    }
    router.replace(profile.role === "cashier" ? "/pos" : "/admin");
  }

  function selectMode(nextMode: LoginMode) {
    setMode(nextMode);
    setEmailError(null);
    setAuthNotice(null);
  }

  return (
    <main className="min-h-full flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Lechon POS</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Use your employee ID for POS access, or use email for an owner or administrator account.</p>
        {authNotice && <p role="alert" className="mt-4 rounded-btn border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{authNotice}</p>}
        {(browserOffline || posPath) && offlineCredential && offlineCatalogReady && (
          <OfflinePinUnlock credential={offlineCredential} onUnlock={openOfflinePos} />
        )}
        {(browserOffline || posPath) && offlineCredential && !offlineCatalogReady && (
          <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">An offline PIN is saved, but this branch menu is not cached yet. Sign in online and open POS once.</p>
        )}
        {(browserOffline || posPath) && !offlineCredential && <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">This tablet is offline or the POS server cannot be reached. Sign in online once, open POS, and create an offline PIN before the next offline shift.</p>}

        <div className="mt-6 grid grid-cols-2 rounded-btn bg-raised p-1" role="tablist" aria-label="Sign-in method">
          <button type="button" role="tab" aria-selected={mode === "employee"} onClick={() => selectMode("employee")} className={`rounded-[10px] px-3 py-2 text-xs font-extrabold transition ${mode === "employee" ? "bg-primary text-primary-fg shadow-sm" : "text-ink-muted hover:text-ink"}`}>Employee ID</button>
          <button type="button" role="tab" aria-selected={mode === "email"} onClick={() => selectMode("email")} className={`rounded-[10px] px-3 py-2 text-xs font-extrabold transition ${mode === "email" ? "bg-primary text-primary-fg shadow-sm" : "text-ink-muted hover:text-ink"}`}>Email</button>
        </div>

        {mode === "employee" ? (
          <form action={employeeAction} className="mt-6">
            <label className="block text-sm font-medium text-ink" htmlFor="employee-code">
              Employee ID
              <input id="employee-code" name="employee_code" type="text" required autoCapitalize="characters" autoComplete="username" placeholder="EMP-0001" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 uppercase text-ink outline-none focus:border-primary" />
            </label>

            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="employee-password">
              Password
              <input id="employee-password" name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
            </label>

            <p className="mt-3 text-xs leading-5 text-ink-muted">First time here? Use the common initial password from your administrator. You will be asked to create a private password after signing in.</p>
            {employeeState.message && <p role="alert" className="mt-4 text-sm font-medium text-danger">{employeeState.message}</p>}

            <button type="submit" disabled={employeePending} className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50">{employeePending ? "Signing in…" : "Sign in to POS"}</button>
          </form>
        ) : (
          <form onSubmit={onEmailSubmit} className="mt-6">
            <label className="block text-sm font-medium text-ink" htmlFor="email">
              Email
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
            </label>

            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="email-password">
              Password
              <input id="email-password" type="password" required autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
            </label>

            {emailError && <p role="alert" className="mt-4 text-sm font-medium text-danger">{emailError}</p>}
            <button type="submit" disabled={emailLoading} className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50">{emailLoading ? "Signing in…" : "Sign in"}</button>
          </form>
        )}

        <div className="mt-7 border-t border-line pt-5 text-center">
          <p className="text-sm text-ink-muted">Are you a store owner?</p>
          <Link href="/signup" className="mt-2 inline-flex rounded-btn bg-secondary px-4 py-2.5 text-sm font-extrabold text-primary transition hover:bg-secondary-hover">Create your POS account</Link>
        </div>
      </div>
    </main>
  );
}
