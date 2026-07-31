"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Route by role (cashiers → POS, admins/managers → backoffice).
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    router.replace(profile?.role === "cashier" ? "/pos" : "/admin");
  }

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Lechon POS
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">Sign in</h1>

        <label className="mt-6 block text-sm font-medium text-ink">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-ink">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none focus:border-primary"
          />
        </label>

        {error && (
          <p className="mt-4 text-sm font-medium text-danger">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-btn bg-accent px-6 py-3 font-bold uppercase text-accent-fg disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
