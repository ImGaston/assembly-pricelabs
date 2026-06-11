/**
 * PriceLabs Customer API client.
 *
 * Confirmed working endpoint:
 *   GET /v1/listings?api_key=...  → all listings with occupancy, market data, ADR, MPI
 *
 * Endpoints NOT available on this API key:
 *   - /v1/reservations  (404)
 *   - /v1/listings/{id}/overrides  (invalid request)
 *   - /v1/getPrices  (404)
 *
 * Falls back to mock data when PRICELABS_API_KEY is not set or API fails.
 */

import { generateMockData } from './mock-data.js';

// --- In-memory cache ---
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// --- API helpers ---

const BASE_URL = 'https://api.pricelabs.co/v1';

async function apiGet(endpoint, params = {}) {
  const apiKey = process.env.PRICELABS_API_KEY;
  if (!apiKey) throw new Error('PRICELABS_API_KEY not set');

  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`PriceLabs API ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// --- API calls ---

/**
 * GET /v1/listings — fetch all listings in the account.
 * Returns rich data including occupancy, market occupancy, ADR, MPI, etc.
 */
async function getAllListings() {
  const cacheKey = 'listings:all';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiGet('/listings');
    const listings = data?.listings || [];
    setCache(cacheKey, listings);
    return listings;
  } catch (err) {
    console.error('getAllListings error:', err.message);
    return null;
  }
}

// --- Mapping helpers ---

/**
 * Parse percentage string like "80 %" to a number (80).
 */
function parsePercent(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace('%', '').trim());
  return isNaN(n) ? null : n;
}

/**
 * Clean up listing name — remove the " - DuplicateName" suffix that
 * PriceLabs appends (e.g. "Bear Bottom -- VIEWS/Hot Tub - Bear Bottom").
 */
function cleanListingName(rawName) {
  if (!rawName) return '';
  // Remove " - ShortName" at end (PriceLabs appends PMS listing title)
  const dashIdx = rawName.lastIndexOf(' - ');
  if (dashIdx > 0) {
    return rawName.substring(0, dashIdx).trim();
  }
  return rawName.trim();
}

/**
 * Extract the short name before the " -- " separator.
 * "Bear Bottom -- VIEWS/Hot Tub/Game Room" → "Bear Bottom"
 */
function shortListingName(rawName) {
  if (!rawName) return '';
  const cleaned = cleanListingName(rawName);
  const ddIdx = cleaned.indexOf(' -- ');
  if (ddIdx > 0) {
    return cleaned.substring(0, ddIdx).trim();
  }
  // Also try " | " separator (Hospitable style: "The Windvale | NY | Alicia")
  const pipeIdx = cleaned.indexOf(' | ');
  if (pipeIdx > 0) {
    return cleaned.substring(0, pipeIdx).trim();
  }
  return cleaned;
}

/**
 * Map a PriceLabs API listing to our canonical internal shape.
 *
 * Important API fields:
 *   adjusted_occupancy_next_30, market_adjusted_occupancy_next_30
 *   (these are "adjusted" occupancy that accounts for blocked dates)
 *   mpi_next_30, adr_past_30, adr_next_30
 *   last_booked_date, booking_pickup_past_15
 */
function mapApiListing(apiListing) {
  const occ = parsePercent(apiListing.adjusted_occupancy_next_30);
  const mktOcc = parsePercent(apiListing.market_adjusted_occupancy_next_30);
  const mpi = apiListing.mpi_next_30 ?? null;

  return {
    listingId: String(apiListing.id),
    name: shortListingName(apiListing.name),
    fullName: cleanListingName(apiListing.name),
    city: apiListing.city_name && apiListing.state
      ? `${apiListing.city_name}, ${apiListing.state.replace('Tennessee', 'TN').replace('South Carolina', 'SC').replace('New York', 'NY').replace('North Carolina', 'NC').replace('Georgia', 'GA').replace('Florida', 'FL')}`
      : apiListing.city_name || '',
    bedrooms: apiListing.no_of_bedrooms ?? null,
    bathrooms: null, // not in API
    basePrice: apiListing.base ?? null,
    minPrice: apiListing.min ?? null,
    maxPrice: apiListing.max ?? null,
    recommendedBasePrice: apiListing.recommended_base_price ?? null,
    cleaningFee: apiListing.cleaning_fees ?? null,

    // Occupancy data
    occupancy30d: occ,
    marketOccupancy30d: mktOcc,
    occupancy7d: parsePercent(apiListing.adjusted_occupancy_next_7),
    marketOccupancy7d: parsePercent(apiListing.market_adjusted_occupancy_next_7),
    occupancy15d: parsePercent(apiListing.adjusted_occupancy_next_15),
    occupancy90d: parsePercent(apiListing.adjusted_occupancy_next_90),

    // Weekend occupancy
    weekendOcc30d: parsePercent(apiListing.weekend_adjusted_occupancy_next_30),
    marketWeekendOcc30d: parsePercent(apiListing.market_weekend_adjusted_occupancy_next_30),

    // MPI
    mpi30d: mpi,
    mpi60d: apiListing.mpi_next_60 ?? null,

    // ADR (Average Daily Rate)
    adrPast30: apiListing.adr_past_30 ?? null,
    adrNext30: apiListing.adr_next_30 ?? null,
    adrPast90: apiListing.adr_past_90 ?? null,
    stlyAdrPast30: apiListing.stly_adr_past_30 ?? null, // Same Time Last Year

    // Booking data
    lastBookedDate: apiListing.last_booked_date
      ? apiListing.last_booked_date.split('T')[0]
      : null,
    nightsBooked15d: apiListing.booking_pickup_past_15 ?? null,

    // Meta
    pms: apiListing.pms,
    group: apiListing.group,
    subgroup: apiListing.subgroup,
    lastRefreshedAt: apiListing.last_refreshed_at,
    pushEnabled: apiListing.push_enabled,
    isHidden: apiListing.isHidden,

    // No per-date data from this API
    dataUnavailable: false,
  };
}

// --- Main entry point ---

function emptyResult(hasErrors = false) {
  return {
    listings: [],
    fetchedAt: new Date().toISOString(),
    hasErrors,
    isUsingMockData: false,
  };
}

function mapListings(apiListings, nameOverrides) {
  return apiListings.map((apiListing) => {
    const mapped = mapApiListing(apiListing);
    const override = nameOverrides[mapped.listingId];
    if (override) {
      if (override.name) mapped.name = override.name;
      if (override.city) mapped.city = override.city;
    }
    return mapped;
  });
}

/**
 * Fetch client data using Supabase listing associations first. Group filtering
 * remains as a fallback for clients that have not been fully linked yet.
 *
 * @param {Object} options
 * @param {string[]} options.listingIds - PriceLabs/PMS listing IDs from Supabase
 * @param {string} options.groupName - Legacy PriceLabs group fallback
 * @param {Object} options.nameOverrides - Map of listingId → { name, city }
 * @returns {Promise<Object>} Canonical data shape
 */
async function fetchClientData({
  listingIds = [],
  groupName = '',
  nameOverrides = {},
} = {}) {
  const apiKey = process.env.PRICELABS_API_KEY;
  const normalizedIds = new Set(listingIds.map(String));

  if (!apiKey) {
    console.log('No PRICELABS_API_KEY — using mock client data');
    const fakeMockListings = Array.from({ length: 5 }, (_, i) => ({
      listingId: `mock-${i}`,
      name: `Sample Listing ${i + 1}`,
      city: 'Mock City, ST',
    }));
    return generateMockData(fakeMockListings);
  }

  try {
    const allApiListings = await getAllListings();
    if (!allApiListings) {
      console.error('PriceLabs API returned no listings');
      return emptyResult(true);
    }

    let clientListings;
    if (normalizedIds.size > 0) {
      clientListings = allApiListings.filter((listing) =>
        normalizedIds.has(String(listing.id))
      );

      if (clientListings.length < normalizedIds.size) {
        console.warn(
          `Matched ${clientListings.length} of ${normalizedIds.size} Supabase listing IDs in PriceLabs`
        );
      }
    }

    // Preserve existing dashboards while stale or legacy listing IDs are fixed.
    if ((!clientListings || clientListings.length === 0) && groupName) {
      clientListings = allApiListings.filter((listing) => listing.group === groupName);
    }

    if (!clientListings) {
      return emptyResult();
    }

    const enrichedListings = mapListings(clientListings, nameOverrides);
    return {
      listings: enrichedListings,
      fetchedAt: new Date().toISOString(),
      hasErrors: enrichedListings.some((l) => l.dataUnavailable),
      isUsingMockData: false,
    };
  } catch (err) {
    console.error('fetchClientData failed:', err.message);
    return emptyResult(true);
  }
}

export { getAllListings, fetchClientData };
