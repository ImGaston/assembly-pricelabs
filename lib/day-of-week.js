import { getSupabase } from './supabase.js';

/**
 * Day-of-week insights for a calendar year, built from the reservations matview.
 * Each confirmed reservation's rental revenue is spread evenly over its nights,
 * and every night is bucketed by weekday. Availability (for occupancy/RevPAR) is
 * listings × occurrences of that weekday in the year, so future nights count as
 * on-the-books, matching the report's full-year totals.
 */

const cache = new Map();
const TTL = 30 * 60 * 1000;
const PAGE_SIZE = 1000;
const DAY_MS = 86400000;
export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function utcDay(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Count of each weekday (0=Sun) between two UTC day stamps, end exclusive. */
function weekdayCounts(startMs, endMs) {
  const counts = new Array(7).fill(0);
  for (let t = startMs; t < endMs; t += DAY_MS) counts[new Date(t).getUTCDay()] += 1;
  return counts;
}

/**
 * Turn bucketed nights/revenue into the render shape.
 * @param {{nights:number[], revenue:number[]}} buckets - indexed by weekday 0..6
 */
export function buildDayOfWeek(buckets, listingCount, year) {
  const available = weekdayCounts(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)).map(
    (n) => n * listingCount
  );
  const rows = DOW_NAMES.map((name, i) => ({
    dow: i,
    name,
    revenue: buckets.revenue[i],
    nights: buckets.nights[i],
    available: available[i],
    revpar: available[i] ? buckets.revenue[i] / available[i] : null,
    occ: available[i] ? (buckets.nights[i] / available[i]) * 100 : null,
  }));
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const nights = rows.reduce((s, r) => s + r.nights, 0);
  const avail = rows.reduce((s, r) => s + r.available, 0);
  return {
    year,
    rows,
    total: { revenue, revpar: avail ? revenue / avail : null, occ: avail ? (nights / avail) * 100 : null },
  };
}

/**
 * @param {Object} client - Hub client (client.id = clients.id)
 * @param {{ year: number, listingIds: string[] }} opts - PriceLabs listing ids in scope
 * @returns {Promise<Object|null>} null when there are no reservations or on error
 */
export async function getClientDayOfWeek(client, { year, listingIds }) {
  const cacheKey = `${client.id}|${year}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TTL) return cached.data;

  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);
  const inScope = new Set((listingIds || []).map(String));

  const sb = getSupabase();
  const rows = [];
  try {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await sb
        .from('pricelabs_reservations_cache')
        .select('reservation_key, listing_id, check_in, check_out, rental_revenue')
        .eq('client_id', client.id)
        .eq('booking_status', 'booked')
        .lt('check_in', `${year + 1}-01-01`)
        .gt('check_out', `${year}-01-01`)
        .order('reservation_key')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
  } catch (err) {
    // Secondary section: log and hide it rather than 500 the dashboard.
    console.error('Day-of-week fetch error:', err.message || err);
    return null;
  }

  const buckets = { nights: new Array(7).fill(0), revenue: new Array(7).fill(0) };
  const seen = new Set();
  for (const r of rows) {
    if (inScope.size && !inScope.has(String(r.listing_id))) continue;
    const key = r.reservation_key || `${r.listing_id}|${r.check_in}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const start = utcDay(r.check_in);
    const end = utcDay(r.check_out);
    const nights = Math.round((end - start) / DAY_MS);
    if (!(nights > 0)) continue;
    const perNight = (Number(r.rental_revenue) || 0) / nights;
    for (let t = Math.max(start, yearStart); t < Math.min(end, yearEnd); t += DAY_MS) {
      const d = new Date(t).getUTCDay();
      buckets.nights[d] += 1;
      buckets.revenue[d] += perNight;
    }
  }

  const data = seen.size ? buildDayOfWeek(buckets, inScope.size || 1, year) : null;
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
