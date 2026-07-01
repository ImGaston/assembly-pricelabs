/**
 * Mock data module for development and API fallback.
 * Defines the canonical internal data shape that lib/pricelabs.js maps to
 * and lib/render.js consumes.
 */

// Seeded pseudo-random for deterministic mock data per listing
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function randomBetween(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 5 || day === 6; // Friday, Saturday
}

function generatePriceArray(days, basePrice, rng) {
  const prices = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    const weekend = isWeekend(date);
    const weekendMultiplier = weekend ? 1.2 + rng() * 0.3 : 1.0;
    // Seasonal variation: slight bump for dates further out
    const seasonalMultiplier = 0.9 + (rng() * 0.2) + (i / days) * 0.1;
    const demandScore = weekend ? 0.5 + rng() * 0.4 : 0.2 + rng() * 0.5;

    const recommendedPrice = Math.round(basePrice * weekendMultiplier * seasonalMultiplier);
    const minStay = weekend ? 2 : 1;
    // ~35% of dates are booked, more likely for near-term dates
    const bookingChance = i < 15 ? 0.45 : i < 30 ? 0.3 : 0.2;
    const isBooked = rng() < bookingChance;

    prices.push({
      date: formatDate(date),
      recommendedPrice,
      minStay,
      basePrice,
      isWeekend: weekend,
      isBooked,
      demandScore: +demandScore.toFixed(2),
    });
  }
  return prices;
}

/**
 * Generate mock data for a set of listings.
 * @param {Object[]} listings - Array of {listingId, name, city} from clients.json
 * @returns {Object} Canonical data shape
 */
function generateMockData(listings) {
  const now = new Date();

  const enrichedListings = listings.map((listing) => {
    const rng = seededRandom(hashString(listing.listingId));
    const basePrice = randomBetween(rng, 150, 500);
    const occupancy = randomBetween(rng, 55, 85);
    const marketOcc = randomBetween(rng, 58, 72);
    const nightsBooked = randomBetween(rng, 3, 12);

    // Random recent booking date (within last 30 days)
    const daysAgo = randomBetween(rng, 1, 30);
    const lastBooked = new Date(now);
    lastBooked.setDate(lastBooked.getDate() - daysAgo);

    const adrPast30 = randomBetween(rng, 200, 600);
    const stlyAdrPast30 = Math.round(adrPast30 * (0.85 + rng() * 0.3));

    return {
      listingId: listing.listingId,
      name: listing.name,
      city: listing.city,
      bedrooms: randomBetween(rng, 1, 6),
      bathrooms: randomBetween(rng, 1, 4),
      basePrice,
      dataUnavailable: false,
      occupancy30d: occupancy,
      marketOccupancy30d: marketOcc,
      nightsBooked15d: nightsBooked,
      lastBookedDate: formatDate(lastBooked),
      mpi30d: +(occupancy / marketOcc).toFixed(2),
      adrPast30,
      adrNext30: randomBetween(rng, 200, 600),
      stlyAdrPast30,
      adrPast90: randomBetween(rng, 250, 550),
    };
  });

  return {
    listings: enrichedListings,
    fetchedAt: now.toISOString(),
    hasErrors: false,
    isUsingMockData: true,
  };
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Seasonal demand curve for a Smoky Mountains STR market (peak summer + fall).
const SEASON = [0.55, 0.6, 0.75, 0.8, 0.85, 1.0, 0.95, 0.8, 0.7, 0.85, 0.75, 0.65];

/**
 * Generate mock report data (12 monthly rows per listing) matching the shape of
 * lib/reports.js, so the demo client showcases the report-backed dashboard layout.
 * @param {Object[]} listings - Array of {listingId, name, city}
 * @returns {Object} Report data shape consumed by lib/render.js
 */
function generateMockReportData(listings) {
  const now = new Date();
  const year = now.getFullYear();
  const asOf = year * 100 + (now.getMonth() + 1);

  const enriched = listings.map((listing) => {
    const rng = seededRandom(hashString(listing.listingId));
    const bedrooms = randomBetween(rng, 2, 6);
    const baseAdr = 180 + bedrooms * 70 + randomBetween(rng, -30, 60);

    const months = MONTH_LABELS.map((label, i) => {
      const season = SEASON[i];
      const occ = Math.min(98, Math.round((45 + season * 45 + (rng() * 10 - 5))));
      const marketOcc = Math.min(95, Math.round(occ * (0.78 + rng() * 0.15)));
      const adr = Math.round(baseAdr * (0.85 + season * 0.5));
      const marketAdr = Math.round(adr * (0.7 + rng() * 0.15));
      const revpar = Math.round((adr * occ) / 100);
      const marketRevpar = Math.round((marketAdr * marketOcc) / 100);
      const revparIndex = marketRevpar > 0 ? +((revpar / marketRevpar) * 100).toFixed(1) : null;
      // ~30 nights of inventory per month
      const revenue = Math.round((adr * occ * 30) / 100);
      const revenueStly = Math.round(revenue * (0.82 + rng() * 0.35));
      const revenueYoy = revenueStly > 0 ? +(((revenue - revenueStly) / revenueStly) * 100).toFixed(1) : null;

      return {
        period: `${year}-${String(i + 1).padStart(2, '0')}-01`,
        year,
        monthNum: i + 1,
        label,
        revenue,
        revenueStly,
        revenueYoy,
        adr,
        marketAdr,
        revpar,
        marketRevpar,
        revparIndex,
        occ,
        marketOcc,
        mpi: marketOcc > 0 ? +((occ / marketOcc) * 100).toFixed(1) : null,
        bookingWindow: randomBetween(rng, 14, 120),
        pickup30: randomBetween(rng, 4, 28),
        potentialRevenue: randomBetween(rng, 500, 6000),
      };
    });

    return {
      listingId: listing.listingId,
      name: listing.name,
      city: listing.city,
      bedrooms,
      group: '',
      months,
    };
  });

  return {
    source: 'report',
    isUsingMockData: true,
    fetchedAt: now.toISOString(),
    year,
    asOf,
    listings: enriched,
  };
}

// --- SEO (Airbnb search-funnel) mock data ---

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const SEO_FUNNEL_KEYS = [
  'first_page_impressions', 'ctr', 'views',
  'wishlists', 'booking_rate', 'overall_conversion',
];
const SEO_BOARD_KEYS = [...SEO_FUNNEL_KEYS, 'occupancy', 'adr'];

function keyToPeriod(k) {
  const year = Math.floor(k / 100);
  const month = k % 100;
  return `${String(month).padStart(2, '0')}-${year}`;
}

function addMonths(key, delta) {
  let year = Math.floor(key / 100);
  let month = (key % 100) + delta;
  while (month > 12) { month -= 12; year += 1; }
  while (month < 1) { month += 12; year -= 1; }
  return year * 100 + month;
}

// Rates keep two decimals; occupancy one; counts/levels are whole numbers.
function roundSeoMetric(key, v) {
  if (key === 'ctr' || key === 'booking_rate' || key === 'overall_conversion') {
    return +v.toFixed(2);
  }
  if (key === 'occupancy') return +v.toFixed(1);
  return Math.round(v);
}

/**
 * Generate mock SEO data matching the shape of lib/seo.js `getClientSeo`, so the
 * demo client showcases the SEO Visibility tab without any Supabase data. Mirrors
 * the drafts' narrative: strong on reach (impressions/views/wishlists), softer on
 * click-through and conversion.
 * @param {Object[]} listings - Array of {listingId, name, city}
 * @returns {Object} SEO data shape consumed by lib/render.js
 */
function generateMockSeoData(listings) {
  const now = new Date();
  const year = now.getFullYear();
  const chosenMonth = Math.max(1, now.getMonth()); // last complete month (clamped)
  const chosenKey = year * 100 + chosenMonth;
  const monthKeys = Array.from({ length: 12 }, (_, i) => year * 100 + (i + 1));

  // Baseline (mid-year) level per metric — the seasonal curve scales it.
  const BASE = (rng) => ({
    first_page_impressions: randomBetween(rng, 18000, 130000),
    ctr: 2.5 + rng() * 8,
    views: randomBetween(rng, 1200, 5200),
    wishlists: randomBetween(rng, 30, 400),
    booking_rate: 0.7 + rng() * 1.8,
    overall_conversion: 0.03 + rng() * 0.25,
    occupancy: randomBetween(rng, 60, 97),
    adr: randomBetween(rng, 190, 700),
  });

  const enriched = listings.map((listing) => {
    const rng = seededRandom(hashString('seo-' + listing.listingId));
    const base = BASE(rng);
    // Edge vs. similar listings: reach metrics run far ahead, rate metrics behind.
    const edge = {
      first_page_impressions: 8 + rng() * 55,
      views: 4 + rng() * 22,
      wishlists: 1.5 + rng() * 7,
      ctr: 0.3 + rng() * 0.45,
      booking_rate: 0.35 + rng() * 0.5,
      overall_conversion: 0.08 + rng() * 0.5,
      occupancy: 0.9 + rng() * 0.35,
      adr: 0.9 + rng() * 0.5,
    };

    // monthly[metric] = Map(periodKey -> {my, similar})
    const monthly = {};
    for (const key of SEO_BOARD_KEYS) {
      monthly[key] = new Map();
      monthKeys.forEach((mk, i) => {
        const season = SEASON[i];
        const noise = 0.9 + rng() * 0.2;
        const my = base[key] * (0.7 + season * 0.5) * noise;
        const similar = my / edge[key];
        monthly[key].set(mk, {
          my: roundSeoMetric(key, my),
          similar: roundSeoMetric(key, similar),
        });
      });
    }

    // Funnel for the chosen period + health count.
    const funnel = {};
    let above = 0;
    for (const key of SEO_FUNNEL_KEYS) {
      const b = monthly[key].get(chosenKey);
      const ratio = b.similar ? +(b.my / b.similar).toFixed(3) : null;
      funnel[key] = { my: b.my, similar: b.similar, ratio };
      if (b.my >= b.similar) above += 1;
    }

    // Board: prev / current / next month window, my-side values.
    const windowKeys = [addMonths(chosenKey, -1), chosenKey, addMonths(chosenKey, 1)];
    const board = {};
    for (const key of SEO_BOARD_KEYS) {
      board[key] = windowKeys.map((k) => ({
        period: keyToPeriod(k),
        label: MONTH_SHORT[(k % 100) - 1],
        value: monthly[key].get(k) ? monthly[key].get(k).my : null,
        isNow: k === chosenKey,
      }));
    }

    // Trend: full 12-month my-vs-similar series.
    const trend = {};
    for (const key of Object.keys(monthly)) {
      trend[key] = monthKeys.map((k) => {
        const b = monthly[key].get(k);
        return { period: keyToPeriod(k), my: b.my, similar: b.similar };
      });
    }

    // Rank snapshot by guest count (position — lower is better). Vary the base
    // per listing so the portfolio shows a mix of strong and weak positions.
    const rankBase = randomBetween(rng, 3, 130);
    const pods = [];
    for (let g = 1; g <= 6; g++) {
      pods.push({ guest_count: g, position: Math.max(1, rankBase + randomBetween(rng, -6, 8)) });
    }
    const positions = pods.map((p) => p.position);
    const avg = +(positions.reduce((s, v) => s + v, 0) / positions.length).toFixed(1);
    const marketAvg = Math.round(avg * (2 + rng() * 1.5));

    return {
      hubListingId: listing.listingId,
      listingId: listing.listingId,
      name: listing.name,
      city: listing.city || '',
      funnel,
      health: { above, total: SEO_FUNNEL_KEYS.length },
      rank: { pods, avg, marketAvg },
      board,
      trend,
    };
  });

  return {
    source: 'seo',
    isUsingMockData: true,
    fetchedAt: now.toISOString(),
    period: keyToPeriod(chosenKey),
    periodLabel: `${MONTH_NAMES_FULL[chosenMonth - 1]} ${year}`,
    listings: enriched,
  };
}

export { generateMockData, generateMockReportData, generateMockSeoData };
