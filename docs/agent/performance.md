# Performance

Caching, hotspots, and perf notes. See also:
[project-map](project-map.md) · [integrations](integrations.md) · [decisions](decisions.md).

## Caching (two layers)

**1. In-memory (per serverless instance, volatile — resets on cold start):**

| Module | Key | TTL |
|---|---|---|
| `lib/pricelabs.js` | `listings:all` (full account fetch) | 6 h |
| `lib/reports.js` | latest run + per `client.id` | 30 min |
| `lib/seo.js` | per `client.id` | 30 min |
| `lib/clients.js` | per client id | 10 min |

All use the same `Map` + timestamp/TTL pattern. Underlying data (PriceLabs report,
Rankbreeze export) refreshes at most daily, so these TTLs are generous.

**2. Vercel CDN (`Cache-Control` from the route):**
- With data: `s-maxage=21600, stale-while-revalidate=3600` (6 h edge cache, 1 h stale).
- Empty portfolio: `no-store` (don't cache an empty dashboard).

## Loading states

- Not applicable in the usual SPA sense — pages are fully server-rendered, so the
  browser gets complete HTML with no spinners or client fetches. "Slowness" = the
  serverless render time, mitigated by the caches above.

## Sensitive endpoints / queries

- **PriceLabs `GET /v1/listings`** returns ~488 listings for the whole account, then filters by group. Fetched once and cached 6 h — avoid calling it per client.
- **`getClientReport`** joins `report_listings` + `report_metrics` (12 months/listing) — cached 30 min per client.
- **`getClientSeo`** reads the `seo_metrics` view (source table grows by ~48k rows per upload batch) filtered by `hub_client_id`; the join rides on the indexed generated `listings.airbnb_id`. Cached 30 min per client. **PostgREST caps every response at 1000 rows** — the fetch pages via `.order('raw_id').range(...)` in 1000-row chunks (largest client ≈ 15 pages). Any new Supabase read that can exceed 1000 rows must paginate the same way or it silently truncates.

## Recommendations

- Keep new external calls behind the same Map-cache-with-TTL pattern; don't fetch inside render helpers.
- Index any new column used in a `where`/join on large tables (e.g. `idx_listings_airbnb_id`, `idx_seo_raw_airbnb`).
- Preserve the CDN cache headers; only use `no-store` for empty/error responses.
- If a future feature needs cross-instance cache consistency, revisit — current caches are per-instance and intentionally simple for the MVP.
