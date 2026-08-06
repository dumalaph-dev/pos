"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError || !data.user) {
      setError("Email or password is incorrect.");
      setLoading(false);
      return;
    }

    router.replace("/platform");
    router.refresh();
  }

  return (
    <main className="min-h-full flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Dumala POS</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Platform console</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">Private monitoring for the POS platform operator.</p>
        <form onSubmit={onSubmit} className="mt-6">
          <label className="block text-sm font-medium text-ink" htmlFor="platform-email">
            Email
            <input id="platform-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
          </label>
          <label className="mt-4 block text-sm font-medium text-ink" htmlFor="platform-password">
            Password
            <input id="platform-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary" />
          </label>
          {error && <p role="alert" className="mt-4 text-sm font-medium text-danger">{error}</p>}
          <button type="submit" disabled={loading} className="mt-6 w-full rounded-btn bg-primary px-6 py-3 font-bold uppercase text-primary-fg disabled:opacity-50">{loading ? "Signing in…" : "Open platform console"}</button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-ink-muted">Access is restricted to the server-side platform administrator allowlist.</p>
      </div>
    </main>
  );
}
