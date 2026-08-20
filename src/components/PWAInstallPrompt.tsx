"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isPublicMenuPath } from "@/lib/public-menu-route";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type StoredInstallState = "installed" | "dismissed" | null;

const INSTALL_STATE_KEY = "dumala:pwa-install-state";
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PWA_INSTALL_RESET_EVENT = "dumala:pwa-install-reset";
const PWA_INSTALL_REQUEST_EVENT = "dumala:pwa-install-request";

// `beforeinstallprompt` can be dispatched before React hydrates the root
// layout. Keep the event at module scope so the prompt is not lost during the
// initial document load, while the component listener below still handles
// browsers that dispatch it later.
let capturedInstallPrompt: InstallPromptEvent | null = null;

function captureInstallPrompt(event: Event) {
  event.preventDefault();
  capturedInstallPrompt = event as InstallPromptEvent;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", captureInstallPrompt);
}

function isStandalone() {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function readStoredInstallState(): StoredInstallState {
  try {
    const stored = window.localStorage.getItem(INSTALL_STATE_KEY);
    if (stored === "installed") return "installed";
    if (!stored || !stored.startsWith("dismissed:")) return null;

    const expiresAt = Number(stored.slice("dismissed:".length));
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return "dismissed";

    window.localStorage.removeItem(INSTALL_STATE_KEY);
  } catch {
    // Private browsing modes can block storage. The in-memory state still
    // keeps this session quiet when storage is unavailable.
  }
  return null;
}

function storeInstallState(state: "installed" | "dismissed") {
  try {
    const value = state === "installed"
      ? state
      : `dismissed:${Date.now() + DISMISSAL_TTL_MS}`;
    window.localStorage.setItem(INSTALL_STATE_KEY, value);
  } catch {
    // The prompt still behaves correctly for the current session.
  }
}

function clearStoredInstallState() {
  try {
    if (window.localStorage.getItem(INSTALL_STATE_KEY) !== "installed") {
      window.localStorage.removeItem(INSTALL_STATE_KEY);
    }
  } catch {
    // Private browsing or restricted storage should not block the prompt.
  }
}

export function resetPwaInstallPrompt() {
  if (typeof window === "undefined") return;
  clearStoredInstallState();
  window.dispatchEvent(new Event(PWA_INSTALL_RESET_EVENT));
}

export function requestPwaInstall() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PWA_INSTALL_REQUEST_EVENT));
}

export function PWAInstallButton({ className, children = "Install Dumala App" }: { className: string; children?: ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const syncAvailability = () => {
      const standalone = isStandalone();
      const storedState = readStoredInstallState();
      setInstalled(standalone || storedState === "installed");
      setAvailable(!standalone && (Boolean(capturedInstallPrompt) || isIos()));
    };

    syncAvailability();
    window.addEventListener("beforeinstallprompt", syncAvailability);
    window.addEventListener("appinstalled", syncAvailability);
    window.addEventListener(PWA_INSTALL_RESET_EVENT, syncAvailability);
    window.addEventListener(PWA_INSTALL_REQUEST_EVENT, syncAvailability);

    return () => {
      window.removeEventListener("beforeinstallprompt", syncAvailability);
      window.removeEventListener("appinstalled", syncAvailability);
      window.removeEventListener(PWA_INSTALL_RESET_EVENT, syncAvailability);
      window.removeEventListener(PWA_INSTALL_REQUEST_EVENT, syncAvailability);
    };
  }, []);

  if (!available || installed) return null;

  return (
    <button type="button" className={className} onClick={requestPwaInstall} data-pwa-install-action>
      {children}
    </button>
  );
}

export default function PWAInstallPrompt() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const installingRef = useRef(false);
  const publicMenu = isPublicMenuPath(pathname ?? "", typeof window === "undefined" ? "" : window.location.hostname);

  useEffect(() => {
    const standalone = isStandalone();
    const storedState = readStoredInstallState();

    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser display mode and local install preference are only available after mount.
    setInstalled(standalone || storedState === "installed");
    setDismissed(!standalone && storedState === "dismissed");
    setIos(!standalone && storedState !== "installed" && isIos());
    setReady(true);

    const onBeforeInstallPrompt = (event: Event) => {
      captureInstallPrompt(event);
      setDeferredPrompt(capturedInstallPrompt);
    };
    const onInstalled = () => {
      storeInstallState("installed");
      setInstalled(true);
      setDismissed(false);
      setIosHelpOpen(false);
      capturedInstallPrompt = null;
      setDeferredPrompt(null);
    };
    const onReset = () => {
      const standalone = isStandalone();
      clearStoredInstallState();
      setInstalled(standalone || readStoredInstallState() === "installed");
      setDismissed(false);
      setIos(!standalone && isIos());
      if (!standalone && capturedInstallPrompt) setDeferredPrompt(capturedInstallPrompt);
    };
    const syncStandaloneState = () => {
      if (isStandalone()) onInstalled();
    };

    if (capturedInstallPrompt && storedState !== "dismissed" && storedState !== "installed" && !standalone) {
      setDeferredPrompt(capturedInstallPrompt);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(PWA_INSTALL_RESET_EVENT, onReset);
    window.addEventListener("pageshow", syncStandaloneState);
    document.addEventListener("visibilitychange", syncStandaloneState);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(PWA_INSTALL_RESET_EVENT, onReset);
      window.removeEventListener("pageshow", syncStandaloneState);
      document.removeEventListener("visibilitychange", syncStandaloneState);
    };
  }, []);

  function dismiss() {
    storeInstallState("dismissed");
    setDismissed(true);
    setIosHelpOpen(false);
    setDeferredPrompt(null);
  }

  const install = useCallback(async (promptOverride: InstallPromptEvent | null = deferredPrompt) => {
    if (ios && !promptOverride) {
      setIosHelpOpen((current) => !current);
      return;
    }

    const prompt = promptOverride;
    if (!prompt || installingRef.current) return;

    installingRef.current = true;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        storeInstallState("installed");
        setInstalled(true);
      } else {
        storeInstallState("dismissed");
        setDismissed(true);
      }
    } finally {
      if (capturedInstallPrompt === prompt) capturedInstallPrompt = null;
      setDeferredPrompt(null);
      setInstalling(false);
      installingRef.current = false;
    }
  }, [deferredPrompt, ios]);

  useEffect(() => {
    const onInstallRequest = () => {
      if (isStandalone()) return;
      clearStoredInstallState();
      setDismissed(false);
      if (!capturedInstallPrompt && isIos()) {
        setIos(true);
        setIosHelpOpen(true);
        return;
      }
      if (capturedInstallPrompt) {
        setDeferredPrompt(capturedInstallPrompt);
        void install(capturedInstallPrompt);
      }
    };

    window.addEventListener(PWA_INSTALL_REQUEST_EVENT, onInstallRequest);
    return () => window.removeEventListener(PWA_INSTALL_REQUEST_EVENT, onInstallRequest);
  }, [install]);

  if (publicMenu || (typeof window !== "undefined" && window.location.pathname === "/display")) return null;
  if (!ready || installed || dismissed || (!deferredPrompt && !ios)) return null;

  return (
    <aside
      aria-label="Install Dumala POS"
      className="fixed bottom-3 left-3 z-[55] flex max-w-[calc(100vw-1.5rem)] items-center rounded-full border border-line bg-surface/95 p-1 shadow-[var(--shadow-pop)] backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => void install()}
        aria-expanded={ios ? iosHelpOpen : undefined}
        aria-controls={ios ? "ios-install-help" : undefined}
        disabled={installing}
        className="flex min-h-10 items-center gap-2 rounded-full px-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-ink transition hover:bg-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70"
      >
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </span>
        <span className="whitespace-nowrap">{installing ? "Installing…" : "Install Dumala POS"}</span>
      </button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-secondary hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>

      {iosHelpOpen && ios ? (
        <div
          id="ios-install-help"
          role="dialog"
          aria-label="How to install Dumala POS"
          className="absolute bottom-[calc(100%+0.5rem)] left-0 w-[min(19rem,calc(100vw-1.5rem))] rounded-card border border-line bg-surface p-4 text-left shadow-[var(--shadow-pop)]"
        >
          <p className="text-sm font-extrabold text-ink">Add Dumala to your Home Screen</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Tap <strong className="text-ink">Share</strong>, then choose <strong className="text-ink">Add to Home Screen</strong>.
          </p>
        </div>
      ) : null}
    </aside>
  );
}
