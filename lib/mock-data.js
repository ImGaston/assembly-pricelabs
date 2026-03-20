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

export { generateMockData };
