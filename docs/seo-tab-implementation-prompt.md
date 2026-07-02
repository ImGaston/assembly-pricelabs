# Implementation prompt — Airbnb SEO tab (Rankbreeze data)

> Paste this into the repo agent. It is the spec for the first MVP of the SEO
> visibility feature. Read `CLAUDE.md` first — follow every existing convention
> (server-rendered HTML, **no client-side JS**, inline SVG charts, design tokens
> in `config/design-tokens.json`, Supabase service-role reads).

---

## 1. Goal

Add a second **tab** to the existing per-client dashboard that shows each
listing's **Airbnb search-funnel performance** (visibility → interest →
conversion) versus similar listings on Airbnb, using data exported from
**Rankbreeze**.

The current dashboard shows PriceLabs revenue/occupancy. This adds a parallel
view of *how guests find and book* each listing. Same client, same URL, same
auth — just a new tab.

The visual design is already drafted and approved. Treat these three files as the
**visual source of truth** (they use the exact RevFactor tokens and the no-JS,
inline-SVG approach — port them into `lib/render.js`):

- `rankbreeze-seo-dashboard-DRAFT.html` — single-listing funnel + metrics board + trend + ranking + the "how to read this funnel" guide with per-step ⓘ tooltips.
- `portfolio-5-properties-DRAFT.html` — small-multiples layout (few listings).
- `portfolio-15-properties-DRAFT.html` — matrix / heatmap layout (many listings).

> These live in the design working folder, not the repo. Ask Gastón for them if
> they are not attached.

---

## 2. MVP scope

**In scope**
- Manual data load: Gastón imports the Rankbreeze CSV into Supabase by hand (Table Editor CSV import). No automated ingestion pipeline yet.
- A new `?tab=seo` view on the existing dashboard route.
- Per-listing funnel (Positioning & Views → Openings & Clicks → Conversion), you-vs-market, with the 3-layer explanation and per-step ⓘ tooltips.
- Portfolio roll-up when the client has more than one listing (matrix for many, small-multiples for few).
- Metrics board (May/Jun/Jul style trend) and the city-rank snapshot.

**Out of scope (later phases)**
- Automated / scheduled ingestion (this MVP = manual load).
- The daily **rank time-series** line chart — we only have a single snapshot per export, so render the rank **by guest count** as a static snapshot, not a trend.
- **Revenue** and **Reviews count** cards (not present in the export; do not fabricate). Revenue could later be derived from occupancy × ADR, flagged as estimated — not now.
- "Weekly / Monthly stays" rank tabs (export only has City search).

---

## 3. The data source (Rankbreeze CSV)

One export file, long format (~44k rows, one metric × month × side per row).
Columns:

| Column | Example | Notes |
|---|---|---|
| `Download Date` | `Jun 25, 2026` | export/snapshot date |
| `Airbnb ID` | `1699266759853743370` | **the join key** — Airbnb listing id |
| `Rankbreeze ID` | `152363` | Rankbreeze internal id (keep for reference) |
| `Listing Name` | `Hot Tub/Fire Pit/…` | |
| `Tags`, `City`, `State/Province`, `Country` | | |
| `Metric` | `First-page impressions` | see metric list below |
| `Guest Count` | `4` | only populated for `Rank (City search)` |
| `Listing (Own/Similar Listings)` | `my listing` / `similar listing` | the "side" |
| `MM-YYYY` | `06-2026` | month bucket; `Rank` rows use the download date instead |
| `Value` | `130334` | numeric |

**Metrics and their funnel layer** (normalize the labels to keys):

| CSV `Metric` | key | funnel layer |
|---|---|---|
| `Rank (City search)` | `city_rank` | 1 · Positioning & Views (snapshot, by guest count) |
| `First-page impressions` | `first_page_impressions` | 1 · Positioning & Views |
| `Click-through rates` | `ctr` | 2 · Openings & Clicks |
| `Views` | `views` | 2 · Openings & Clicks |
| `Wishlists` | `wishlists` | 3 · Conversion |
| `Listing conversion rate` | `booking_rate` | 3 · Conversion (view → booking) |
| `Overall conversion rate` | `overall_conversion` | 3 · Conversion (impression → booking) |
| `Airbnb Occupancy` | `occupancy` | metrics board only |
| `Avg. Daily Rates` | `adr` | metrics board only |

**Period semantics:** the 8 monthly metrics cover `01-2026`…`12-2026`. Past months
are actuals, the current month is partial/month-to-date, future months are pace.
**Default the funnel to the last complete month** and print the period explicitly
(e.g. "Booking Funnel · May 2026"). `Rank (City search)` is a single-day snapshot
(the download date), broken out **by guest count** (1–16).

**side:** map `my listing → "my"`, `similar listing → "similar"`. The funnel and
every color compares `my` vs `similar` (never absolute values).

---

## 4. ⚠️ How the CSV connects to our listings (ID mapping — read carefully)

This is the crux. The CSV is keyed by **Airbnb ID**. Our database keys everything
by the **PriceLabs `listing_id`**. They are different numbers. The bridge is the
`listings.airbnb_link` column, which contains the Airbnb id in its URL.

### The chain

```
Rankbreeze CSV
  └─ Airbnb ID (e.g. 1699266759853743370)
        │  match against the id embedded in…
        ▼
listings.airbnb_link   ->  https://www.airbnb.com/rooms/1699266759853743370
        │  regexp:  /rooms/([0-9]+)
        ▼
listings.id            (uuid)  = hub_listing_id   ← the canonical listing key
        │
        ▼
listings.client_id     (uuid)  = clients.id       ← which client owns it
```

So: **extract the Airbnb id from `airbnb_link`, match it to the CSV's `Airbnb ID`,
and you get `listings.id` (the listing) and `listings.client_id` (the client).**
Everything else in the app already keys off `listings.id` / `clients.id`.

### `listings` table (relevant columns, confirmed live)

`id` (uuid, PK) · `client_id` (uuid → clients.id) · `name` · `listing_id`
(PriceLabs id, text) · **`airbnb_link`** (text, holds the Airbnb id) · `city` ·
`state`.

There is **no dedicated `airbnb_id` column** — derive it from `airbnb_link`.

### Match reality (measured against the current DB)

- 244 listings in `listings`; 240 have an `airbnb_link`; **220** have a parseable `/rooms/{id}`.
- CSV has **218** unique Airbnb IDs.
- **191 (88%) match automatically.** 27 CSV listings do **not** match — either the listing isn't in the Hub, was re-listed under a new Airbnb id, or its `airbnb_link` is missing / non-standard.

Plan for the 27: leave their SEO rows **unlinked** (nullable `hub_listing_id`) and
provide a diagnostic query so Gastón can map them by hand (fix the `airbnb_link`,
or add a manual override row). The dashboard simply skips unlinked rows.

### Recommended implementation of the join

Add a **stored generated column** on `listings` so the match is a cheap indexed
equality join (regex is immutable, so a STORED generated column is valid):

```sql
alter table listings
  add column if not exists airbnb_id text
  generated always as ((regexp_match(airbnb_link, '/rooms/([0-9]+)'))[1]) stored;

create index if not exists idx_listings_airbnb_id on listings(airbnb_id);
```

Then SEO rows resolve with a plain join on `airbnb_id`.

---

## 5. Supabase schema (manual-load friendly)

Keep it minimal and importable straight from the CSV.

**5.1 Raw import table** — columns map 1:1 to the CSV (Gastón imports via Table
Editor → Import data from CSV, mapping each column):

```sql
create table if not exists seo_metrics_raw (
  id            bigserial primary key,
  download_date text,          -- "Jun 25, 2026"
  airbnb_id     text,          -- CSV "Airbnb ID"  ← join key
  rankbreeze_id text,
  listing_name  text,
  city          text,
  state         text,
  country       text,
  metric        text,          -- raw CSV label
  guest_count   int,           -- only for Rank rows
  side          text,          -- "my listing" | "similar listing"
  period        text,          -- CSV "MM-YYYY" (rank rows may hold the date)
  value         numeric
);
create index if not exists idx_seo_raw_airbnb on seo_metrics_raw(airbnb_id);
```

**5.2 Read-time view** — normalizes labels/side and resolves the listing+client:

```sql
create or replace view seo_metrics as
select
  r.download_date,
  r.airbnb_id,
  l.id        as hub_listing_id,   -- null when unmatched (the 27)
  l.client_id as hub_client_id,
  l.name      as listing_name,
  case r.metric
    when 'Rank (City search)'      then 'city_rank'
    when 'First-page impressions'  then 'first_page_impressions'
    when 'Click-through rates'     then 'ctr'
    when 'Views'                   then 'views'
    when 'Wishlists'               then 'wishlists'
    when 'Listing conversion rate' then 'booking_rate'
    when 'Overall conversion rate' then 'overall_conversion'
    when 'Airbnb Occupancy'        then 'occupancy'
    when 'Avg. Daily Rates'        then 'adr'
  end as metric_key,
  case when r.side ilike 'my%' then 'my' else 'similar' end as side,
  nullif(r.period,'') as period,     -- 'MM-YYYY' for monthly; ignore for rank
  r.guest_count,
  r.value
from seo_metrics_raw r
left join listings l on l.airbnb_id = r.airbnb_id;
```

> If multiple exports get loaded over time, add a `snapshot_date date` and filter
> to the latest — for the MVP a single export is fine.

**5.3 Diagnostic — the unmatched 27** (for manual mapping):

```sql
select distinct r.airbnb_id, r.listing_name, r.city
from seo_metrics_raw r
left join listings l on l.airbnb_id = r.airbnb_id
where l.id is null
order by r.listing_name;
```

---

## 6. Backend — `lib/seo.js`

New module mirroring `lib/reports.js` conventions (Supabase singleton, in-memory
cache with TTL, returns a shape the renderer consumes).

- `getClientSeo(client)` → for `client.id`, read `seo_metrics` where
  `hub_client_id = client.id`, group by `hub_listing_id`, and build per listing:
  - `funnel`: for the chosen month, `{ metric_key: { my, similar } }` for
    `first_page_impressions, ctr, views, wishlists, booking_rate, overall_conversion`.
  - `rank`: array of `{ guest_count, position }` (my side, latest snapshot) + an average.
  - `board`: last-3-months (e.g. May/Jun/Jul) `{ metric_key: [{period, value}] }` for the metrics board incl. `occupancy`, `adr`.
  - `layers`: the 3-layer grouping is a render concern; keep the raw keys here.
  - Compute per-stage `my/similar` ratio and an `above/6` health count server-side (reuse the logic from the drafts).
- Return `null` when the client has no SEO coverage (tab shows an empty state).
- Cache with a ~30 min TTL like `reports.js`.

Period selection helper: pick the **latest complete month** present in the data
(current month minus 1), fall back to the latest available.

---

## 7. Render — `lib/render.js`

Port the drafted components. All server-rendered, inline SVG, **no client JS**,
using the `c` / `f` token helpers and existing color helpers
(`performanceColor`, etc.).

New functions:
- `renderTabs(activeTab, client)` — the tab bar ("Pricing" | "SEO Visibility"), rendered as links to `?tab=pricing` / `?tab=seo` (keeps the token query param). No JS needed. (Alternatively a CSS-only radio-tab if you prefer a single request — your call, but links are simplest and cache-cleanly.)
- `renderSeoFunnel(listing, period)` — the tapering SVG funnel (you=cedar / market=walnut), values inside, gold ★ on the winner, per-step ⓘ via SVG `<title>` (cursor:pointer), plus the collapsible "How to read this funnel" 3-layer guide (`<details>`). Copy the copy/tooltips verbatim from `rankbreeze-seo-dashboard-DRAFT.html`.
- `renderSeoMetricsBoard(listing)` — KPI cards with the 3-month trend + ▲/▼.
- `renderSeoTrend(listing, metricKey)` — 12-month you-vs-market SVG (clone `renderPacingChart`).
- `renderRankSnapshot(listing)` — city-rank pods by guest count.
- Portfolio roll-up:
  - `renderSeoPortfolioMatrix(listings)` — the heatmap (sticky listing column, one colored cell per stage vs market, health `x/6`, focus area). Use for **many** listings.
  - `renderSeoPortfolioCards(listings)` — small-multiples ribbons. Use for **few** listings.
  - **Rule:** 1 listing → single funnel; 2–7 → small-multiples cards; 8+ → matrix. (Confirm the threshold with Gastón; make it a constant.)
- `renderSeoTab(client, seo)` → assembles: portfolio roll-up on top, then per-listing detail (funnel + board + trend + rank). Empty state when `seo` is null.

Wire `renderDashboard(client, data, { tab, seo })` to render the pricing body or
the SEO body based on `tab`, keeping header/footer shared.

**Copy language:** English, neutral/formal tone (the internal RevFactor
explanation about "layers" is background only — client-facing copy uses phrasing
like *"What we review:"*, not *"if it's weak"*). Match the drafts exactly.

---

## 8. Route — `app/api/dashboard/[slug]/route.js`

- Read `tab` from the query string (`?tab=seo`, default `pricing`). Auth/token
  validation unchanged.
- When `tab==='seo'`, call `getClientSeo(client)` instead of (or in addition to)
  the report data, and render the SEO body. Keep the same caching headers.
- Demo client (`demo`): add mock SEO data (extend `lib/mock-data.js`) so the tab
  works in the showcase without touching the DB.

---

## 9. Acceptance criteria

1. `?tab=seo` renders the SEO view; `?tab=pricing` (or no param) renders today's dashboard unchanged. Tabs switch via links, no JS.
2. For a real client with matched listings (test with **Leanne Sutton / Carnelian Bay** — client id `4c7618e6-6016-4c4c-9051-03ea62b9f716`, listing "Less than ½ mile to Lake"), the funnel shows correct you-vs-market values for the last complete month, with the period labelled.
3. Each funnel step has a hover ⓘ tooltip; the 3-layer guide renders and collapses.
4. Multi-listing clients get the portfolio roll-up (matrix or small-multiples per the count rule) with per-listing drill-down.
5. Listings whose `airbnb_id` didn't match (the 27) are skipped cleanly — no crashes, no blank rows.
6. No client-side JavaScript; renders inside the Assembly iframe; design tokens respected.
7. `demo` client shows the SEO tab with mock data.

---

## 10. Open decisions to confirm with Gastón

- Portfolio layout threshold (proposed: 1 = funnel, 2–7 = cards, 8+ = matrix).
- Funnel default period: **last complete month** (recommended) vs current month.
- Whether **Wishlists** belongs in layer 3 (Conversion, current) or layer 2 (interest).
- Whether to backfill/repair `airbnb_link` for the 27 unmatched now, or ship with them skipped.
