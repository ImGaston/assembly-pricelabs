# Integrations

External services, SDKs, and auth. See also:
[project-map](project-map.md) · [conventions](conventions.md) · [performance](performance.md).

## Environment variables

Set in Vercel → Project Settings → Environment Variables, and locally in `.env.local`
(gitignored; template in `.env.example`). **Names only — never store values here.**

| Var | Used by | Client-exposed? |
|---|---|---|
| `PRICELABS_API_KEY` | `lib/pricelabs.js` | no (server-only) |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.js` | yes (public URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (present; app uses service role) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase.js` | **no — bypasses RLS** |
| `ADMIN_PASSWORD` | `lib/admin-auth.js` — shared `/admin` password; also keys the session HMAC (changing it signs everyone out) | no |
| `NEXT_PUBLIC_SITE_URL` | admin share links (default prod URL) | yes |
| `PRICELABS_SERVING_DATABASE_URL` | `lib/serving-db.js` — read-only login to the pricelabs-dashboard DB (PriceLabs Report model only) | **no** |
| `PRICELABS_SERVING_POOL_MAX` | optional, connections per instance (default 3) | no |

The SEO tab needs only the Supabase URL + service-role key. The pricing tab's live
fallback additionally needs `PRICELABS_API_KEY`.

## PriceLabs Customer API

- Base: `https://api.pricelabs.co/v1`. Auth: `?api_key=…` query param (Customer API key, **not** a PAT `patNJTx…`).
- Working: `GET /v1/listings` → all listings for the account (occupancy, ADR, MPI, pickup, `group`). Returns ~488 listings across all clients; filtered per client by `group`.
- Not available with this key: `/v1/reservations`, `/v1/listings/{id}/overrides`, `/v1/getPrices` (404 / invalid).
- Role: **fallback** pricing source for clients not yet in a report run. Details: [`docs/pricelabs-api-reference.md`](../pricelabs-api-reference.md).

## Supabase (the "Hub")

- Project: `revfactorHub`. Accessed via `@supabase/supabase-js` with the **service-role** key (server-side singleton, RLS bypassed).
- Holds the client registry (`clients`, `listings`), the daily PriceLabs **report** ingestion (`report_runs/listings/metrics`, primary pricing source), and the **SEO** tables (`seo_metrics_raw` + `seo_metrics` view).
- Schema changes are hand-run SQL in `migrations/` (not auto-applied). MCP Supabase tools can query it read-only.

## pricelabs-dashboard serving DB (PriceLabs Report model)

- A **separate** Supabase project (Blackbird account, not visible to this repo's Supabase MCP) owned by the sibling repo `pricelabs-dashboard`; written nightly from BigQuery by `pricelabs-sync`'s `web-export` job.
- Read with `postgres` (postgres.js) as the login `dashboard_reader` (SELECT on serving tables only) via `PRICELABS_SERVING_DATABASE_URL` — transaction pooler (6543), `prepare: false`, password letters/digits only. Never the anon key.
- Tables read: `listings`, `listing_owners`, `listing_report_summary`, `listing_monthly_performance`, `listing_market_metrics`, `listing_recent_bookings`, `listing_prices`, `listing_calendar_reservations`, `listing_neighborhood_series/summary`, `listing_metrics_summary`, `listing_price_reason_factors/summary`. Schema lives in that repo's `supabase/migrations/`.
- Client mapping: `listing_owners.owner_key` (the client UUID in the operations listing mapping) = Hub `clients.id`; fallback matches Hub `listings.listing_id` → `listings.listing_id`. **Unverified against real data** as of 2026-10-12.
- Missing env var → the model returns 503 (other models unaffected).

## Rankbreeze (SEO source)

- **Manual** pipeline (no API integration): export the Rankbreeze CSV (`listing-metrics-YYYY-MM-DD.csv`, long format, ~44k rows) and import it into `seo_metrics_raw` via the Supabase Table Editor.
- Keyed by **Airbnb ID**, joined to `listings.airbnb_id`. ~191/218 listings match automatically; unmatched rows are skipped by the dashboard. Metric labels must match the `CASE` in the `seo_metrics` view (see `migrations/003`).
- No automated/scheduled ingestion yet (future phase).

## Assembly.com

- Consumes the dashboard as an **iframe embed**: `…/api/dashboard/[client-uuid]?token=[dashboard_token]`. The client never sees the raw URL.
- Enabled by the iframe headers in `vercel.json` + the route. Setup: [`docs/assembly-embed-setup.md`](../assembly-embed-setup.md).
- Future: Assembly Custom App SDK (auto-identify client, drop the URL token).

## Vercel

- Hosts the app at `assembly-pricelabs.vercel.app`. Deploy = `git push origin main` (GitHub integration). Region `iad1`.

## Webhooks / external auth

- No inbound webhooks. Client dashboards authenticate only with the per-dashboard URL token (`lib/auth.js`).
- `/admin` uses a single shared password (`ADMIN_PASSWORD`), not Supabase Auth — the Hub's Auth is reserved for the Hub app.
