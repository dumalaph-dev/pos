"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!deferredPrompt && !ios)) return null;

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
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
