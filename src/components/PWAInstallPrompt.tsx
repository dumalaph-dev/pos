"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = isStandalone();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser display mode is only available after mount.
    setInstalled(standalone);
    setIos(!standalone && isIos());

    const onBeforeInstallPrompt = (event: Event) => {
      captureInstallPrompt(event);
      setDeferredPrompt(capturedInstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      capturedInstallPrompt = null;
      setDeferredPrompt(null);
    };

    if (capturedInstallPrompt) setDeferredPrompt(capturedInstallPrompt);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!deferredPrompt && !ios)) return null;

  async function install() {
    const prompt = deferredPrompt;
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      if (capturedInstallPrompt === prompt) capturedInstallPrompt = null;
      setDeferredPrompt(null);
    }
  }

  return (
    <aside
      aria-label="Install Dumala POS"
      className="fixed bottom-4 right-4 z-[55] max-w-[min(24rem,calc(100vw-2rem))] rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-pop)]"
    >
      <p className="text-sm font-bold text-ink">Install Dumala POS</p>
      {deferredPrompt ? (
        <div className="mt-2 flex items-center gap-3">
          <p className="text-xs leading-5 text-ink-muted">Open the POS like an app and keep it ready for offline selling.</p>
          <button type="button" onClick={() => void install()} className="shrink-0 rounded-btn bg-primary px-3 py-2 text-xs font-bold text-primary-fg">
            Install
          </button>
        </div>
      ) : (
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          On iPhone or iPad, tap Share, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </aside>
  );
}
