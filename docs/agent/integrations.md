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

- **None.** No inbound webhooks; no OAuth/SSO. The only auth is the per-client URL token validated in `lib/auth.js`.
