# Project Map

Structure, modules, routes, DB schema, and commands. See also:
[conventions](conventions.md) · [integrations](integrations.md) ·
[performance](performance.md) · [decisions](decisions.md) · [sessions](sessions.md).

## Stack (detected)

- **Framework:** Next.js `^14.2.0` (App Router, API route handlers)
- **Runtime:** Node.js on Vercel serverless functions
- **UI:** React `^18.3.0` — but output is server-rendered HTML strings, **not** React components
- **Language:** plain JavaScript, ES modules (`import`/`export`). No TypeScript.
- **Package manager:** npm (`package-lock.json` present)
- **DB client:** `@supabase/supabase-js` `^2.45.0`
- **Lint / typecheck / tests:** none configured (TBD)
- `next.config.js`: `reactStrictMode: false`

## Commands

| Command | What |
|---|---|
| `npm install` | install deps |
| `npm run dev` (`next dev`) | local dev, port 3000 |
| `npm run build` (`next build`) | production build |
| `npm run start` (`next start`) | serve production build |
| `git push origin main` | deploy (Vercel GitHub integration) |

Local smoke test: `http://localhost:3000/api/dashboard/demo?token=demo_revfactor_2024_showcase`
(add `&tab=seo` for the SEO tab). Demo needs no DB creds.

## Folder structure

```
├── AGENTS.md                 # agent routing (source of truth)
├── CLAUDE.md                 # imports @AGENTS.md
├── docs/
│   ├── agent/                # durable technical memory (this folder)
│   ├── seo-drafts/           # approved SEO visual mockups (source of truth for SEO UI)
│   ├── assembly-embed-setup.md
│   └── pricelabs-api-reference.md
├── config/design-tokens.json # design system tokens (colors, type, spacing)
├── migrations/               # SQL, run manually in Supabase (NOT auto-applied)
│   ├── 001_seed_clients_pricelabs.sql
│   ├── 002_add_dashboard_url.sql
│   └── 003_seo_metrics.sql   # airbnb_id generated col + seo_metrics_raw + seo_metrics view
├── app/api/dashboard/[slug]/route.js   # the only route
├── lib/                      # all logic
├── public/logo.svg
├── next.config.js
├── vercel.json               # region iad1 + iframe headers
└── .env.example
```

## The route

`app/api/dashboard/[slug]/route.js` — single `GET` handler.
- Query params: `token` (required, per-client secret), `tab` (`pricing` default | `seo`), `listing` (drill-down: renders the per-listing view — SEO single funnel by `hubListingId`, pricing detail by `listingId`).
- Flow: `validateClient(slug, token)` → pick data source → `renderDashboard(client, data, { tab, seo })`.
- Pricing data source order: demo mock → `getClientReport` (Supabase) → `fetchClientData` (live PriceLabs) → error.
- SEO tab: demo mock → `getClientSeo` (Supabase view); `null` renders an empty state (still 200).
- Response headers set here **and** in `vercel.json`: `X-Frame-Options: ALLOWALL`, `CSP frame-ancestors *`, `ACAO: *` (iframe-embeddable). Cache: `s-maxage=21600, stale-while-revalidate=3600`, or `no-store` when empty.

## `lib/` modules

| File | Responsibility | Cache |
|---|---|---|
| `supabase.js` | service-role Supabase singleton (`getSupabase`) | — |
| `clients.js` | `getClientById` (+ hardcoded `demo`) | Map, 10 min |
| `auth.js` | `validateClient` — UUID + token, `timingSafeEqual` | — |
| `pricelabs.js` | `fetchClientData` — live PriceLabs `/v1/listings`, filter by group | Map, 6 h |
| `reports.js` | `getClientReport` — primary pricing source (report_* tables) | Map, 30 min |
| `seo.js` | `getClientSeo` — Airbnb funnel data from `seo_metrics` view | Map, 30 min |
| `mock-data.js` | `generateMockData`, `generateMockReportData`, `generateMockSeoData` | — |
| `render.js` | `renderDashboard(client, data, { tab, seo, listing })`, `renderErrorPage`; pricing + SEO components; per-listing pricing detail (`renderListingDetail` + `ld*` chart builders, 4 sub-views, enhanced by `LISTING_DETAIL_JS`); SEO drill-down links; `c`/`f` token helpers; inline SVG | — |

## Supabase schema (Hub project `revfactorHub`)

Tables are created/managed by hand via `migrations/` in the Supabase SQL editor.

- **`clients`** — `id` (uuid, in URL), `name`, `dashboard_token`, `dashboard_url` (generated), `pricelabs_group`, `market`, `status`
- **`listings`** — `id` (uuid), `client_id` → clients.id, `name`, `listing_id` (PriceLabs id, text), `airbnb_link`, **`airbnb_id`** (generated STORED from `airbnb_link` via `/rooms/(\d+)`), `city`, `state`
- **`report_runs`** — one row per daily ingestion of the PriceLabs report (template `12127`). Dashboard uses the latest `status='completed'` (`order by completed_at desc`). Fields: `id`, `status`, `completed_at`, `listing_count`, `metric_row_count`, `report_currency` (USD).
- **`report_listings`** — bridge: `report_run_id`, `listing_id` (PriceLabs id) → `hub_client_id` (= clients.id) + `hub_listing_id` (= listings.id), `listing_name`, `city`, `bedroom_count`, `group_name`, `is_parent`. Filter by `hub_client_id` + latest run; sub-units prefixed `_units_` are dropped (the parent represents them).
- **`report_metrics`** — **12 monthly rows per listing** (one calendar year), `period` (`YYYY-MM`). A month is an *actual* when `period < current month`, else *pace/forecast*. Fields (with STLY/YoY): `rental_revenue`, `rental_adr`/`market_adr`, `rental_revpar`/`market_revpar`/`revpar_index`, `adjusted_occupancy_pct`/`market_occupancy_pct`, `market_penetration_index_pct` (MPI), `median_booking_window`, `booked_nights_pickup_30d`, `potential_revenue_open_inventory`.

**Report-backed pricing layout** (`data.source === 'report'`): KPI cards ([Year] Revenue w/ YoY, Occupancy next-4mo vs market, RevPAR Index, Avg Booking Window, Nights Booked 30d), a revenue **pacing chart** (inline SVG: solid = booked months, muted = pace, tick = same-time-last-year), and the listings table. The legacy live-API layout (`renderKpiCards`/`renderListingsTable`) still renders for fallback clients.
- **`seo_metrics_raw`** — 1:1 with the Rankbreeze CSV: `download_date`, `airbnb_id`, `rankbreeze_id`, `listing_name`, `city`, `state`, `country`, `metric`, `guest_count`, `side`, `period`, `value` (RLS enabled)
- **`seo_metrics`** (view) — normalizes `metric`→`metric_key`, `side`→`my`/`similar`, and joins `listings` on `airbnb_id` to resolve `hub_listing_id` / `hub_client_id` (null when unmatched)

Join chain (SEO): CSV `Airbnb ID` = `listings.airbnb_id` (from `airbnb_link`) → `listings.id` → `listings.client_id` = `clients.id`.

## SEO data shape (from `getClientSeo` / mock)

Per listing: `funnel` (6 stages `{my, similar, ratio}`), `health {above,total}`, `rank {pods[], avg, marketAvg}`, `board` (prev/current/next month per metric), `trend` (12-month my-vs-market). Layout by count: **1** → funnel · **2–7** → cards · **8+** → matrix (`SEO_LAYOUT` in `render.js`). Visual source of truth: [`docs/seo-drafts/`](../seo-drafts/).
