"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearOfflineCaches } from "@/lib/offline-cache";
import { clearOfflineSession, getOfflineAdminScope, getOfflineCredential, loadCachedCatalog, type OfflineCredential, type OfflineProfileSnapshot } from "@/lib/offline";
import { clearAdminLocalFirstCache, getAdminOfflineCacheStatus } from "@/lib/admin/local-first-store";
import SellScreen from "@/components/pos/SellScreen";
import OfflinePinUnlock from "@/components/OfflinePinUnlock";
import AdminOfflineShell from "@/components/admin/AdminOfflineShell";

export default function OwnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [posPath, setPosPath] = useState(false);
  const [adminPath, setAdminPath] = useState(false);
  const [offlineCredential, setOfflineCredential] = useState<OfflineCredential | null>(null);
  const [offlineCatalogReady, setOfflineCatalogReady] = useState(false);
  const [offlineProfile, setOfflineProfile] = useState<OfflineProfileSnapshot | null>(null);
  const [offlineAdminCacheReady, setOfflineAdminCacheReady] = useState(false);
  const [offlineAdminCredential, setOfflineAdminCredential] = useState<OfflineCredential | null>(null);

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
      void clearAdminLocalFirstCache();
      void clearOfflineCaches();
    }
    if (authError) noticeTimer = window.setTimeout(() => setAuthNotice(authError), 0);
    if (signedOut || authError) window.history.replaceState(null, "", "/login");
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
    const pathIsAdmin = window.location.pathname.startsWith("/admin");
    const browserIsOffline = !navigator.onLine;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this reads browser-owned navigation state once.
    setPosPath(pathIsPos);
    setAdminPath(pathIsAdmin);
    const onOffline = () => {
      void checkOfflineAccess();
    };
    const onOnline = () => {
      void checkOfflineAccess();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!pathIsPos && !pathIsAdmin && !browserIsOffline) {
      return () => {
        active = false;
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
      };
    }

    async function checkOfflineAccess() {
      const credential = await getOfflineCredential();
      const cached = pathIsPos && credential
        ? await loadCachedCatalog(credential.profile.store_id ?? credential.profile.org_id, credential.user_id).catch(() => null)
        : null;
      const adminScope = credential ? getOfflineAdminScope(credential) : null;
      const adminCached = pathIsAdmin && credential && adminScope
        ? await getAdminOfflineCacheStatus({
          userId: credential.user_id,
          orgId: adminScope.org_id,
          storeId: adminScope.store_id,
          role: adminScope.role,
        }).catch(() => null)
        : null;
      if (!active) return;
      setOfflineCredential(credential);
      setOfflineCatalogReady(Boolean(cached));
      setOfflineAdminCacheReady(Boolean(adminCached?.ready));
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

  async function openOfflineAdmin(credential: OfflineCredential) {
    const adminScope = getOfflineAdminScope(credential);
    if (!adminScope) throw new Error("Offline admin access is not enabled for this device.");
    const status = await getAdminOfflineCacheStatus({
      userId: credential.user_id,
      orgId: adminScope.org_id,
      storeId: adminScope.store_id,
      role: adminScope.role,
    }).catch(() => null);
    if (!status?.ready) throw new Error("No cached admin read models are ready yet. Sign in online and open the admin pages once.");
    setOfflineAdminCredential(credential);
  }

  if (offlineAdminCredential) return <AdminOfflineShell credential={offlineAdminCredential} />;
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

    if (profile.role !== "admin") {
      await supabase.auth.signOut();
      setEmailError("Staff members must use the store access link shared by their owner.");
      setEmailLoading(false);
      return;
    }

    if (profile.password_change_required) {
      router.replace("/account/password?required=1");
      return;
    }
    router.replace(profile.role === "cashier" ? "/pos" : "/admin");
  }

  return (
    <main className="min-h-full flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <div className="flex justify-center">
          <Image src="/logo.png" alt="Dumala POS" width={480} height={321} className="h-48 w-auto object-contain" priority />
        </div>
        <h1 className="sr-only">Owner workspace access</h1>
        <p className="mt-4 text-sm leading-6 text-ink-muted">Manage your business, branches, staff, and POS settings from one place.</p>
        {authNotice && <p role="alert" className="mt-4 rounded-btn border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{authNotice}</p>}
        {posPath && offlineCredential && offlineCatalogReady && (
          <OfflinePinUnlock credential={offlineCredential} onUnlock={openOfflinePos} />
        )}
        {posPath && offlineCredential && !offlineCatalogReady && (
          <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">An offline PIN is saved, but this branch menu is not cached yet. Sign in online and open POS once.</p>
        )}
        {posPath && !offlineCredential && <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">This tablet is offline or the POS server cannot be reached. Sign in online once, open POS, and create an offline PIN before the next offline shift.</p>}
        {adminPath && offlineCredential && offlineAdminCacheReady && (
          <OfflinePinUnlock credential={offlineCredential} onUnlock={openOfflineAdmin} />
        )}
        {adminPath && offlineCredential && !offlineAdminCacheReady && (
          <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">Offline admin recovery is not ready for this device. Sign in online as an admin or manager, enable read-only offline access, and open the admin pages once to cache them.</p>
        )}
        {adminPath && !offlineCredential && <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">This admin workspace is unavailable offline until an admin or manager enables device-bound read-only recovery while online.</p>}

        <form onSubmit={onEmailSubmit} className="mt-6">
          <label className="block text-sm font-medium text-ink" htmlFor="email">
            Owner email
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
          </label>

          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="email-password">
            Password
            <input id="email-password" type="password" required autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
          </label>

          {emailError && <p role="alert" className="mt-4 text-sm font-medium text-danger">{emailError}</p>}
          <button type="submit" disabled={emailLoading} className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50">{emailLoading ? "Signing in…" : "Sign in to owner workspace"}</button>
        </form>

        <div className="mt-7 border-t border-line pt-5 text-center">
          <p className="text-sm text-ink-muted">New to Dumala POS?</p>
          <Link href="/signup" className="mt-2 inline-flex rounded-btn bg-secondary px-4 py-2.5 text-sm font-extrabold text-primary transition hover:bg-secondary-hover">Create your POS account</Link>
        </div>
      </div>
    </main>
  );
}
