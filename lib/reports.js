import { getSupabase } from './supabase.js';

/**
 * Report data layer.
 *
 * The Hub runs a daily ingestion pipeline that pulls a rich PriceLabs performance
 * report into Supabase (tables `report_runs`, `report_listings`, `report_metrics`).
 * Unlike the live PriceLabs `/v1/listings` snapshot, this gives 12 monthly rows per
 * listing (past months = actuals, future months = pace) with revenue, RevPAR,
 * occupancy, MPI, booking window and pickup — each with year-over-year comparisons.
 *
 * This module is the primary data source for the dashboard. `lib/pricelabs.js`
 * (live API) remains as a fallback for clients not yet covered by a report run.
 */

const runCache = { id: null, completedAt: null, timestamp: 0 };
const clientCache = new Map();
const TTL = 30 * 60 * 1000; // report refreshes once per day; 30 min is plenty

function num(x) {
  return x == null ? null : Number(x);
}

/** Resolve the most recent completed report run. */
async function getLatestRun() {
  if (runCache.id && Date.now() - runCache.timestamp < TTL) {
    return { id: runCache.id, completedAt: runCache.completedAt };
  }

  const sb = getSupabase();
  const { data, error } = await sb
    .from('report_runs')
    .select('id, completed_at')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  runCache.id = data.id;
  runCache.completedAt = data.completed_at;
  runCache.timestamp = Date.now();
  return { id: data.id, completedAt: data.completed_at };
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function mapMetricRow(m) {
  const [year, monthNum] = String(m.period).split('-').map((v) => parseInt(v, 10));
  const revenue = num(m.rental_revenue);
  const revenueStly = num(m.rental_revenue_stly);
  let revenueYoy = num(m.rental_revenue_stly_yoy_pct);
  if (revenueYoy == null && revenue != null && revenueStly) {
    revenueYoy = ((revenue - revenueStly) / revenueStly) * 100;
  }

  return {
    period: m.period,
    year,
    monthNum,
    label: MONTH_LABELS[monthNum - 1] || String(monthNum),
    revenue,
    revenueStly,
    revenueYoy,
    adr: num(m.rental_adr),
    marketAdr: num(m.market_adr),
    revpar: num(m.rental_revpar),
    marketRevpar: num(m.market_revpar),
    revparIndex: num(m.revpar_index),
    occ: num(m.adjusted_occupancy_pct),
    marketOcc: num(m.market_occupancy_pct),
    mpi: num(m.market_penetration_index_pct),
    bookingWindow: num(m.median_booking_window),
    pickup30: num(m.booked_nights_pickup_30d),
    potentialRevenue: num(m.potential_revenue_open_inventory),
  };
}

/**
 * Build the report-backed data shape for a client. Returns null when the client
 * has no coverage in the latest run (caller should fall back to the live API).
 *
 * @param {Object} client - Canonical client from lib/clients.js (id === hub_client_id)
 * @returns {Promise<Object|null>} Report data shape consumed by lib/render.js
 */
export async function getClientReport(client) {
  const cached = clientCache.get(client.id);
  if (cached && Date.now() - cached.timestamp < TTL) return cached.data;

  const run = await getLatestRun();
  if (!run) return null;

  const sb = getSupabase();
  const { data: listingRows, error: listingErr } = await sb
    .from('report_listings')
    .select('listing_id, listing_name, city, bedroom_count, group_name')
    .eq('hub_client_id', client.id)
    .eq('report_run_id', run.id);

  if (listingErr) throw listingErr;

  // Sub-units of a multi-unit parent (only a couple exist, all empty) — the parent
  // already represents them, so drop them to avoid an inflated listing count.
  const listings = (listingRows || []).filter(
    (l) => l.listing_id && !String(l.listing_id).startsWith('_units_')
  );
  if (listings.length === 0) return null;

  const listingIds = listings.map((l) => String(l.listing_id));
  const { data: metricRows, error: metricErr } = await sb
    .from('report_metrics')
    .select(
      'listing_id, period, rental_revenue, rental_revenue_stly, rental_revenue_stly_yoy_pct, ' +
        'rental_adr, market_adr, rental_revpar, market_revpar, revpar_index, ' +
        'adjusted_occupancy_pct, market_occupancy_pct, market_penetration_index_pct, ' +
        'median_booking_window, booked_nights_pickup_30d, potential_revenue_open_inventory'
    )
    .eq('report_run_id', run.id)
    .in('listing_id', listingIds);

  if (metricErr) throw metricErr;

  const monthsByListing = new Map();
  for (const m of metricRows || []) {
    const key = String(m.listing_id);
    if (!monthsByListing.has(key)) monthsByListing.set(key, []);
    monthsByListing.get(key).push(mapMetricRow(m));
  }

  const overrides = client.nameOverrides || {};
  const enriched = listings.map((l) => {
    const id = String(l.listing_id);
    const override = overrides[id] || {};
    const months = (monthsByListing.get(id) || []).sort((a, b) => a.monthNum - b.monthNum);
    const cityFromReport = l.city || '';
    return {
      listingId: id,
      name: override.name || l.listing_name || id,
      city: override.city || cityFromReport,
      bedrooms: l.bedroom_count || null,
      group: l.group_name || '',
      months,
    };
  });

  // Year of the report (all rows share one calendar year in current runs).
  const year =
    enriched.find((l) => l.months.length)?.months[0].year || new Date().getFullYear();

  const now = new Date();
  const asOf = now.getFullYear() * 100 + (now.getMonth() + 1);

  const data = {
    source: 'report',
    isUsingMockData: false,
    fetchedAt: run.completedAt,
    year,
    asOf, // numeric YYYYMM used to split actuals vs forecast
    listings: enriched,
  };

  clientCache.set(client.id, { data, timestamp: Date.now() });
  return data;
}

export function clearReportCache() {
  runCache.id = null;
  clientCache.clear();
}
