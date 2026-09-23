# SEO & AEO Growth Plan

**Project:** Dumala POS — public site `https://www.dumala.store`
**Created:** 2026-09-23
**Owner:** Product, engineering, and content
**Goal:** Grow qualified organic traffic and trial signups from search engines (SEO) and AI answer engines — ChatGPT search, Google AI Overviews, Perplexity, Copilot, Claude (AEO).
**Companion to:** [Platform console plan — Track J](PLATFORM_CONSOLE_EXPANSION_PLAN.md#12-track-j--public-website-and-growth-management), [ARCHITECTURE.md](ARCHITECTURE.md), [tasks.md](tasks.md)

**How to use this document:** The tracker below is the single source of progress. When an item ships, tick it in its phase section *and* update the phase's count and status in the tracker. Record anything that changes scope in the [Decision log](#decision-log).

---

## Progress tracker

**Last updated:** 2026-09-23 · **Overall:** 5 / 72 items done

| Phase | Theme | Status | Done | Depends on |
|---|---|---|---|---|
| [0](#phase-0--foundations-and-measurement) | Foundations and measurement | 🟡 In progress | 4 / 10 | — |
| [1](#phase-1--technical-seo-hardening) | Technical SEO hardening | 🟡 In progress | 1 / 9 | 0 |
| [2](#phase-2--content-platform) | Content platform (guides, pages, sitemap) | ⚪ Not started | 0 / 10 | 0 |
| [3](#phase-3--commercial-landing-pages) | Commercial landing pages | ⚪ Not started | 0 / 11 | 2 |
| [4](#phase-4--editorial-guides-and-aeo) | Editorial guides and AEO | ⚪ Not started | 0 / 11 | 2 |
| [5](#phase-5--authority-and-off-site-presence) | Authority and off-site presence | ⚪ Not started | 0 / 9 | 3 (partial) |
| [6](#phase-6--performance-and-core-web-vitals) | Performance and Core Web Vitals | ⚪ Not started | 0 / 6 | 0 |
| [7](#phase-7--scale-measure-and-refresh) | Scale, measure, and refresh | ⚪ Not started | 0 / 6 | 3, 4 |

Status key: ⚪ Not started · 🟡 In progress · 🟢 Done · 🔴 Blocked

### KPI scorecard

Fill the baseline in Phase 0 (items 0.3–0.5) and update each month in Phase 7 (item 7.1). "Unknown" means there is no measurement yet, not zero.

| KPI | Source | Baseline (month 0) | 3-month target | 6-month target | Latest |
|---|---|---|---|---|---|
| Indexed pages | Search Console → Pages | Unknown | 30+ | 60+ | — |
| Organic clicks / month | Search Console | Unknown | Baseline × 3 | Baseline × 8 | — |
| Non-brand clicks share | Search Console (queries without "dumala") | Unknown | 30% | 50% | — |
| Keywords in top 10 | Search Console avg. position ≤ 10 | Unknown | 25 | 75 | — |
| AI-assistant referrals / month | Analytics referrers (chatgpt.com, perplexity.ai, copilot, gemini) | Unknown | Tracked | Growing month on month | — |
| AI answer mentions | Manual prompt panel (item 4.10) | Unknown | Named in 3 / 20 prompts | Named in 8 / 20 prompts | — |
| Organic → trial signups / month | Signup attribution (item 0.6) | Unknown | Tracked | Baseline × 4 | — |
| Referring domains | Search Console → Links / Bing | Unknown | +15 | +40 | — |
| Home LCP (p75, mobile) | CrUX / PageSpeed | Unknown | < 2.5 s | < 2.0 s | — |

The targets are planning assumptions for a site starting from about three content pages. Reset them once the Phase 0 baseline exists.

---

## 1. Where we are today (verified 2026-09-23)

Checked against local source and live responses from `https://www.dumala.store`.

### Already in good shape

- Per-page `title`, `description`, canonical, and Open Graph / Twitter cards through [`socialMetadata`](../src/lib/page-metadata.ts), with a stable 1200×630 share card. Covered by `npm run test:metadata`.
- The canonical origin is validated in [`site-url.ts`](../src/lib/site-url.ts), so a `*.vercel.app` host can never become the canonical.
- [`robots.ts`](../src/app/robots.ts) blocks the auth-gated surface. `noindex` is set on public-but-private pages. AI crawlers are not blocked.
- [`sitemap.ts`](../src/app/sitemap.ts) lists only reachable public pages.
- JSON-LD on [home](../src/app/page.tsx) and [pricing](../src/app/pricing/page.tsx): `Organization`, `SoftwareApplication` with a live `Offer` price, and a `FAQPage` generated from the same array as the visible FAQ.
- `lang="en-PH"`, `locale: en_PH`, one `<h1>` per marketing page, and descriptive image `alt` text.

### Gaps found

| # | Gap | Impact | Fixed in |
|---|---|---|---|
| G1 | Only about 3 indexable content pages (home, pricing, signup) plus legal | Can rank only for the brand and "POS for cafes". This is the main cap on traffic. | Phases 2–4 |
| G2 | Apex requests now preserve paths through a 308 to `www`; the homepage and all sitemap URLs return 200 with matching canonicals | Prevent host/path duplicates and broken homepage indexing | ✅ 0.1 |
| G3 | `pos-mu-pearl.vercel.app` serves a 200 duplicate of every page | Duplicate-content risk; the canonical tag is only a hint | ✅ 0.2 |
| G4 | No `/llms.txt` | AI engines must pull facts out of about 300 KB of landing-page HTML | ✅ 0.8 |
| G5 | No web analytics in the codebase | Cannot measure traffic, referrers, or conversion | 0.5 |
| G6 | `Organization` schema has no `sameAs` profiles | Weaker entity recognition by Google and AI engines | 1.1 |
| G7 | Every page is `force-dynamic` with `Cache-Control: no-store`. Home TTFB ≈ 550 ms with 302 KB of HTML. | Core Web Vitals risk; no CDN caching of marketing pages | Phase 6 |
| G8 | Public menus have no structured data and no link back to Dumala | Missed internal discovery, referral traffic, and a brand touchpoint | 1.6–1.8 |
| G9 | No blog, guide, comparison, use-case, or feature pages | Nothing for AI engines to cite for "best POS in the Philippines"-type questions | Phases 3–4 |

### Constraints this plan must respect

- **Nonce CSP.** The [proxy](../src/proxy.ts) sets a per-request nonce, which is why the root layout is `force-dynamic`. Any static rendering of marketing pages must keep the CSP guarantees (Phase 6).
- **One price source.** Prices come from the billing catalog (`readCachedPlatformBillingCatalog`). Content must never hard-code a peso amount (same rule as Track J1).
- **Metadata goes through `socialMetadata`.** Next replaces `openGraph` objects instead of merging them, so hand-written blocks silently drop the share image.
- **Truthful claims only.** No BIR accreditation, compliance, integration, or customer-count claim unless it is verified and recorded in the decision log.
- **Next.js 16.3.1.** Read `node_modules/next/dist/docs/` before using a new API (per [AGENTS.md](../AGENTS.md)).

---

## 2. Content strategy and the AI-content policy

### Should we auto-generate blog posts? No — use AI-assisted, human-edited content.

Fully automated publishing is ruled out:

1. **Search engine policy.** Google's *scaled content abuse* policy targets pages mass-produced mainly to rank, regardless of how they are made. A site-wide demotion would also hit the homepage that ranks today.
2. **AEO does not reward volume.** AI answer engines cite sources that are specific, consistent, and corroborated. Generic "benefits of a POS" posts duplicate thousands of pages and get no citations.
3. **Factual risk.** Unreviewed output can invent features, prices, or BIR/tax claims — a legal and trust problem for a POS vendor.

**What we do instead:**

| Content type | How it's produced | Scales by |
|---|---|---|
| Use-case, feature, and comparison pages | Typed content files rendered through shared templates. Every block is filled with real product facts, screenshots, and the live catalog price. | Templates, not automation |
| Guides and articles | AI drafts from a brief → a person edits, fact-checks, and adds PH-specific detail → the reviewer signs off | Editorial workflow (Phase 7.3) |
| FAQs | Collected from real support, sales, and onboarding questions | Support feedback loop |

**Publishing rule:** every page must pass the [content quality checklist](#appendix-b--content-quality-checklist) before merge. Target cadence: **2–4 substantial pieces per month**, plus refreshes of existing pages.

### Keyword and topic map (hypotheses)

These are unvalidated starting clusters. Item 0.7 confirms them with Search Console data and a keyword tool before Phase 3 writing starts. The intent column decides which template a topic uses.

| Cluster | Example queries | Intent | Page type | Phase |
|---|---|---|---|---|
| Core category | pos system philippines, pos software philippines, cloud pos philippines | Commercial | Home + `/pos-system-philippines` pillar | 3 |
| Business type | pos for coffee shop, pos for milk tea shop, bakery pos, food cart pos, restaurant pos philippines | Commercial | `/pos-for/[type]` | 3 |
| Features | offline pos, pos with gcash, qr menu ordering, pos inventory, receipt printer pos | Commercial / informational | `/features/[slug]` | 3 |
| Alternatives | loyverse alternative, utak pos alternative, *X* vs *Y* | Commercial | `/compare/[slug]` | 3 |
| Price | pos system price philippines, pos monthly fee | Commercial | `/pricing` + price guide | 3–4 |
| Compliance | senior citizen discount computation, pwd discount pos, bir pos requirements | Informational (high AEO value) | `/guides/[slug]` | 4 |
| Operations | how to start a coffee shop philippines, food costing, inventory for small restaurant | Informational (top of funnel) | `/guides/[slug]` | 4 |
| Hardware | best receipt printer for pos, 58mm vs 80mm, bluetooth thermal printer | Informational | `/guides/[slug]` | 4 |

---

## Phase 0 — Foundations and measurement

**Why first:** without measurement, no later phase can be judged. The domain and duplicate fixes protect the rankings we already have.
**Owner:** Engineering + owner (dashboard access) · **Size:** S

- [x] **0.1 Consolidate the canonical host on `www`.** Vercel permanently redirects `dumala.store` to `www.dumala.store`. PR #52 excludes `www` from the merchant-menu rewrite; PR #53 aligns the root sitemap URL with the homepage canonical.
  *Verified live 2026-09-23:* the homepage and all 10 sitemap URLs return 200 with matching self-canonicals on `www`; `robots.txt` names the `www` sitemap; and `dumala.store/pricing` returns a 308 to `www.dumala.store/pricing`.
- [x] **0.2 De-index the deployment duplicate.** `X-Robots-Tag: noindex, nofollow` on `*.vercel.app` hosts ([next.config.ts](../next.config.ts)). Verified locally 2026-09-23: the header is present for the vercel host and absent for `dumala.store`.
- [ ] **0.3 Google Search Console.** The `dumala.store` Domain property has been created, but its DNS TXT verification record is not yet published. Verify the property, submit `https://www.dumala.store/sitemap.xml`, and record the baseline indexed pages, clicks, and queries in the KPI scorecard.
- [ ] **0.4 Bing Webmaster Tools.** Import from Search Console and submit the sitemap. Bing's index supplies ChatGPT search and Copilot, so this is an AEO prerequisite. Turn on IndexNow if offered.
- [ ] **0.5 Web analytics.** Choose a provider (decision D1) and install it without breaking the nonce CSP (add the provider's hosts to `connect-src`/`script-src`, and pass the nonce to any inline snippet). Track pageviews, referrers, and a `signup_started` / `signup_completed` event.
  *Done when:* referrers from `chatgpt.com`, `perplexity.ai`, and Google show in reports, and the CSP causes no console errors.
- [ ] **0.6 Signup source attribution.** Store first-touch `utm_*`, referrer, and landing path on signup (coordinate with Track J2 so no second attribution model is created).
- [ ] **0.7 Keyword validation.** Pull 90 days of Search Console queries (after 0.3 has collected data) and run the topic map through a keyword tool. Finalize the Phase 3/4 page list in this doc.
- [x] **0.8 Publish `/llms.txt`.** Plain-text product brief for AI engines. Price and branch rules come from the live billing catalog ([route](../src/app/llms.txt/route.ts)). Verified locally 2026-09-23.
- [x] **0.9 Test for `/llms.txt`.** [`scripts/seo-surface.test.ts`](../scripts/seo-surface.test.ts) (`npm run test:seo`): prices must come from the billing catalog with no literal amounts, and every public page and legal document must be linked.
- [ ] **0.10 Baseline audit snapshot.** Run PageSpeed Insights (mobile and desktop) on `/` and `/pricing`, plus a Rich Results Test on both. Record the results in the KPI table.

---

## Phase 1 — Technical SEO hardening

**Why:** cheap fixes that make every page from Phases 3–4 rank better and get cited more reliably.
**Owner:** Engineering · **Size:** S–M

- [ ] **1.1 Entity signals.** Add `sameAs` (Facebook, Instagram, TikTok, LinkedIn, YouTube — whichever exist; decision D2), `contactPoint`, and `foundingDate`/`founder` if public, to the `Organization` node. Use the same `@id` on every page.
- [ ] **1.2 Shared JSON-LD helper.** Move the `Organization`/`WebSite` graph out of `page.tsx` into `src/lib/structured-data.ts`. Pages then add their own nodes (`BreadcrumbList`, `Article`, `FAQPage`) by `@id` reference. Add a `WebSite` node.
- [ ] **1.3 Breadcrumbs.** Visible breadcrumbs plus `BreadcrumbList` JSON-LD on every page below the root (legal pages now, all Phase 3/4 pages later).
- [ ] **1.4 Real `lastModified` in the sitemap.** Take it from content front-matter `updatedAt` (Phase 2). This matches the rule already written in `sitemap.ts`: only true dates.
- [x] **1.5 Canonical on every public page.** Every sitemap page (home, pricing, signup, legal index, and all 6 legal documents) already set a self-referencing `alternates.canonical`. `npm run test:seo` now fails if a sitemap page loses it.
- [ ] **1.6 Public menu indexing rules.** Index a merchant menu only if the store is active/paid, has published items, and is not a test/trial-preview store; `noindex` otherwise. This stops thin or empty menus from diluting site quality.
- [ ] **1.7 Public menu structured data.** Add `Restaurant`/`FoodEstablishment` + `Menu`/`MenuItem` JSON-LD (name, address if set, hours, price range, `hasMenu`) to indexable menus.
- [ ] **1.8 "Powered by Dumala POS" footer on public menus.** Small brand link with UTM parameters. Menu subdomains are part of the `dumala.store` site, so this is **internal linking and referral traffic, not external backlink authority**. Merchant-facing change; decision D3.
- [ ] **1.9 Custom 404 page.** Links to home, pricing, and guides, with `noindex`. Check that unknown URLs return a real 404 status, not a 200 soft-404.

---

## Phase 2 — Content platform

**Why:** Phases 3–4 need somewhere to live. Build it once, in the repo, and typed — a database CMS is Track J1's later job.
**Owner:** Engineering · **Size:** M

- [ ] **2.1 Choose the content format** (decision D4). Recommended: MDX or typed TS content files under `src/content/` with validated front-matter (`title`, `description`, `slug`, `publishedAt`, `updatedAt`, `author`, `reviewer`, `category`, `faqs[]`). They are reviewed in PRs, so no new runtime or database is needed.
- [ ] **2.2 Route tree:** `/guides`, `/guides/[slug]`, `/pos-for/[slug]`, `/features/[slug]`, `/compare/[slug]`, each with `generateStaticParams` + `generateMetadata` via `socialMetadata`. Unknown slugs call `notFound()`.
- [ ] **2.3 Article template.** Answer-first intro, question-style H2s, table of contents, author/reviewer byline, "Last updated" date, related links, and a trial CTA. `Article` + `FAQPage` + `BreadcrumbList` JSON-LD are generated from the same data as the visible content.
- [ ] **2.4 Landing template** for use-case/feature pages. Hero with a benefit-led `<h1>`, a proof block (screenshots and real features), a pricing snippet from the catalog, an FAQ, and a CTA.
- [ ] **2.5 Comparison template.** A feature table with sources and a "last verified" date for every competitor claim, fair "who each is better for" sections, and no competitor logos or trademarks beyond nominative use.
- [ ] **2.6 Author pages** (`/about`, `/authors/[slug]`). Real people with a role and relevant experience (E-E-A-T). Add an `/about` company page — AI engines look for it.
- [ ] **2.7 Sitemap generation from content.** The sitemap lists every published content entry with a real `lastModified`. Split into a sitemap index if it passes about 1,000 URLs.
- [ ] **2.8 Internal linking.** Header/footer nav adds Guides, Use cases, and Compare. Each page links to 3–5 related pages and one pillar. Add a link-check test so every internal link resolves.
- [ ] **2.9 Social cards per content type.** An `opengraph-image` generator for guides (title plus brand frame), called through the helper so the fallback share card keeps working.
- [ ] **2.10 Expand `llms.txt` automatically.** List every published guide, use-case, and comparison page with its one-line summary.

---

## Phase 3 — Commercial landing pages

**Why:** these pages catch buyers who are ready to decide, so they convert far better than blog traffic.
**Owner:** Content + engineering review · **Size:** M (content-heavy)

Each page must pass [Appendix B](#appendix-b--content-quality-checklist) and have at least one unique screenshot and 5+ page-specific FAQs.

**Pillar**
- [ ] **3.1** `/pos-system-philippines` — the full guide to choosing a POS in the PH. Links to every page below.

**Use cases** (`/pos-for/…`)
- [ ] **3.2** Coffee shops
- [ ] **3.3** Milk tea and beverage kiosks
- [ ] **3.4** Bakeshops (by-weight items)
- [ ] **3.5** Restaurants and carinderias
- [ ] **3.6** Food carts and multi-branch franchises

**Features** (`/features/…`)
- [ ] **3.7** Offline POS (offline-first sync)
- [ ] **3.8** Online menu and QR ordering (pickup, delivery, scheduling)
- [ ] **3.9** Inventory and recipes, plus receipt printers (ESC/POS, Bluetooth, USB, LAN)

**Comparisons** (`/compare/…`) — decision D5 on which competitors
- [ ] **3.10** Dumala vs the most-searched alternative (from 0.7)
- [ ] **3.11** "Best POS systems in the Philippines" roundup that includes Dumala. Honest, with methodology stated.

---

## Phase 4 — Editorial guides and AEO

**Why:** AI engines and Google's AI Overviews answer questions by quoting pages that answer them best. This phase makes Dumala the quoted source for PH food-business operations.
**Owner:** Content · **Size:** M, ongoing

**AEO formatting rules** (applied to every guide):
- Put a direct 40–60 word answer right under each question-style H2, then the detail.
- Use real numbers, tables, and step lists. Show worked examples (for example a discount computation).
- Keep entity names consistent: "Dumala POS", the same one-line description everywhere.
- Cite primary sources (BIR, DTI, RA 9994/RA 10754 texts) with links.
- Show a dated "Last updated" line and a named reviewer.

**First guides** (final list comes from item 0.7):
- [ ] **4.1** How to compute senior citizen and PWD discounts (with VAT-exempt worked examples)
- [ ] **4.2** BIR requirements for POS systems in the Philippines. Factual and cited; states plainly what Dumala does and doesn't cover (decision D6).
- [ ] **4.3** How much does a POS system cost in the Philippines? (hardware, software, fees)
- [ ] **4.4** How to start a coffee shop in the Philippines — permits, equipment, and a setup checklist
- [ ] **4.5** Food costing and menu pricing for small restaurants (with a calculator or table)
- [ ] **4.6** Inventory management for small food businesses
- [ ] **4.7** 58mm vs 80mm receipt printers — choosing a thermal printer
- [ ] **4.8** Accepting GCash and Maya at the counter: recording, reconciliation, and end-of-day

**AEO operations**
- [ ] **4.9 Glossary** (`/guides/glossary`): short, definitional entries (Z-reading, X-reading, void, shift, SKU, by-weight item) with `DefinedTerm` JSON-LD. Short definitions like these get quoted by AI engines.
- [ ] **4.10 AI answer panel.** A fixed list of 20 prompts, e.g. "best POS for a small coffee shop in the Philippines", "offline POS Philippines", "POS with GCash". Run them monthly in ChatGPT, Perplexity, Gemini, Copilot, and Google AI Overviews. Record whether Dumala is named or cited, and which sources are cited instead — those sources become Phase 5 targets.
- [ ] **4.11 FAQ harvest.** Every month, pull the top questions from support, sales, and onboarding into the relevant page FAQs.

---

## Phase 5 — Authority and off-site presence

**Why:** rankings and AI citations depend heavily on what *other* sites say about you. AI engines lean on third-party listicles, directories, and community threads.
**Owner:** Owner / marketing · **Size:** M, ongoing

- [ ] **5.1 Review/software directories:** Capterra, G2, GetApp, Software Advice, SaaSworthy. Complete profiles with the same description, category, and pricing.
- [ ] **5.2 Customer reviews program.** Ask active merchants for reviews after onboarding milestones (e.g. 30 days of sales). Never incentivize in ways that break platform rules.
- [ ] **5.3 Listicle outreach.** Find the "best POS Philippines" articles that AI engines cite (from 4.10) and pitch the authors with facts, screenshots, and a trial.
- [ ] **5.4 Customer case studies** (`/customers/[slug]`) with the merchant's consent: before/after, quotes, photos. Merchants often link to them — a real backlink.
- [ ] **5.5 Communities.** Helpful, disclosed participation in PH food-business Facebook groups, Reddit (r/phinvest, r/PHbuildapc for hardware, local business subs), and Quora. No spam; link only when it answers the question.
- [ ] **5.6 Google Business Profile** for the company (if there is a qualifying business address — decision D7) plus consistent NAP details everywhere.
- [ ] **5.7 Partnerships.** Receipt-printer resellers, coffee-equipment suppliers, and franchise consultants — co-marketing pages and listing on partner sites.
- [ ] **5.8 Digital PR.** One data-led story per quarter, from anonymized, aggregated, consented platform data (e.g. "busiest café hours in PH"). Legal/privacy review first.
- [ ] **5.9 YouTube and TikTok how-tos** (setup, printer pairing, offline demo), each embedded on the matching feature or guide page with `VideoObject` JSON-LD.

---

## Phase 6 — Performance and Core Web Vitals

**Why:** page experience is a ranking tiebreaker, and faster pages convert better. Today every marketing request is rendered fresh with `no-store`.
**Owner:** Engineering · **Size:** M–L (security-sensitive)

- [ ] **6.1 Measure first.** Field data (CrUX/PageSpeed) for `/`, `/pricing`, and a guide. Find the LCP element and the heaviest scripts (the POS playground, reveal animations).
- [ ] **6.2 Static marketing pages with a safe CSP.** Evaluate serving `/`, `/pricing`, `/guides/**`, and the other content routes as static/ISR with a hash-based or strict-dynamic CSP that has no per-request nonce, or with Next's recommended approach in the installed docs. Needs a security review; the existing CSP must not get weaker. Decision D8.
- [ ] **6.3 CDN caching** for content routes (`s-maxage` + `stale-while-revalidate`) once 6.2 lands. Revalidate on catalog price change.
- [ ] **6.4 Trim landing HTML** (302 KB). Keep the playground and heavy client islands lazy and below the fold, and cut duplicated inline data.
- [ ] **6.5 Image pass.** `priority` on the hero image, correct `sizes`, AVIF/WebP, no layout shift.
- [ ] **6.6 Regression budget.** Lighthouse CI or a scripted check in CI: LCP < 2.5 s, CLS < 0.1, INP < 200 ms on the templates.

---

## Phase 7 — Scale, measure, and refresh

**Why:** SEO compounds only with a steady loop of publishing, measuring, and refreshing.
**Owner:** Content lead + owner · **Size:** Ongoing

- [ ] **7.1 Monthly review.** Update the KPI scorecard and the AI answer panel (4.10). Record the top gaining and losing pages. Move the next topics into the content calendar.
- [ ] **7.2 Content calendar.** 2–4 new pieces plus 2 refreshes a month, prioritized by 0.7 data and 4.10 gaps.
- [ ] **7.3 AI-assisted editorial workflow.** Write down the brief → AI draft → human edit and fact-check → reviewer sign-off → PR flow. The brief template lists the target query, intent, required product facts, sources, and internal links. No draft merges without a named human reviewer.
- [ ] **7.4 Refresh policy.** Re-verify any page older than 6 months, or showing falling clicks: facts, prices (from the catalog), screenshots, competitor claims. Bump `updatedAt` only when content really changed.
- [ ] **7.5 Prune or merge.** After 6 months, merge or redirect pages with no impressions and no strategic value rather than keeping thin pages.
- [ ] **7.6 Move to Track J1.** Once the in-repo content model is proven, the platform console's J1 publishing workflow can take over FAQs, guides, and release notes (preview → review → publish → rollback).

---

## Decision log

| ID | Decision needed | Recommended default | Status | Decided on / by |
|---|---|---|---|---|
| D1 | Analytics provider | Vercel Web Analytics or Plausible (privacy-friendly, small script, easy CSP); add GA4 only if ad campaigns need it | Open | — |
| D2 | Official social profiles for `sameAs` | Claim consistent handles first (Facebook, Instagram, TikTok, LinkedIn, YouTube) | Open | — |
| D3 | "Powered by Dumala POS" on merchant menus | On by default, small and unobtrusive; paid plans may hide it | Open | — |
| D4 | Content format | In-repo MDX/typed content, reviewed in PRs; database CMS later via J1 | Open | — |
| D5 | Competitors to compare against | Pick from 0.7 search data; verified, dated, fair claims only | Open | — |
| D6 | BIR / tax-compliance positioning | State only verified facts; no "BIR accredited" claim unless accreditation exists | Open | — |
| D7 | Google Business Profile eligibility | Only with a real, verifiable business address | Open | — |
| D8 | Static marketing pages vs per-request nonce CSP | Prototype hash-based CSP on one route; ship only after security review | Open | — |
| D9 | Language targeting | English first; consider Tagalog/Taglish guides after English traction is measured | Open | — |
| D10 | Canonical public hostname | `www.dumala.store`, matching Vercel's apex-to-www 308 redirect | Decided | 2026-09-23 / owner |

---

## Change log

| Date | Change |
|---|---|
| 2026-09-23 | Plan created. Completed 0.2 (vercel.app `X-Robots-Tag`) and 0.8 (`/llms.txt`). Baseline issues G1–G9 recorded from live checks. |
| 2026-09-23 | Completed 0.9 and 1.5: added `scripts/seo-surface.test.ts` / `npm run test:seo` (sitemap canonicals, llms.txt price source and links). |
| 2026-09-23 | Completed 0.1 after PR #52 fixed the homepage rewrite and PR #53 aligned the root sitemap URL with its canonical. Live checks passed for the homepage, all 10 sitemap pages, `robots.txt`, and apex path redirect. |
| 2026-09-23 | Started 0.3: created the `dumala.store` Domain property in Search Console; DNS TXT verification and sitemap submission remain pending. |

---

## Appendix A — Technical definition of done (every public page)

- [ ] `generateMetadata`/`metadata` sets a unique `title` (≤ 60 chars) and `description` (≤ 155 chars) through `socialMetadata`
- [ ] `alternates.canonical` equals the page's own URL
- [ ] Exactly one `<h1>`; headings in logical order
- [ ] JSON-LD is generated from the same data as the visible content; passes the Rich Results Test
- [ ] Listed in the sitemap with a real `lastModified`; linked from at least one indexed page
- [ ] Images have descriptive `alt` and explicit dimensions; the hero uses `priority`
- [ ] No hard-coded prices; the catalog is the only source
- [ ] Renders with no CSP console errors; typecheck, lint, and `test:metadata` pass

## Appendix B — Content quality checklist

- [ ] Targets one primary query and matches its intent (from the topic map)
- [ ] Answers the main question within the first 60 words
- [ ] Contains information that is **specific to Dumala or the PH market**, not generic filler
- [ ] Every product claim is verified against the current app; every legal or tax claim cites a primary source
- [ ] Named author and reviewer; accurate "Last updated" date
- [ ] At least one original asset (screenshot, table, worked example, calculator, or photo)
- [ ] 3–5 contextual internal links plus one CTA to the trial or pricing
- [ ] AI-drafted text has been rewritten and fact-checked by a person; no invented stats, quotes, or customers
