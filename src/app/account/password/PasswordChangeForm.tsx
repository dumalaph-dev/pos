"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

const initialState: PasswordState = { message: "", success: false };

export function PasswordChangeForm({ displayName, mode = "required" }: { displayName: string; mode?: "required" | "settings" }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState);
  const isSettingsMode = mode === "settings";

  return (
    <form action={formAction} className="w-full max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
      <input type="hidden" name="mode" value={mode} />
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">{isSettingsMode ? "Account security" : "First sign-in setup"}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-ink">{isSettingsMode ? "Change your password" : "Create your password"}</h1>
      <p className="mt-3 text-sm leading-6 text-ink-muted">{isSettingsMode ? `Keep your account secure, ${displayName}. Choose a new private password for POS access.` : `Welcome, ${displayName}. Your temporary password worked. Choose a private password before continuing to the POS.`}</p>

      <label className="mt-6 block text-sm font-medium text-ink" htmlFor="new-password">
        New password
        <input id="new-password" name="password" type="password" minLength={8} required autoComplete="new-password" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
      </label>

      <label className="mt-4 block text-sm font-medium text-ink" htmlFor="password-confirmation">
        Confirm new password
        <input id="password-confirmation" name="password_confirmation" type="password" minLength={8} required autoComplete="new-password" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
      </label>

      {state.message && <p role={state.success ? "status" : "alert"} className={`mt-4 text-sm font-medium ${state.success ? "text-success" : "text-danger"}`}>{state.message}</p>}

      <button type="submit" disabled={pending} className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50">{pending ? "Saving..." : isSettingsMode ? "Update password" : "Save password"}</button>
    </form>
  );
}
