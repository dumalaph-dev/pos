"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#playground", label: "Try the POS" },
  { href: "#workspace", label: "Workspace" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="lp-arrow h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 10h13M11 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // The blur is a Tailwind utility rather than part of .lp-header: Lightning CSS
  // strips a raw `backdrop-filter` declaration out of globals.css.
  return (
    <header
      className="lp-header sticky top-0 z-50 data-[scrolled=true]:backdrop-blur-xl data-[scrolled=true]:backdrop-saturate-150"
      data-scrolled={scrolled}
    >
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-5 py-3.5 sm:px-10 lg:px-16 lg:py-4">
        <Link
          href="/"
          aria-label="Dumala POS home"
          className="lp-logo shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#173a2b]"
        >
          <Image
            src="/brand-lockup.png"
            alt="Dumala POS"
            width={1535}
            height={451}
            priority
            sizes="(min-width: 1024px) 186px, 152px"
            className="h-[45px] w-auto lg:h-[55px]"
          />
        </Link>

        <nav className="hidden items-center gap-9 text-sm font-semibold text-[#20372c] lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="lp-navlink hover:text-[#b18448] focus-visible:outline-none">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-[#173a2b] transition hover:bg-[#ece8de] sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="lp-btn inline-flex items-center gap-2.5 rounded-xl bg-[#15382a] px-4 py-2.5 text-[13px] font-bold text-[#fffaf1] shadow-[0_10px_22px_rgba(21,56,42,0.18)] hover:bg-[#0e2a20] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bc9657] sm:px-5 sm:py-3 sm:text-sm"
          >
            Start free <ArrowIcon />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="lp-burger grid h-10 w-10 shrink-0 place-items-center gap-[5px] rounded-xl border border-[#ddd8cc] bg-[#fbf8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173a2b] lg:hidden"
            data-open={menuOpen}
            aria-expanded={menuOpen}
            aria-controls="lp-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <span className="h-[2px] w-4 rounded-full bg-[#173a2b]" />
            <span className="h-[2px] w-4 rounded-full bg-[#173a2b]" />
            <span className="h-[2px] w-4 rounded-full bg-[#173a2b]" />
          </button>
        </div>
      </div>

      <div id="lp-mobile-menu" className="lp-menu lg:hidden" data-open={menuOpen}>
        <div>
          <nav
            className="mx-5 mb-3 grid gap-1 rounded-2xl border border-[#ddd8cc] bg-[#fbf8f1]/95 p-2 shadow-[0_18px_40px_rgba(16,45,33,0.10)] backdrop-blur sm:mx-10"
            aria-label="Mobile"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3.5 py-3 text-sm font-semibold text-[#20372c] transition hover:bg-[#ece8de] hover:text-[#173a2b]"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-3.5 py-3 text-sm font-bold text-[#173a2b] transition hover:bg-[#ece8de] sm:hidden"
            >
              Log in
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
