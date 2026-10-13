# Decisions

Technical decisions with trade-offs, newest first. Keep entries short.
Add a dated entry whenever a choice would surprise a future reader.

See also: [project-map](project-map.md) · [conventions](conventions.md) · [performance](performance.md).

Format:
```
## YYYY-MM-DD — <title>
- Decision: …
- Why: …
- Trade-off / alternative rejected: …
```

---

## 2026-10-12 — PriceLabs Report model reads the pricelabs-dashboard DB directly

- **Decision:** The `pricelabs-report` model reads the sibling app's serving database (read-only `dashboard_reader` login, postgres.js) instead of the Hub, so it can show the price calendar, price reasons and neighborhood data the Hub doesn't have. Ported to server-rendered HTML/SVG; calendar details are `<template>`s opened by JS, with `?date=`/`?res=`/`?others=` URLs as the no-JS path.
- **Why:** Requested port of the per-client pricelabs-dashboard report into the Assembly portal; copying that data into the Hub would duplicate the nightly pipeline.
- **Trade-offs:** A second DB + server-only secret; figures may differ slightly from the Hub-based models (different pipelines). Calendar pages are ~350 KB raw (~22 KB gzipped) because each open day carries its detail template. Alternatives rejected: Hub-only replica (no calendar/neighborhood); live PriceLabs API (no neighborhood/price reasons, slower).

## 2026-10-12 — Dashboard models live in code, assignment lives in the DB

- **Decision:** A "model" is a render function in `lib/layouts/` registered by key; `clients.dashboard_layout` / `dashboards.layout` pick one (migration 006). New models are built in code (with Claude in chat) and deployed; `/admin` only assigns them.
- **Why:** Keeps dashboards server-rendered and reviewable in git; avoids building a visual dashboard builder.
- **Trade-offs:** A new model needs a deploy; assigning/reverting doesn't. Non-standard models are served `no-store`. Switching a client's *existing* link can lag up to 6 h because the prior standard response may be in the CDN — test with clients via beta dashboard links (always `no-store`).

## 2026-10-12 — Dashboard Manager: password-protected `/admin` + `dashboards` table

- **Decision:** Add an internal admin (`/admin`, React server components + Server Actions) behind a single shared password (`ADMIN_PASSWORD`, HMAC-signed HttpOnly cookie). Supabase Auth was tried first and dropped: the Hub project's Auth belongs to the Hub app, and magic links would create users there. Beta dashboards are rows in a new `dashboards` table (own slug + token, sample or linked-real data, enable/expiry), plus a per-client `clients.dashboard_variant` flag.
- **Why:** New demo/beta dashboards previously required a code change + deploy (`demo-blackbird`) and reused the shared demo token. Betas for client feedback need self-serve creation and revocable, per-dashboard links.
- **Trade-offs:** First React/JS-dependent surface in the repo — acceptable because it's internal; Critical Rule #1 (progressive enhancement) still applies to client dashboards, and admin forms still submit without JS. Managed/beta dashboards are served `no-store` (no CDN cache) so disable/expiry is immediate; per-instance memory cache is 60 s for managed rows and 10 min for clients, so a client variant toggle can lag up to 10 min. Hardcoded demos kept for back-compat. Password = no per-user audit (`created_by` is `'admin'`); failed logins are delayed 1 s but not rate-limited.
- **Admin styling follows the Hub, not the dashboard brand:** `app/admin/styles.js` copies the RevFactor Hub's shadcn tokens (neutral oklch palette, green primary, Geist via the `geist` package, rounded controls, hairline borders + soft elevation, `prefers-color-scheme` dark). Critical Rule #3 (design tokens, no 1px borders/shadows) applies to client dashboards only. Plain CSS — no Tailwind added; resync by hand if the Hub's `app/globals.css` tokens change.

## 2026-07-02 — Adopt client-side JS as progressive enhancement (relax the no-JS rule)

- **Decision:** The old "no client-side JavaScript" rule is relaxed to **"JS only as progressive enhancement."** The server still renders all content/data (charts stay inline SVG); JS may add client-side sub-tabs and hover tooltips, but every view must remain reachable and readable with JS off (URL-param routing + stacked panels).
- **Why:** Per-listing reports (pricing detail with 4 sub-views, SEO drill-down) need interactivity (tabs, tooltips) to reach parity with the Hub's `listing-report-dashboard.tsx`. A throwaway probe (`/api/dashboard/jstest`) confirmed **Assembly's iframe executes JS** and does not sandbox it out.
- **Details:** Pricing per-listing detail (`renderListingDetail` in `lib/render.js`) ships server-rendered SVG + tables for all 4 panels; a small inline script (`LISTING_DETAIL_JS`) toggles panels + drives one shared `#ld-tip` tooltip. SEO drill-down (cards/matrix → single funnel) is server-routed via `?listing=<hubListingId>` (works fully without JS).
- **Trade-off / guardrails:** Rule #2 (no secrets in HTML) is unchanged and now more important — any JSON embedded for the client must carry only already-public report metrics. Avoid JS that changes iframe height (breaks Assembly's fixed-height embed); tabs/tooltips are height-neutral.

## 2026-07-02 — SEO Visibility tab (Rankbreeze)

- **Decision:** Add a second dashboard tab (`?tab=seo`) showing each listing's Airbnb search funnel (visibility → interest → conversion) vs. similar listings, from a manually-loaded Rankbreeze CSV. Same URL/auth as pricing.
- **Why:** Give owners a view of *how guests find and book*, alongside revenue/occupancy.
- **Details:** Data lives in `seo_metrics_raw` (+ `seo_metrics` view). Join to listings via a generated `listings.airbnb_id` parsed from `airbnb_link`. Layout by matched-listing count: 1 → funnel, 2–7 → cards, 8+ → matrix (`SEO_LAYOUT`). Funnel period = **last complete month**. Portfolio drafts in `docs/seo-drafts/` are the visual source of truth.
- **Trade-off:** Manual CSV import for the MVP (no scheduled ingestion); ~27/218 listings don't match and are skipped; rank shown as a single by-guest-count snapshot, not a time series.

## 2026-07-02 — Enable RLS on `seo_metrics_raw`

- **Decision:** Create the SEO tables with Row Level Security enabled and no policies.
- **Why:** The app reads via the service-role key (bypasses RLS), so enabling RLS locks out anon/authenticated keys with zero functional impact.
- **Trade-off:** Anon key can't read the table (intended). Other Hub tables may predate this convention — enable RLS on new tables going forward.

## 2026-07-02 — Commit the previously-uncommitted report data module

- **Decision:** Commit `lib/reports.js` + its `route.js`/`mock-data.js` integration as its own commit so the branch builds.
- **Why:** The report feature (primary pricing source via Supabase `report_*` tables) existed only as uncommitted local WIP; the committed route imported a file that wasn't in git.
- **Trade-off:** None — closes a latent broken-build gap.

---

## Earlier (from git history, dates approximate)

- **Client registry → Supabase Hub.** Migrated from a static `clients.json` to the Supabase `clients` table; adding a client = inserting a row (commit `9ead48f`).
- **Skip edge cache when zero listings.** Return `no-store` for empty dashboards (commit `86cd3a8`).
- **Report as primary pricing source, live API as fallback.** `getClientReport` (daily Supabase report) is primary; `fetchClientData` (live PriceLabs `/v1/listings`) is the fallback for clients without a report run.
- **Pricing calendar removed.** The Customer API exposes no per-date pricing, so the per-date calendar was dropped.
