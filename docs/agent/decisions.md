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
