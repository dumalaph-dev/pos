"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Split out of `page.tsx` so the route can stay a Server Component and export
 * `metadata` — a `"use client"` module cannot. Only the interactive form lives
 * here; the surrounding card copy stays server-rendered.
 */
export default function PlatformLoginForm() {
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
  );
}
