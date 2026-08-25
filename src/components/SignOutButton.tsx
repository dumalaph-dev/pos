"use client";

import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { signOut, type SignOutDestination } from "@/app/actions";
import { clearOfflineCaches } from "@/lib/offline-cache";
import { clearOfflineSession } from "@/lib/offline";
import { clearAdminLocalFirstCache } from "@/lib/admin/local-first-store";

/* Kept as utilities rather than a CSS class: most of globals.css is unlayered
   and would outrank Tailwind's utilities layer, so a class here would silently
   beat the `text-[10px]` overrides the topbars pass in.

   Padding is deliberately absent. Tailwind orders utilities within a family by
   value, not by the order they appear in the class attribute, so a default
   `px-4` here would outrank the smaller `px-2`/`px-3` callers pass in and the
   override would silently do nothing. Every call site supplies its own padding,
   or carries a component class that sets it. */
const BUTTON_BASE =
  "rounded-btn bg-secondary text-sm font-bold uppercase text-primary " +
  "transition duration-150 hover:bg-secondary-hover hover:text-primary-hover " +
  "active:scale-[0.97] active:bg-secondary-hover " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const MENU_BASE = "admin-menu__item admin-menu__item--danger";

/**
 * Sign out ends a network round trip, so the button reports it: hover, a
 * pressed state, a visible focus ring, and a pending label while the action
 * runs. Without those it reads as dead on the first click.
 *
 * `useFormStatus` only reports the surrounding form's state from a child
 * component, hence the split.
 */
function SignOutSubmit({ className, variant }: { className: string; variant: "button" | "menu" }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${variant === "menu" ? MENU_BASE : BUTTON_BASE} ${className}`}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

/**
 * Client component so the app-shell caches are wiped *before* the session ends
 * — Cache Storage is origin-scoped, survives sign-out, and this is a shared
 * terminal. The server action returns the intended internal destination so
 * the expected sign-out navigation is not mistaken for a failed action.
 */
export function SignOutButton({
  className = "",
  variant = "button",
  destination = "login",
  fallbackHref,
}: {
  className?: string;
  variant?: "button" | "menu";
  destination?: SignOutDestination;
  fallbackHref?: string;
}) {
  const router = useRouter();
  const safeFallbackHref = fallbackHref && fallbackHref.startsWith("/") && !fallbackHref.startsWith("//")
    ? fallbackHref
    : "/login?signed-out=1";

  return (
    <form
      // `contents` keeps the form out of the layout so the button participates
      // in the menu's own stack directly.
      className={variant === "menu" ? "contents" : undefined}
      action={async () => {
        try {
          await clearOfflineSession();
          await clearAdminLocalFirstCache();
          await clearOfflineCaches();
        } catch {
          // Cache cleanup is best effort. It must never prevent the auth
          // session from being ended on a shared terminal.
        }
        try {
          const result = await signOut(destination);
          router.replace(result.redirectPath);
        } catch {
          // A cashier must be able to leave a shared terminal while offline;
          // the local session/cache wipe above is the important boundary.
          router.replace(safeFallbackHref);
        }
      }}
    >
      <SignOutSubmit className={className} variant={variant} />
    </form>
  );
}
