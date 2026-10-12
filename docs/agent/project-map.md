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
│   ├── 003_seo_metrics.sql   # airbnb_id generated col + seo_metrics_raw + seo_metrics view
│   ├── 004_seo_metrics_raw_id.sql
│   ├── 005_dashboard_manager.sql  # clients.dashboard_variant + dashboards table
│   └── 006_dashboard_layouts.sql  # clients.dashboard_layout + dashboards.layout
├── app/api/dashboard/[slug]/route.js   # client dashboards (raw HTML)
├── app/admin/                # internal Dashboard Manager (React, password login)
├── app/layout.js             # root layout for React pages (admin only)
├── lib/                      # all logic
├── public/logo.svg
├── next.config.js
├── vercel.json               # region iad1 + iframe headers
└── .env.example
```

## The route

`app/api/dashboard/[slug]/route.js` — single `GET` handler.
- Query params: `token` (required, per-client secret), `tab` (`pricing` default | `seo`), `listing` (drill-down: renders the per-listing view — SEO single funnel by `hubListingId`, pricing detail by `listingId`).
- `slug` is a client UUID, a hardcoded demo (`demo`, `demo-blackbird`), or a **managed dashboard slug** from the `dashboards` table (see below).
- Flow: `validateClient(slug, token)` → pick data source → `getLayout(client.layout).render(...)` (dashboard **model**, see `lib/layouts/`; `?layout=<key>` override works only outside production) → `renderDashboard(client, data, { tab, seo })`.
- Pricing data source order: demo mock → `getClientReport` (Supabase) → `fetchClientData` (live PriceLabs) → error.
- SEO tab: demo mock → `getClientSeo` (Supabase view); `null` renders an empty state (still 200).
- Response headers set here **and** in `vercel.json`: `X-Frame-Options: ALLOWALL`, `CSP frame-ancestors *`, `ACAO: *` (iframe-embeddable). Cache: `s-maxage=21600, stale-while-revalidate=3600`, or `no-store` when empty **or** when the dashboard is managed / `variant === 'beta'` (so disabling a beta link takes effect).
- Linked managed dashboards keep `client.id` = slug (for rendered links) and carry `client.dataClient` (the real Hub client) — data readers keyed on the Hub UUID (`getClientReport`, `getClientSeo`, reservations) must receive `dataClient`.

## Admin — Dashboard Manager (`/admin`)

Internal-only React pages (server components + Server Actions; forms work without JS). Not iframe-embedded (`X-Frame-Options: DENY`, `noindex`).
- `/admin/login` — single shared password (`ADMIN_PASSWORD`) → signed HttpOnly cookie `rf_admin` (7 days, path `/admin`). `noindex` + `X-Frame-Options: DENY` set in `next.config.js`.
- `/admin` — lists managed dashboards + all clients with copyable links; per-client stable/beta toggle.
- `/admin/dashboards/new`, `/admin/dashboards/[id]` — create/edit a managed dashboard (sample data or linked to a real client), enable/expire, regenerate token.
- Look: mirrors the RevFactor Hub (shadcn tokens in `app/admin/styles.js`, Geist font, Hub logos in `public/admin/`), not the dashboard brand tokens — see decisions 2026-10-12.
- Code: `app/admin/actions.js` (Server Actions, each calls `requireAdmin()`), `lib/admin.js` (service-role writes), `lib/admin-auth.js` (`checkPassword`, `startSession`, `requireAdmin`).

## `lib/` modules

| File | Responsibility | Cache |
|---|---|---|
| `supabase.js` | service-role Supabase singleton (`getSupabase`) | — |
| `clients.js` | `getClientById` — demos → client UUID → managed `dashboards` slug | Map, 10 min (managed: 60 s) |
| `admin.js` | admin data layer: list clients/dashboards, create/update dashboards, variant toggle, token regen, `dashboardUrl` | — |
| `layouts/` | Dashboard **models**: `index.js` registry (`listLayouts`, `getLayout` → falls back to `standard`), one file per model. `standard.js` wraps `renderDashboard`; `performance-report.js` = single-page report (year/month KPI cards, Airbnb funnel vs similar listings, per-listing table, 3 SVG trend charts + monthly table, day-of-week insights, glossary) | — |
| `day-of-week.js` | `getClientDayOfWeek(client, { year, listingIds })` — paginated reservations, revenue spread per night, bucketed by weekday; availability = listings × weekdays in the year (errors → null) | Map, 30 min |
| `admin-auth.js` | `/admin` password check + HMAC-signed session cookie (`requireAdmin`) | — |
| `auth.js` | `validateClient` — UUID + token, `timingSafeEqual` | — |
| `pricelabs.js` | `fetchClientData` — live PriceLabs `/v1/listings`, filter by group | Map, 6 h |
| `reports.js` | `getClientReport` — primary pricing source (report_* tables) | Map, 30 min |
| `seo.js` | `getClientSeo` — Airbnb funnel data from `seo_metrics` view | Map, 30 min |
| `reservations.js` | `getClientReservations` / `getListingReservations` — last 6 bookings from `pricelabs_reservations_cache` matview, portfolio-wide or per listing (dedupes by `reservation_key`; errors → `[]`) | Map, 30 min |
| `mock-data.js` | `generateMockData`, `generateMockReportData`, `generateMockSeoData` | — |
| `render.js` | `renderDashboard(client, data, { tab, seo, listing })`, `renderErrorPage`; pricing + SEO components; per-listing pricing detail (`renderListingDetail` + `ld*` chart builders, 4 sub-views, enhanced by `LISTING_DETAIL_JS`); SEO drill-down links; `c`/`f` token helpers; inline SVG | — |

## Supabase schema (Hub project `revfactorHub`)

Tables are created/managed by hand via `migrations/` in the Supabase SQL editor.

- **`clients`** — `id` (uuid, in URL), `name`, `dashboard_token`, `dashboard_url` (generated), `pricelabs_group`, `market`, `status`, `dashboard_layout` (model key, migration 006, default `standard`), `dashboard_variant` (`stable`|`beta`, migration 005 — beta shows a "Beta Preview" badge; gate experimental sections on `client.variant === 'beta'`)
- **`dashboards`** (migration 005, RLS on, no policies) — admin-managed isolated dashboards: `slug` (URL), `name`, `market`, `client_id` (null → sample data from `demo_listings` jsonb `[{listingId,name,city}]`), `variant`, `layout` (model key, migration 006), `token`, `enabled`, `expires_at`, `notes`, `created_by`. Disabled/expired → 404.
- **`listings`** — `id` (uuid), `client_id` → clients.id, `name`, `listing_id` (PriceLabs id, text), `airbnb_link`, **`airbnb_id`** (generated STORED from `airbnb_link` via `/rooms/(\d+)`), `city`, `state`
- **`report_runs`** — one row per daily ingestion of the PriceLabs report (template `12127`). Dashboard uses the latest `status='completed'` (`order by completed_at desc`). Fields: `id`, `status`, `completed_at`, `listing_count`, `metric_row_count`, `report_currency` (USD).
- **`report_listings`** — bridge: `report_run_id`, `listing_id` (PriceLabs id) → `hub_client_id` (= clients.id) + `hub_listing_id` (= listings.id), `listing_name`, `city`, `bedroom_count`, `group_name`, `is_parent`. Filter by `hub_client_id` + latest run; sub-units prefixed `_units_` are dropped (the parent represents them).
- **`report_metrics`** — **12 monthly rows per listing** (one calendar year), `period` (`YYYY-MM`). A month is an *actual* when `period < current month`, else *pace/forecast*. Fields (with STLY/YoY): `rental_revenue`, `rental_adr`/`market_adr`, `rental_revpar`/`market_revpar`/`revpar_index`, `adjusted_occupancy_pct`/`market_occupancy_pct`, `market_penetration_index_pct` (MPI), `median_booking_window`, `booked_nights_pickup_30d`, `potential_revenue_open_inventory`.

**Report-backed pricing layout** (`data.source === 'report'`): KPI cards ([Year] Revenue w/ YoY, Occupancy next-4mo vs market, RevPAR Index, Avg Booking Window, Nights Booked 30d), a revenue **pacing chart** (inline SVG: solid = booked months, muted = pace, tick = same-time-last-year), and the listings table. The legacy live-API layout (`renderKpiCards`/`renderListingsTable`) still renders for fallback clients.
- **`pricelabs_reservations_cache`** (materialized view) — flattened PriceLabs reservations per client: `reservation_key`, `client_id` (= clients.id), `hub_listing_id`, `listing_id`, `listing_name`, `guest_name`, `booked_at`, `check_in`/`check_out`, `number_of_days`, `booking_status` (`booked`/`cancelled`), `booking_channel` (`airbnb`/`vrbo`/`bcom`/`manual`/`others`/null), `rental_revenue`, `total_cost`, `currency`. The same reservation can appear under multiple listing-name mappings — dedupe by `reservation_key`. Feeds the pricing tab's "Recent Reservations" section (`lib/reservations.js`).
- **`seo_metrics_raw`** — 1:1 with the Rankbreeze CSV: `download_date`, `airbnb_id`, `rankbreeze_id`, `listing_name`, `city`, `state`, `country`, `metric`, `guest_count`, `side`, `period`, `value` (RLS enabled)
- **`seo_metrics`** (view) — normalizes `metric`→`metric_key`, `side`→`my`/`similar`, joins `listings` on `airbnb_id` to resolve `hub_listing_id` / `hub_client_id` (null when unmatched), and exposes `raw_id` (= raw table pk, migration 004) for stable pagination. Multiple upload batches coexist (one per `download_date`; the Hub upload replaces same-date rows only) — `lib/seo.js` keeps, per listing, the newest batch that has non-null monthly values (Rankbreeze exports can arrive all-null for unrefreshed listings).

Join chain (SEO): CSV `Airbnb ID` = `listings.airbnb_id` (from `airbnb_link`) → `listings.id` → `listings.client_id` = `clients.id`.

## SEO data shape (from `getClientSeo` / mock)

Per listing: `funnel` (6 stages `{my, similar, ratio}`), `health {above,total}`, `rank {pods[], avg, marketAvg}`, `board` (prev/current/next month per metric), `trend` (12-month my-vs-market). Layout by count: **1** → funnel · **2–7** → cards · **8+** → matrix (`SEO_LAYOUT` in `render.js`). Visual source of truth: [`docs/seo-drafts/`](../seo-drafts/).
