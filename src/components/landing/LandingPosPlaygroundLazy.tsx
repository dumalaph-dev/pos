"use client";

import dynamic from "next/dynamic";

/**
 * Defers the POS playground off the landing page's critical path.
 *
 * The playground carries `PosSettingsScreen.css` — 197 KB of preview and theme
 * styling that nothing else on the marketing page uses — and it renders roughly
 * 2.5 viewports below the fold. Loading it eagerly meant every visitor paid for
 * an interactive demo before seeing the hero.
 *
 * This wrapper exists rather than calling `dynamic()` in `page.tsx` because the
 * Next lazy-loading guide is explicit on two points: code splitting does not
 * apply when a Server Component dynamically imports a Client Component, and
 * `ssr: false` is only honoured inside a Client Component. `page.tsx` is an
 * async Server Component, so the boundary has to live here.
 *
 * The placeholder reserves the playground's measured height — 859px at a 1280
 * viewport, 982px at 375 — so deferring it does not trade a payload win for a
 * layout shift.
 */
const LandingPosPlayground = dynamic(() => import("./LandingPosPlayground"), {
  ssr: false,
  loading: () => <div className="lp-playground-placeholder" aria-hidden="true" />,
});

export default function LandingPosPlaygroundLazy() {
  return <LandingPosPlayground />;
}
