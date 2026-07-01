-- Airbnb SEO tab (Rankbreeze data) — schema for the manual-load MVP.
--
-- Run this migration in the Supabase SQL editor. Order matters: the generated
-- `airbnb_id` column on `listings` must exist before the `seo_metrics` view
-- references it. After running, import the Rankbreeze CSV into `seo_metrics_raw`
-- via Table Editor → Import data from CSV (map each column 1:1).
--
-- The CSV is keyed by Airbnb ID; our DB keys by the PriceLabs listing_id. The
-- bridge is `listings.airbnb_link` (holds the Airbnb id in a /rooms/{id} URL),
-- extracted into the generated `airbnb_id` column and joined against the CSV.

-- 1. Derive the Airbnb id from the listing's airbnb_link (regex is immutable, so
--    a STORED generated column is valid). Cheap indexed equality join thereafter.
alter table listings
  add column if not exists airbnb_id text
  generated always as ((regexp_match(airbnb_link, '/rooms/([0-9]+)'))[1]) stored;

create index if not exists idx_listings_airbnb_id on listings(airbnb_id);

-- 2. Raw import table — columns map 1:1 to the Rankbreeze CSV (long format,
--    one metric × month × side per row).
create table if not exists seo_metrics_raw (
  id            bigserial primary key,
  download_date text,          -- "Jun 25, 2026" (export/snapshot date)
  airbnb_id     text,          -- CSV "Airbnb ID"  ← join key
  rankbreeze_id text,          -- Rankbreeze internal id (reference)
  listing_name  text,
  city          text,
  state         text,          -- CSV "State/Province"
  country       text,
  metric        text,          -- raw CSV label (normalized in the view)
  guest_count   int,           -- only populated for Rank (City search) rows
  side          text,          -- "my listing" | "similar listing"
  period        text,          -- CSV "MM-YYYY" (rank rows may hold the date)
  value         numeric
);

create index if not exists idx_seo_raw_airbnb on seo_metrics_raw(airbnb_id);

-- 3. Read-time view — normalizes metric labels + side, and resolves the listing
--    and client via the generated airbnb_id join. hub_listing_id is null for the
--    ~27 CSV listings that don't match a Hub listing (the dashboard skips them).
create or replace view seo_metrics as
select
  r.download_date,
  r.airbnb_id,
  l.id        as hub_listing_id,   -- null when unmatched
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
  nullif(r.period, '') as period,     -- 'MM-YYYY' for monthly; ignore for rank
  r.guest_count,
  r.value
from seo_metrics_raw r
left join listings l on l.airbnb_id = r.airbnb_id;

-- Verification 1 — how many CSV listings resolve to a Hub listing/client.
select
  count(distinct airbnb_id)                                    as csv_listings,
  count(distinct airbnb_id) filter (where hub_listing_id is not null) as matched,
  count(distinct airbnb_id) filter (where hub_listing_id is null)     as unmatched
from seo_metrics;

-- Verification 2 (diagnostic) — the unmatched listings, for manual mapping
-- (fix the airbnb_link, or add a manual override row).
select distinct r.airbnb_id, r.listing_name, r.city
from seo_metrics_raw r
left join listings l on l.airbnb_id = r.airbnb_id
where l.id is null
order by r.listing_name;
