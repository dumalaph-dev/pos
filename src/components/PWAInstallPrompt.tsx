"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isPublicMenuPath } from "@/lib/public-menu-route";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type StoredInstallState = "installed" | "dismissed" | null;

/**
 * Which set of manual instructions to show when the browser will not hand us a
 * one-tap install. `beforeinstallprompt` is Chromium-only, so every other
 * engine — and Chromium itself once the prompt has been consumed for this page
 * load — needs the platform's own menu path spelled out instead of a dead end.
 */
export type InstallPlatform =
  | "ios"
  | "android-chromium"
  | "android-firefox"
  | "desktop-chromium"
  | "desktop-safari"
  | "desktop-firefox"
  | "unknown";

const INSTALL_STATE_KEY = "dumala:pwa-install-state";
const DISMISSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PWA_INSTALL_RESET_EVENT = "dumala:pwa-install-reset";
const PWA_INSTALL_REQUEST_EVENT = "dumala:pwa-install-request";
const PWA_INSTALL_PROMPT_EVENT = "dumala:pwa-install-prompt-changed";

// `beforeinstallprompt` can be dispatched before React hydrates the root
// layout. Keep the event at module scope so the prompt is not lost during the
// initial document load, while the component listener below still handles
// browsers that dispatch it later.
let capturedInstallPrompt: InstallPromptEvent | null = null;

function announceInstallPromptChange() {
  window.dispatchEvent(new Event(PWA_INSTALL_PROMPT_EVENT));
}

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

/**
 * User-agent sniffing is the wrong tool for feature detection, but install
 * flows are genuinely per-browser UI: there is no API that reports "this
 * browser installs apps from the address bar". The result only chooses which
 * instructions to render, so a wrong guess degrades to slightly-off wording
 * rather than a broken control.
 */
export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "unknown";
  const agent = navigator.userAgent;
  const android = /android/i.test(agent);

  if (isIos()) return "ios";
  if (android) return /firefox|fxios/i.test(agent) ? "android-firefox" : "android-chromium";
  if (/firefox/i.test(agent)) return "desktop-firefox";
  // Chrome, Edge, Brave, Opera and Arc all report "Chrome"; Safari does not.
  if (/chrome|chromium|crios|edg\//i.test(agent)) return "desktop-chromium";
  if (/safari/i.test(agent)) return "desktop-safari";
  return "unknown";
}

type InstallInstructions = {
  title: string;
  steps: string[];
  note?: string;
};

export const INSTALL_INSTRUCTIONS: Record<InstallPlatform, InstallInstructions> = {
  ios: {
    title: "Add Dumala to your Home Screen",
    steps: [
      "Open this page in Safari — other iPhone and iPad browsers cannot install it.",
      "Tap the Share button (the square with an arrow pointing up).",
      "Scroll down and tap “Add to Home Screen”, then tap “Add”.",
    ],
    note: "The Dumala icon then opens the POS full screen, without the browser bars.",
  },
  "android-chromium": {
    title: "Install Dumala on this tablet",
    steps: [
      "Tap the ⋮ menu at the top right of Chrome.",
      "Tap “Add to Home screen” or “Install app”.",
      "Confirm with “Install”.",
    ],
    note: "On a shared counter tablet, install once and leave the icon on the home screen for every cashier.",
  },
  "android-firefox": {
    title: "Install Dumala on this tablet",
    steps: [
      "Tap the ⋮ menu at the top right of Firefox.",
      "Tap “Install” or “Add to Home screen”.",
      "Confirm with “Add”.",
    ],
    note: "Chrome gives the most reliable install and offline behaviour on Android counter tablets.",
  },
  "desktop-chromium": {
    title: "Install Dumala on this computer",
    steps: [
      "Look for the install icon (a screen with a down arrow) at the right of the address bar and click it.",
      "No icon? Open the ⋮ or ••• browser menu, then choose “Cast, save and share” → “Install page as app”, or “Apps” → “Install this site as an app”.",
      "Confirm with “Install”.",
    ],
    note: "The install icon only appears on a secure (https) address and disappears once Dumala is already installed.",
  },
  "desktop-safari": {
    title: "Add Dumala to your Dock",
    steps: [
      "Open the File menu in Safari.",
      "Choose “Add to Dock”.",
      "Confirm the name, then choose “Add”.",
    ],
    note: "This needs macOS Sonoma or later. On older macOS, use Chrome or Edge to install Dumala.",
  },
  "desktop-firefox": {
    title: "Firefox cannot install web apps on desktop",
    steps: [
      "Open Dumala in Chrome, Edge or another Chromium browser to install it.",
      "In that browser, click the install icon at the right of the address bar.",
      "Confirm with “Install”.",
    ],
    note: "Dumala still works normally in Firefox — you only lose the standalone window and the home-screen icon.",
  },
  unknown: {
    title: "Install Dumala on this device",
    steps: [
      "Open your browser menu and look for “Install app”, “Install page as app” or “Add to Home screen”.",
      "Confirm the install.",
      "If you cannot find it, open Dumala in Chrome, Edge or Safari and try again.",
    ],
    note: "Installing needs a secure (https) address and a browser that supports web apps.",
  },
};

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

/**
 * Clears every stored state, including `installed`.
 *
 * An earlier version deliberately kept `installed`, which made the Settings
 * recovery control a no-op for exactly the people who needed it: uninstall the
 * app, or accept the prompt on a device that is later re-imaged, and the flag
 * survives with no way to clear it from the UI. `isStandalone()` is re-read on
 * every mount, so a genuinely installed app is still detected without this
 * flag — it is a convenience, not the source of truth.
 */
function clearStoredInstallState() {
  try {
    window.localStorage.removeItem(INSTALL_STATE_KEY);
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

/**
 * Runs the native install flow when Chromium gave us a prompt for this page
 * load. Resolves to the outcome so callers can decide whether to fall back to
 * the manual instructions: a consumed or missing prompt returns "unavailable".
 */
async function runNativeInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const prompt = capturedInstallPrompt;
  if (!prompt) return "unavailable";

  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") storeInstallState("installed");
    return choice.outcome;
  } catch {
    return "unavailable";
  } finally {
    // Chromium never re-dispatches `beforeinstallprompt` for a prompt that was
    // already shown, so dropping it here keeps the UI honest: the next click
    // gets the manual instructions rather than silently doing nothing.
    capturedInstallPrompt = null;
    announceInstallPromptChange();
  }
}

type InstallState = {
  ready: boolean;
  standalone: boolean;
  installed: boolean;
  dismissed: boolean;
  hasNativePrompt: boolean;
  platform: InstallPlatform;
};

const INITIAL_STATE: InstallState = {
  ready: false,
  standalone: false,
  installed: false,
  dismissed: false,
  hasNativePrompt: false,
  platform: "unknown",
};

/**
 * Single source of truth for "can this device still install Dumala, and does
 * the browser offer a one-tap install?". Both the floating pill and the
 * in-page buttons read it so they can never disagree.
 */
function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(INITIAL_STATE);

  useEffect(() => {
    const sync = () => {
      const standalone = isStandalone();
      const stored = readStoredInstallState();
      const next: InstallState = {
        ready: true,
        standalone,
        installed: standalone || stored === "installed",
        dismissed: !standalone && stored === "dismissed",
        hasNativePrompt: !standalone && Boolean(capturedInstallPrompt),
        platform: detectInstallPlatform(),
      };
      // `sync` also runs on every visibility change, which on a POS tablet is
      // often. Returning the previous object when nothing moved keeps those
      // from re-rendering the layout.
      setState((current) => (
        current.ready === next.ready
        && current.standalone === next.standalone
        && current.installed === next.installed
        && current.dismissed === next.dismissed
        && current.hasNativePrompt === next.hasNativePrompt
        && current.platform === next.platform
          ? current
          : next
      ));
    };

    // Display mode, user agent and the stored preference are only readable
    // after mount, so the first render is deliberately the "not ready" state.
    sync();

    const onBeforeInstallPrompt = (event: Event) => {
      captureInstallPrompt(event);
      sync();
    };
    const onInstalled = () => {
      storeInstallState("installed");
      capturedInstallPrompt = null;
      sync();
    };
    const onReset = () => {
      clearStoredInstallState();
      sync();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(PWA_INSTALL_RESET_EVENT, onReset);
    window.addEventListener(PWA_INSTALL_PROMPT_EVENT, sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(PWA_INSTALL_RESET_EVENT, onReset);
      window.removeEventListener(PWA_INSTALL_PROMPT_EVENT, sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return state;
}

function InstallHelpDialog({ platform, onClose }: { platform: InstallPlatform; onClose: () => void }) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const content = INSTALL_INSTRUCTIONS[platform];

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // This dialog can open on top of another one (the owner setup guide
        // renders an install button inside its own modal). Stopping here in the
        // capture phase means the topmost dialog handles the key and the one
        // underneath stays open.
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      event.stopPropagation();

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
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

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-[min(28rem,100%)] rounded-card border border-line bg-surface p-5 text-left shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">Dumala app</p>
            <h2 id={headingId} className="mt-1 text-base font-extrabold tracking-[-0.03em] text-ink">{content.title}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-secondary hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span aria-hidden="true" className="text-lg leading-none">{"×"}</span>
          </button>
        </div>

        <ol className="mt-4 grid gap-2.5">
          {content.steps.map((step, index) => (
            <li key={step} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-extrabold text-primary-fg">{index + 1}</span>
              <span className="text-xs leading-5 text-ink">{step}</span>
            </li>
          ))}
        </ol>

        {content.note && <p className="mt-4 rounded-btn bg-secondary px-3 py-2.5 text-[11px] leading-5 text-ink-muted">{content.note}</p>}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-10 w-full rounded-btn bg-primary text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/**
 * An install control that is always actionable while the app is not installed.
 *
 * The previous version rendered nothing unless Chromium had already handed us
 * a `beforeinstallprompt`, so the button silently vanished on Firefox, desktop
 * Safari, any page load where the prompt had already been consumed, and every
 * development build (no service worker means no install criteria). Falling back
 * to the platform's own instructions keeps the control present and useful.
 */
export function PWAInstallButton({
  className,
  children = "Install Dumala App",
  hideWhenInstalled = true,
}: {
  className: string;
  children?: ReactNode;
  hideWhenInstalled?: boolean;
}) {
  const { ready, installed, hasNativePrompt, platform } = useInstallState();
  const [helpOpen, setHelpOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const onClick = useCallback(async () => {
    if (!hasNativePrompt) {
      setHelpOpen(true);
      return;
    }
    setInstalling(true);
    try {
      const outcome = await runNativeInstall();
      if (outcome === "unavailable") setHelpOpen(true);
    } finally {
      setInstalling(false);
    }
  }, [hasNativePrompt]);

  if (!ready) return null;
  if (installed && hideWhenInstalled) return null;

  return (
    <>
      <button type="button" className={className} onClick={() => void onClick()} disabled={installing} data-pwa-install-action>
        {installing ? "Installing…" : children}
      </button>
      {helpOpen && <InstallHelpDialog platform={platform} onClose={() => setHelpOpen(false)} />}
    </>
  );
}

export default function PWAInstallPrompt() {
  const pathname = usePathname();
  const { ready, standalone, installed, dismissed, hasNativePrompt, platform } = useInstallState();
  const [locallyDismissed, setLocallyDismissed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const publicMenu = isPublicMenuPath(pathname ?? "", typeof window === "undefined" ? "" : window.location.hostname);

  const install = useCallback(async () => {
    if (!hasNativePrompt) {
      setHelpOpen(true);
      return;
    }
    setInstalling(true);
    try {
      const outcome = await runNativeInstall();
      if (outcome === "unavailable") setHelpOpen(true);
      if (outcome === "dismissed") {
        storeInstallState("dismissed");
        setLocallyDismissed(true);
      }
    } finally {
      setInstalling(false);
    }
  }, [hasNativePrompt]);

  useEffect(() => {
    const onInstallRequest = () => {
      if (isStandalone()) return;
      clearStoredInstallState();
      setLocallyDismissed(false);
      void install();
    };

    window.addEventListener(PWA_INSTALL_REQUEST_EVENT, onInstallRequest);
    return () => window.removeEventListener(PWA_INSTALL_REQUEST_EVENT, onInstallRequest);
  }, [install]);

  useEffect(() => {
    const onReset = () => setLocallyDismissed(false);
    window.addEventListener(PWA_INSTALL_RESET_EVENT, onReset);
    return () => window.removeEventListener(PWA_INSTALL_RESET_EVENT, onReset);
  }, []);

  function dismiss() {
    storeInstallState("dismissed");
    setLocallyDismissed(true);
    setHelpOpen(false);
  }

  if (publicMenu || (typeof window !== "undefined" && window.location.pathname === "/display")) return null;
  if (!ready || standalone || installed) return null;

  // The unprompted pill still waits for a real install signal — a native
  // prompt, or iOS where there is never going to be one. Other browsers get
  // the always-available button in the setup guide, Help & Guide and Settings
  // instead of a banner they cannot act on in one tap.
  const pillVisible = !dismissed && !locallyDismissed && (hasNativePrompt || platform === "ios");

  return (
    <>
      {pillVisible && (
        <aside
          aria-label="Install Dumala POS"
          className="fixed bottom-3 left-3 z-[55] flex max-w-[calc(100vw-1.5rem)] items-center rounded-full border border-line bg-surface/95 p-1 shadow-[var(--shadow-pop)] backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => void install()}
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
        </aside>
      )}

      {helpOpen && <InstallHelpDialog platform={platform} onClose={() => setHelpOpen(false)} />}
    </>
  );
}
