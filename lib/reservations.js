import { getSupabase } from './supabase.js';

/**
 * Recent reservations data layer.
 *
 * Reads the `pricelabs_reservations_cache` materialized view (Hub project),
 * which flattens PriceLabs reservation pulls per client. The dashboard shows
 * the latest bookings as a secondary section, so failures here degrade to an
 * empty list instead of breaking the whole page.
 */

const cache = new Map();
const TTL = 30 * 60 * 1000;

function num(x) {
  return x == null ? null : Number(x);
}

// Shared fetch: newest confirmed bookings for a client, optionally narrowed to
// one PriceLabs listing id. Over-fetches because the view can hold the same
// reservation under more than one listing-name mapping — dedupe by
// reservation_key before slicing.
async function fetchReservations(client, listingId, limit) {
  const cacheKey = `${client.id}|${listingId || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TTL) return cached.data;

  const sb = getSupabase();
  let query = sb
    .from('pricelabs_reservations_cache')
    .select(
      'reservation_key, listing_id, listing_name, booked_at, check_in, check_out, number_of_days, booking_channel, rental_revenue, currency, booking_window_days'
    )
    .eq('client_id', client.id)
    .eq('booking_status', 'booked')
    .order('booked_at', { ascending: false })
    .limit(limit * 4);
  if (listingId != null) query = query.eq('listing_id', String(listingId));

  const { data, error } = await query;

  if (error) {
    // Secondary section: log and render nothing rather than 500 the dashboard.
    console.error('Reservations fetch error:', error);
    return [];
  }

  const overrides = client.nameOverrides || {};
  const seen = new Set();
  const reservations = [];
  for (const r of data || []) {
    const key = r.reservation_key || `${r.listing_id}|${r.booked_at}|${r.check_in}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const id = String(r.listing_id || '');
    const nights = num(r.number_of_days);
    const revenue = num(r.rental_revenue);
    reservations.push({
      listingId: id,
      listingName: overrides[id]?.name || r.listing_name || id,
      bookedAt: r.booked_at,
      checkIn: r.check_in,
      checkOut: r.check_out,
      nights,
      channel: r.booking_channel,
      revenue,
      adr: revenue != null && nights > 0 ? revenue / nights : null,
      bookingWindow: num(r.booking_window_days),
      currency: r.currency || 'USD',
    });
    if (reservations.length >= limit) break;
  }

  cache.set(cacheKey, { data: reservations, timestamp: Date.now() });
  return reservations;
}

/**
 * Latest confirmed reservations across a client's portfolio.
 * @param {Object} client - Canonical client from lib/clients.js (id === client_id)
 */
export async function getClientReservations(client, limit = 6) {
  return fetchReservations(client, null, limit);
}

/**
 * Latest confirmed reservations for one listing (PriceLabs listing id).
 * @param {Object} client - Canonical client from lib/clients.js (id === client_id)
 * @param {string} listingId - PriceLabs listing id (matches report listingId)
 */
export async function getListingReservations(client, listingId, limit = 6) {
  return fetchReservations(client, listingId, limit);
}

export function clearReservationsCache() {
  cache.clear();
}
