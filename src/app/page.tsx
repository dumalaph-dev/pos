"use client";

import { useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { loginWithEmployeeId, type LoginState } from "./actions";
import { createClient } from "@/lib/supabase/client";

type LoginMode = "employee" | "email";

const initialEmployeeLoginState: LoginState = { message: "" };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("employee");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [employeeState, employeeAction, employeePending] = useActionState(loginWithEmployeeId, initialEmployeeLoginState);

  async function onEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setEmailError(null);
    setEmailLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: emailPassword,
    });
    if (error || !data.user) {
      setEmailError(error?.message || "Email or password is incorrect.");
      setEmailLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, password_change_required")
      .eq("id", data.user.id)
      .single();
    if (profileError || !profile) {
      await supabase.auth.signOut();
      setEmailError("Your employee profile is not ready. Ask an administrator for help.");
      setEmailLoading(false);
      return;
    }

    if (profile.password_change_required) {
      router.replace("/account/password?required=1");
      return;
    }
    router.replace(profile.role === "cashier" ? "/pos" : "/admin");
  }

  function selectMode(nextMode: LoginMode) {
    setMode(nextMode);
    setEmailError(null);
  }

  return (
    <main className="min-h-full flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Lechon POS</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Use your employee ID for POS access, or use email for an administrator account.</p>

        <div className="mt-6 grid grid-cols-2 rounded-btn bg-raised p-1" role="tablist" aria-label="Sign-in method">
          <button type="button" role="tab" aria-selected={mode === "employee"} onClick={() => selectMode("employee")} className={`rounded-[10px] px-3 py-2 text-xs font-extrabold transition ${mode === "employee" ? "bg-primary text-primary-fg shadow-sm" : "text-ink-muted hover:text-ink"}`}>Employee ID</button>
          <button type="button" role="tab" aria-selected={mode === "email"} onClick={() => selectMode("email")} className={`rounded-[10px] px-3 py-2 text-xs font-extrabold transition ${mode === "email" ? "bg-primary text-primary-fg shadow-sm" : "text-ink-muted hover:text-ink"}`}>Email</button>
        </div>

        {mode === "employee" ? (
          <form action={employeeAction} className="mt-6">
            <label className="block text-sm font-medium text-ink" htmlFor="employee-code">
              Employee ID
              <input id="employee-code" name="employee_code" type="text" required autoCapitalize="characters" autoComplete="username" placeholder="EMP-0001" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 uppercase text-ink outline-none focus:border-primary" />
            </label>

            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="employee-password">
              Password
              <input id="employee-password" name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
            </label>

            <p className="mt-3 text-xs leading-5 text-ink-muted">First time here? Use the common initial password from your administrator. You will be asked to create a private password after signing in.</p>
            {employeeState.message && <p role="alert" className="mt-4 text-sm font-medium text-danger">{employeeState.message}</p>}

            <button type="submit" disabled={employeePending} className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50">{employeePending ? "Signing in…" : "Sign in to POS"}</button>
          </form>
        ) : (
          <form onSubmit={onEmailSubmit} className="mt-6">
            <label className="block text-sm font-medium text-ink" htmlFor="email">
              Email
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
            </label>

            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="email-password">
              Password
              <input id="email-password" type="password" required autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
            </label>

            {emailError && <p role="alert" className="mt-4 text-sm font-medium text-danger">{emailError}</p>}
            <button type="submit" disabled={emailLoading} className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50">{emailLoading ? "Signing in…" : "Sign in"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
