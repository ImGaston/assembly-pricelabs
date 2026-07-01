import { getSupabase } from './supabase.js';

/**
 * SEO (Airbnb search-funnel) data layer.
 *
 * Data originates from a manual Rankbreeze CSV export loaded into Supabase
 * (`seo_metrics_raw`) and read back through the `seo_metrics` view, which
 * normalizes metric labels + side and resolves each row to a Hub listing/client
 * via the generated `listings.airbnb_id` join (see migrations/003_seo_metrics.sql).
 *
 * Unlike the PriceLabs report, every metric is a `my` vs `similar` pair — the
 * funnel and all coloring compare the two, never absolute values. Monthly metrics
 * span 01–12 of the export year; `city_rank` is a single snapshot broken out by
 * guest count (1–16).
 *
 * Mirrors lib/reports.js conventions: Supabase singleton, in-memory cache w/ TTL,
 * returns a render-ready shape (or null when the client has no SEO coverage).
 */

const clientCache = new Map();
const TTL = 30 * 60 * 1000; // export refreshes rarely; 30 min like reports.js

// The six funnel stages, ordered visibility → interest → conversion.
const FUNNEL_KEYS = [
  'first_page_impressions', // 1 · Positioning & Views
  'ctr',                    // 2 · Openings & Clicks
  'views',                  // 2 · Openings & Clicks
  'wishlists',              // 3 · Conversion
  'booking_rate',           // 3 · Conversion (view → booking)
  'overall_conversion',     // 3 · Conversion (impression → booking)
];

// Metrics shown on the metrics board (my-side monthly trend).
const BOARD_KEYS = [...FUNNEL_KEYS, 'occupancy', 'adr'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function num(x) {
  return x == null ? null : Number(x);
}

// 'MM-YYYY' -> { year, month, key }. Returns null for rank rows / blank periods.
function parsePeriod(p) {
  if (!p) return null;
  const parts = String(p).split('-');
  if (parts.length !== 2) return null;
  const month = parseInt(parts[0], 10);
  const year = parseInt(parts[1], 10);
  if (!month || !year) return null;
  return { year, month, key: year * 100 + month };
}

// year*100+month -> 'MM-YYYY'
function keyToPeriod(k) {
  if (k == null) return null;
  const year = Math.floor(k / 100);
  const month = k % 100;
  return `${String(month).padStart(2, '0')}-${year}`;
}

function periodLabel(k) {
  if (k == null) return '';
  const year = Math.floor(k / 100);
  const month = k % 100;
  return `${MONTH_NAMES[month - 1] || month} ${year}`;
}

// Shift a year*100+month key by ±N months, rolling the year.
function addMonths(key, delta) {
  if (key == null) return null;
  let year = Math.floor(key / 100);
  let month = (key % 100) + delta;
  while (month > 12) { month -= 12; year += 1; }
  while (month < 1) { month += 12; year -= 1; }
  return year * 100 + month;
}

/** Latest complete month (current month − 1), respecting a Jan → prev-Dec roll. */
function lastCompleteMonthKey() {
  const now = new Date();
  let month = now.getMonth(); // 0-based current == previous month's 1-based number
  let year = now.getFullYear();
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return year * 100 + month;
}

/**
 * Pick the funnel period: the latest complete month if present, else the latest
 * available monthly period ≤ that target, else the latest period overall. Returns
 * null when the client has no monthly data at all (rank-only).
 */
function chooseFunnelKey(monthlyKeys) {
  if (monthlyKeys.length === 0) return null;
  const sorted = [...monthlyKeys].sort((a, b) => a - b);
  const target = lastCompleteMonthKey();
  if (sorted.includes(target)) return target;
  const atOrBefore = sorted.filter((k) => k <= target);
  if (atOrBefore.length) return atOrBefore[atOrBefore.length - 1];
  return sorted[sorted.length - 1];
}

/** Period keys (≤ chosen) present across a listing's monthly metrics, last 3. */
function last3Keys(monthly, chosenKey) {
  const set = new Set();
  for (const key of Object.keys(monthly)) {
    for (const k of monthly[key].keys()) {
      if (chosenKey == null || k <= chosenKey) set.add(k);
    }
  }
  return [...set].sort((a, b) => a - b).slice(-3);
}

/** Build the render shape for one listing from its view rows. */
function buildListing(hubListingId, listRows, chosenKey) {
  const name = listRows.find((r) => r.listing_name)?.listing_name || String(hubListingId);

  // Index monthly metrics: metric_key -> Map(periodKey -> {my, similar}).
  const monthly = {};
  const rankRows = [];
  for (const r of listRows) {
    if (r.metric_key === 'city_rank') {
      rankRows.push(r);
      continue;
    }
    const p = parsePeriod(r.period);
    if (!p) continue;
    if (!monthly[r.metric_key]) monthly[r.metric_key] = new Map();
    const bucket = monthly[r.metric_key].get(p.key) || { my: null, similar: null };
    if (r.side === 'my') bucket.my = num(r.value);
    else bucket.similar = num(r.value);
    monthly[r.metric_key].set(p.key, bucket);
  }

  // Funnel for the chosen period + health count (stages where my ≥ similar).
  const funnel = {};
  let above = 0;
  for (const key of FUNNEL_KEYS) {
    const bucket = (chosenKey != null && monthly[key]?.get(chosenKey)) || { my: null, similar: null };
    const { my, similar } = bucket;
    const ratio =
      my != null && similar != null && similar !== 0 ? +(my / similar).toFixed(3) : null;
    funnel[key] = { my, similar, ratio };
    if (my != null && similar != null && my >= similar) above += 1;
  }

  // Board: prev / current / next month window (e.g. May / Jun / Jul), my-side
  // values per board metric. Falls back to the last 3 available when no chosen.
  const windowKeys =
    chosenKey != null
      ? [addMonths(chosenKey, -1), chosenKey, addMonths(chosenKey, 1)]
      : last3Keys(monthly, chosenKey);
  const board = {};
  for (const key of BOARD_KEYS) {
    board[key] = windowKeys.map((k) => {
      const b = monthly[key]?.get(k);
      return {
        period: keyToPeriod(k),
        label: MONTH_SHORT[(k % 100) - 1] || String(k % 100),
        value: b ? b.my : null,
        isNow: k === chosenKey,
      };
    });
  }

  // Trend: 12-month my-vs-similar series per available metric_key.
  const trend = {};
  for (const key of Object.keys(monthly)) {
    const entries = [...monthly[key].entries()].sort((a, b) => a[0] - b[0]);
    trend[key] = entries.map(([k, b]) => ({ period: keyToPeriod(k), my: b.my, similar: b.similar }));
  }

  // Rank: my-side city_rank snapshot, by guest count, + average position. When
  // the export carries a similar-side rank, expose the market average too.
  const pods = rankRows
    .filter((r) => r.side === 'my' && r.guest_count != null)
    .map((r) => ({ guest_count: Number(r.guest_count), position: num(r.value) }))
    .sort((a, b) => a.guest_count - b.guest_count);
  const positions = pods.map((p) => p.position).filter((v) => v != null);
  const avg = positions.length
    ? +(positions.reduce((s, v) => s + v, 0) / positions.length).toFixed(1)
    : null;
  const marketPositions = rankRows
    .filter((r) => r.side === 'similar' && r.guest_count != null)
    .map((r) => num(r.value))
    .filter((v) => v != null);
  const marketAvg = marketPositions.length
    ? +(marketPositions.reduce((s, v) => s + v, 0) / marketPositions.length).toFixed(1)
    : null;

  return {
    hubListingId,
    listingId: hubListingId,
    name,
    city: '',
    funnel,
    health: { above, total: FUNNEL_KEYS.length },
    rank: { pods, avg, marketAvg },
    board,
    trend,
  };
}

/**
 * Build the SEO data shape for a client. Returns null when the client has no SEO
 * coverage in the loaded export (caller renders an empty state).
 *
 * @param {Object} client - Canonical client from lib/clients.js (id === hub_client_id)
 * @returns {Promise<Object|null>} SEO data shape consumed by lib/render.js
 */
export async function getClientSeo(client) {
  const cached = clientCache.get(client.id);
  if (cached && Date.now() - cached.timestamp < TTL) return cached.data;

  const sb = getSupabase();
  const { data: rows, error } = await sb
    .from('seo_metrics')
    .select('hub_listing_id, listing_name, metric_key, side, period, guest_count, value, download_date')
    .eq('hub_client_id', client.id);

  if (error) throw error;
  if (!rows || rows.length === 0) return null;

  // Group by listing; skip unmatched / metric-less rows.
  const byListing = new Map();
  const monthlyKeys = new Set();
  for (const r of rows) {
    if (!r.hub_listing_id || !r.metric_key) continue;
    if (!byListing.has(r.hub_listing_id)) byListing.set(r.hub_listing_id, []);
    byListing.get(r.hub_listing_id).push(r);
    const p = parsePeriod(r.period);
    if (p && r.metric_key !== 'city_rank') monthlyKeys.add(p.key);
  }
  if (byListing.size === 0) return null;

  const chosenKey = chooseFunnelKey([...monthlyKeys]);
  const listings = [...byListing.entries()].map(([id, listRows]) =>
    buildListing(id, listRows, chosenKey)
  );

  const rawDate = rows.find((r) => r.download_date)?.download_date;
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const fetchedAt =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();

  const data = {
    source: 'seo',
    isUsingMockData: false,
    fetchedAt,
    period: keyToPeriod(chosenKey),
    periodLabel: periodLabel(chosenKey),
    listings,
  };

  clientCache.set(client.id, { data, timestamp: Date.now() });
  return data;
}

export function clearSeoCache() {
  clientCache.clear();
}
