import { servingDb, plain } from './serving-db.js';

/**
 * Data layer for the "PriceLabs Report" model — reads the pricelabs-dashboard
 * serving tables (see lib/serving-db.js). Every per-listing figure arrives
 * computed by the nightly export; this module only selects and rolls up.
 *
 * Client → listings: `listing_owners.owner_key` is the client's UUID from the
 * operations listing mapping. When nothing matches the Hub client id, fall
 * back to the Hub client's PriceLabs listing ids (`listings.listing_id`).
 */

const cache = new Map();
const TTL = 30 * 60 * 1000; // the serving tables refresh nightly

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < TTL) return hit.data;
  const data = await load();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

export function clearServingCache() {
  cache.clear();
}

// PriceLabs sometimes names a listing with no letters or digits ("·").
function isUnnamed(name) {
  return !name || !/[\p{L}\p{N}]/u.test(name);
}

/** Mapping name → PriceLabs name → listing id. */
export function reportName(mappedName, pricelabsName, listingId) {
  if (!isUnnamed(mappedName)) return mappedName;
  return isUnnamed(pricelabsName) ? String(listingId) : pricelabsName;
}

async function resolveOwned(sql, client) {
  let owned = plain(await sql`
    select listing_key, listing_name from listing_owners where owner_key = ${client.id}`);
  if (owned.length === 0 && client.listingIds?.length) {
    owned = plain(await sql`
      select l.listing_key, o.listing_name
      from listings l left join listing_owners o on o.listing_key = l.listing_key
      where l.listing_id in ${sql(client.listingIds.map(String))}`);
  }
  return owned;
}

/**
 * Portfolio overview data, or null when the client has no listings in the
 * serving database.
 */
export async function getServingPortfolio(client) {
  return cached(`portfolio:${client.id}`, async () => {
    const sql = servingDb();
    const owned = await resolveOwned(sql, client);
    if (owned.length === 0) return null;
    const keys = owned.map((o) => o.listing_key);
    const mapped = new Map(owned.map((o) => [o.listing_key, o.listing_name]));

    const [listings, summaries, monthly, occupancy, recent] = await Promise.all([
      sql`select * from listings where listing_key in ${sql(keys)} order by name asc`,
      sql`select * from listing_report_summary where listing_key in ${sql(keys)}`,
      sql`select * from listing_monthly_performance where listing_key in ${sql(keys)} order by month asc`,
      sql`select * from listing_market_metrics
          where listing_key in ${sql(keys)} and metric = 'adjusted_occupancy' and dfd = 120`,
      sql`select * from listing_recent_bookings
          where listing_key in ${sql(keys)} and booked_date is not null
          order by booked_date desc limit 10`,
    ]);

    const rows = plain(listings);
    if (rows.length === 0) return null;
    const syncedAt = rows.map((l) => l.synced_at).filter(Boolean).sort().pop() || null;

    return {
      source: 'serving',
      fetchedAt: syncedAt,
      isUsingMockData: false,
      listings: rows.map((l) => ({
        key: l.listing_key,
        listingId: l.listing_id,
        name: reportName(mapped.get(l.listing_key), l.name, l.listing_id),
        // The calendar tells this listing's bookings from a sibling unit's by
        // comparing PriceLabs names, so keep the PriceLabs name too.
        pmsName: isUnnamed(l.name) ? String(l.listing_id) : l.name,
        city: [l.city_name, l.state].filter(Boolean).join(', '),
        bedrooms: l.no_of_bedrooms,
      })),
      summaries: plain(summaries),
      monthly: plain(monthly),
      occupancy: plain(occupancy),
      recent: plain(recent),
    };
  });
}

/**
 * Calendar data for the standard model's drill-down, keyed by the Hub's
 * PriceLabs listing id. Null when the listing isn't in the serving DB.
 */
export async function getServingListingById(client, listingId) {
  const portfolio = await getServingPortfolio(client);
  const listing = portfolio?.listings.find((l) => String(l.listingId) === String(listingId));
  if (!listing) return null;
  return { listing, ld: await getServingListing(listing.key) };
}

/** Everything one listing's report needs. Call only for keys the client owns. */
export async function getServingListing(listingKey) {
  return cached(`listing:${listingKey}`, async () => {
    const sql = servingDb();
    const [
      monthly, bookings, prices, reservations, neighborhoodSeries, neighborhoodSummary,
      marketMetrics, metricsSummary, priceReasonFactors, priceReasonSummaries,
    ] = await Promise.all([
      sql`select * from listing_monthly_performance where listing_key = ${listingKey} order by month asc`,
      sql`select * from listing_recent_bookings where listing_key = ${listingKey} order by booked_date desc`,
      sql`select * from listing_prices where listing_key = ${listingKey} order by price_date asc`,
      sql`select * from listing_calendar_reservations where listing_key = ${listingKey} order by check_in asc`,
      sql`select * from listing_neighborhood_series where listing_key = ${listingKey} order by chart asc, x_order asc`,
      sql`select * from listing_neighborhood_summary where listing_key = ${listingKey} limit 1`,
      sql`select * from listing_market_metrics where listing_key = ${listingKey} order by dfd asc`,
      sql`select * from listing_metrics_summary where listing_key = ${listingKey} limit 1`,
      sql`select * from listing_price_reason_factors where listing_key = ${listingKey} order by price_date asc, sort_order asc`,
      sql`select * from listing_price_reason_summary where listing_key = ${listingKey} order by price_date asc`,
    ]);
    return {
      monthly: plain(monthly),
      bookings: plain(bookings),
      prices: plain(prices),
      reservations: plain(reservations),
      neighborhoodSeries: plain(neighborhoodSeries),
      neighborhoodSummary: plain(neighborhoodSummary)[0] || null,
      marketMetrics: plain(marketMetrics),
      metricsSummary: plain(metricsSummary)[0] || null,
      priceReasonFactors: plain(priceReasonFactors),
      priceReasonSummaries: plain(priceReasonSummaries),
    };
  });
}
