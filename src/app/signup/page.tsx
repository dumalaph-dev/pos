import type { Metadata } from "next";
import Link from "next/link";
import { PREMIUM_PRICE_LABEL } from "@/lib/billing";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Create your POS workspace | Dumala POS",
  description: "Register a private POS workspace for your store.",
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10 text-ink sm:py-16">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <section className="rounded-card bg-primary p-7 text-primary-fg shadow-[var(--shadow-pop)] sm:p-9">
          <Link href="/" className="text-sm font-semibold uppercase tracking-wide text-primary-fg/75 hover:text-primary-fg">Dumala POS</Link>
          <p className="mt-14 text-xs font-extrabold uppercase tracking-[0.16em] text-primary-fg/65">For store owners</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">Run your counter with a workspace built for your business.</h1>
          <p className="mt-4 text-sm leading-6 text-primary-fg/75">Start with your business identity and first branch. Add products, inventory, staff, and devices from the admin backoffice whenever you are ready.</p>
          <ul className="mt-8 space-y-4 text-sm text-primary-fg/85">
            <li className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-fg/15 text-xs">✓</span><span>Private organization data for your business</span></li>
            <li className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-fg/15 text-xs">✓</span><span>Admin access for setup and daily monitoring</span></li>
            <li className="flex gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-fg/15 text-xs">✓</span><span>Branch-ready POS and employee access</span></li>
          </ul>
          <div className="mt-8 rounded-card border border-primary-fg/15 bg-primary-fg/10 p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-fg/65">Premium workspace</p>
            <p className="mt-2 text-2xl font-extrabold">14 days free</p>
            <p className="mt-1 text-sm leading-6 text-primary-fg/75">Then {PREMIUM_PRICE_LABEL}/month for every branch, staff member, and feature. No card required to start.</p>
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-9" aria-labelledby="signup-heading">
          <SignupForm />
        </section>
      </div>
    </main>
  );
}
