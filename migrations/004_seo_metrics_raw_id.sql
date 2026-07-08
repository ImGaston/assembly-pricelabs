-- Expose the raw row id on the seo_metrics view so readers can paginate with a
-- stable order (PostgREST caps each response at 1000 rows; lib/seo.js pages by
-- raw_id). CREATE OR REPLACE VIEW allows appending a column at the end.
--
-- Applied to the Hub project on 2026-07-08.
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
  r.value,
  r.id as raw_id
from seo_metrics_raw r
left join listings l on l.airbnb_id = r.airbnb_id;
