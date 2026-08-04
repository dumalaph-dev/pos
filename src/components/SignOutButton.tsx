"use client";

import { signOut } from "@/app/actions";
import { clearOfflineCaches } from "@/lib/offline-cache";

/**
 * Client component so the app-shell caches are wiped *before* the session ends
 * — Cache Storage is origin-scoped, survives sign-out, and this is a shared
 * terminal. `signOut` redirects to "/?signed-out=1" as a backstop for the
 * sign-outs that never run this handler (see src/app/page.tsx).
 */
export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form
      action={async () => {
        await clearOfflineCaches();
        await signOut();
      }}
    >
      <button
        type="submit"
        className={`rounded-btn bg-secondary px-4 py-2 text-sm font-bold uppercase text-primary ${className}`}
      >
        Sign out
      </button>
    </form>
  );
}
