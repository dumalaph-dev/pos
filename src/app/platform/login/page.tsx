import type { Metadata } from "next";
import PlatformLoginForm from "./PlatformLoginForm";

// The internal operator console. It answers 200 to anyone, so it needs the
// directive on top of the robots.ts disallow; the public footer link into it
// was removed in the same change.
export const metadata: Metadata = {
  title: "Platform console",
  robots: { index: false, follow: false },
};

export default function PlatformLoginPage() {
  return (
    <main className="min-h-full flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Dumala POS</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Platform console</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Private monitoring for the POS platform operator.</p>
        <PlatformLoginForm />
        <p className="mt-6 text-center text-xs leading-5 text-ink-muted">Access is restricted to the server-side platform administrator allowlist.</p>
      </div>
    </main>
  );
}
