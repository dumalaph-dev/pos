"use client";

import Link from "next/link";
import { useActionState } from "react";
import { INITIAL_SIGNUP_STATE, signupStoreOwner, type SignupField, type SignupState } from "./actions";

function FieldError({ state, field }: { state: SignupState; field: SignupField }) {
  const message = state.errors?.[field];
  return message ? <span className="mt-1 block text-xs font-semibold text-danger">{message}</span> : null;
}

function fieldClass(hasError: boolean) {
  return `mt-1 w-full rounded-btn border bg-raised px-4 py-3 text-ink outline-none transition focus:border-primary ${hasError ? "border-danger" : "border-line-strong"}`;
}

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signupStoreOwner, INITIAL_SIGNUP_STATE);

  if (state.ok && state.needsConfirmation) {
    return (
      <div className="rounded-card border border-success/25 bg-success/10 p-5" role="status" aria-live="polite">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-success">Almost there</p>
        <h2 className="mt-2 text-xl font-extrabold text-ink">Confirm your email</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{state.message}</p>
        <Link href="/login" className="mt-5 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Owner details</p>
        <h2 id="signup-heading" className="mt-1 text-lg font-extrabold text-ink">Create your POS workspace</h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">Your registration includes a private organization, first branch, and admin access.</p>
      </div>

      {state.message && <p role="alert" className="rounded-btn border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{state.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink sm:col-span-2" htmlFor="signup-full-name">
          Your name
          <input id="signup-full-name" name="full_name" type="text" required minLength={2} maxLength={120} autoComplete="name" placeholder="Juan Dela Cruz" className={fieldClass(Boolean(state.errors?.full_name))} />
          <FieldError state={state} field="full_name" />
        </label>

        <label className="block text-sm font-medium text-ink sm:col-span-2" htmlFor="signup-organization-name">
          Business name
          <input id="signup-organization-name" name="organization_name" type="text" required minLength={2} maxLength={120} autoComplete="organization" placeholder="e.g. Juan's Kitchen" className={fieldClass(Boolean(state.errors?.organization_name))} />
          <FieldError state={state} field="organization_name" />
        </label>

        <label className="block text-sm font-medium text-ink" htmlFor="signup-store-name">
          First branch
          <input id="signup-store-name" name="store_name" type="text" required minLength={2} maxLength={120} placeholder="Main Branch" className={fieldClass(Boolean(state.errors?.store_name))} />
          <FieldError state={state} field="store_name" />
        </label>

        <label className="block text-sm font-medium text-ink" htmlFor="signup-store-address">
          Branch address <span className="font-normal text-ink-muted">(optional)</span>
          <input id="signup-store-address" name="store_address" type="text" maxLength={240} autoComplete="street-address" placeholder="Street, barangay, city" className={fieldClass(Boolean(state.errors?.store_address))} />
          <FieldError state={state} field="store_address" />
        </label>

        <label className="block text-sm font-medium text-ink sm:col-span-2" htmlFor="signup-email">
          Email
          <input id="signup-email" name="email" type="email" required autoComplete="email" placeholder="you@business.com" className={fieldClass(Boolean(state.errors?.email))} />
          <FieldError state={state} field="email" />
        </label>

        <label className="block text-sm font-medium text-ink" htmlFor="signup-password">
          Password
          <input id="signup-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={fieldClass(Boolean(state.errors?.password))} />
          <span className="mt-1 block text-xs text-ink-muted">At least 8 characters, with a letter and a number.</span>
          <FieldError state={state} field="password" />
        </label>

        <label className="block text-sm font-medium text-ink" htmlFor="signup-password-confirmation">
          Confirm password
          <input id="signup-password-confirmation" name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className={fieldClass(Boolean(state.errors?.password_confirmation))} />
          <FieldError state={state} field="password_confirmation" />
        </label>
      </div>

      <button type="submit" disabled={pending} className="w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Creating workspace…" : "Create owner account"}</button>
      <p className="text-center text-sm text-ink-muted">Already have an account? <Link href="/login" className="font-extrabold text-primary underline-offset-4 hover:underline">Sign in</Link></p>
    </form>
  );
}
