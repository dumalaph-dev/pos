"use client";

import { useActionState } from "react";
import { loginWithEmployeeId, type LoginState } from "@/app/actions";

const initialState: LoginState = { message: "" };

export default function StaffLoginForm({ storeKey }: { storeKey: string }) {
  const [state, action, pending] = useActionState(loginWithEmployeeId, initialState);

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="store_key" value={storeKey} />
      <label className="block text-sm font-medium text-ink" htmlFor="employee-code">
        Employee ID
        <input id="employee-code" name="employee_code" type="text" required autoCapitalize="characters" autoComplete="username" placeholder="EMP-0001" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 uppercase text-ink outline-none focus:border-primary" />
      </label>

      <label className="mt-4 block text-sm font-medium text-ink" htmlFor="employee-password">
        Password
        <input id="employee-password" name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
      </label>

      <p className="mt-3 text-xs leading-5 text-ink-muted">First time here? Use the temporary password from your owner, then create a private password.</p>
      {state.message && <p role="alert" className="mt-4 text-sm font-medium text-danger">{state.message}</p>}

      <button type="submit" disabled={pending} className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50">{pending ? "Signing in…" : "Sign in to store"}</button>
    </form>
  );
}
