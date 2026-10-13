// Synthetic data for the "PriceLabs Report" model on demo / unlinked beta
// dashboards. Same shapes as lib/serving.js. Each listing has its own seeded
// stream (keyed on its id) so figures are stable across reloads and don't
// disturb the other mock generators.

const DAY = 86400000;

function rng(seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayMs = () => Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const keyOf = (l) => `demo|${l.listingId}`;
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Seasonality: peaks in summer and October (leaf season), soft in Jan–Feb.
const SEASON = [0.62, 0.68, 0.84, 0.9, 0.98, 1.18, 1.26, 1.14, 0.96, 1.16, 0.92, 1.04];

function profile(l) {
  const r = rng(`profile:${l.listingId}`);
  return {
    base: 160 + Math.round(r() * 180), // nightly base price
    occ: 0.52 + r() * 0.2, // typical occupancy
    bedrooms: 1 + Math.floor(r() * 4),
  };
}

/** Booked stays from Jan 1 last year to ~180 days ahead, plus sibling-unit stays. */
function stays(l) {
  const r = rng(`stays:${l.listingId}`);
  const p = profile(l);
  const today = todayMs();
  const out = [];
  const channels = ['airbnb', 'airbnb', 'airbnb', 'vrbo', 'bookingcom', null];
  let d = Date.UTC(new Date(today).getUTCFullYear() - 1, 0, 1);
  let n = 0;
  while (d < today + 180 * DAY) {
    const m = new Date(d).getUTCMonth();
    // Fewer far-future bookings: they haven't come in yet.
    const ahead = (d - today) / DAY;
    const fill = p.occ * SEASON[m] * (ahead > 0 ? 1.15 : 1);
    const lead = 3 + Math.floor(r() * 110);
    // A stay whose booking date is still in the future hasn't come in yet.
    if (r() < fill && d - lead * DAY <= today) {
      const nights = 2 + Math.floor(r() * 5);
      const checkIn = d;
      const checkOut = d + nights * DAY;
      const booked = checkIn - lead * DAY;
      const adr = p.base * SEASON[m] * (0.9 + r() * 0.25);
      const rev = round(adr * nights);
      n += 1;
      const channel = channels[Math.floor(r() * channels.length)];
      out.push({
        reservation_id: `${l.listingId}-R${1000 + n}`,
        listing_key: keyOf(l),
        listing_name: l.name,
        guest_name: 'Hidden',
        booking_channel: channel,
        channel_confirmation_code: channel === 'airbnb' ? `HM${Math.floor(r() * 1e8).toString(36).toUpperCase()}` : null,
        check_in: iso(checkIn),
        check_out: iso(checkOut),
        no_of_days: nights,
        rental_revenue: rev,
        total_cost: round(rev * 1.18),
        booked_date: iso(booked),
      });
      d = checkOut + Math.floor(r() * 3) * DAY;
    } else {
      d += DAY;
    }
  }
  // A sibling unit at the same property books a few nights ahead.
  const sibling = `${l.name} (Unit B)`;
  for (let i = 0; i < 4; i++) {
    const ci = today + (8 + i * 19 + Math.floor(r() * 6)) * DAY;
    out.push({
      reservation_id: `${l.listingId}-S${i}`,
      listing_key: keyOf(l),
      listing_name: sibling,
      guest_name: 'Hidden',
      booking_channel: 'airbnb',
      channel_confirmation_code: `HM${Math.floor(r() * 1e8).toString(36).toUpperCase()}`,
      check_in: iso(ci),
      check_out: iso(ci + 3 * DAY),
      no_of_days: 3,
      rental_revenue: round(p.base * 3 * 0.9),
      total_cost: round(p.base * 3 * 1.05),
      booked_date: iso(ci - 30 * DAY),
    });
  }
  return out.sort((a, b) => a.check_in.localeCompare(b.check_in));
}

function ownStays(l) {
  return stays(l).filter((s) => s.listing_name === l.name);
}

/** Monthly revenue / nights / occupancy, Jan last year → Dec this year. */
function monthly(l) {
  const year = new Date().getUTCFullYear();
  const own = ownStays(l);
  const out = [];
  for (let y = year - 1; y <= year; y++) {
    for (let m = 0; m < 12; m++) {
      const start = Date.UTC(y, m, 1);
      const end = Date.UTC(y, m + 1, 1);
      let revenue = 0;
      let nights = 0;
      for (const s of own) {
        const ci = Date.parse(s.check_in + 'T00:00:00Z');
        const per = s.rental_revenue / s.no_of_days;
        for (let k = 0; k < s.no_of_days; k++) {
          const night = ci + k * DAY;
          if (night >= start && night < end) { revenue += per; nights += 1; }
        }
      }
      const days = (end - start) / DAY;
      out.push({
        listing_key: keyOf(l),
        month: iso(start),
        revenue: round(revenue),
        nights_booked: nights,
        occupancy_pct: round((nights / days) * 100, 1),
        adr: nights ? round(revenue / nights) : null,
      });
    }
  }
  return out;
}

function summary(l) {
  const r = rng(`summary:${l.listingId}`);
  const year = new Date().getUTCFullYear();
  const today = todayMs();
  const own = ownStays(l);
  let onBooks = 0;
  let ytd = 0;
  let ly = 0;
  const jan1 = Date.UTC(year, 0, 1);
  const lyJan1 = Date.UTC(year - 1, 0, 1);
  const lyToday = today - 365 * DAY;
  for (const s of own) {
    const ci = Date.parse(s.check_in + 'T00:00:00Z');
    const per = s.rental_revenue / s.no_of_days;
    for (let k = 0; k < s.no_of_days; k++) {
      const night = ci + k * DAY;
      if (night >= jan1 && night < Date.UTC(year + 1, 0, 1)) onBooks += per;
      if (night >= jan1 && night < today) ytd += per;
      if (night >= lyJan1 && night < lyToday) ly += per;
    }
  }
  const recentBooked = own.filter((s) => Date.parse(s.booked_date + 'T00:00:00Z') >= today - 30 * DAY);
  const future = own.filter((s) => s.check_in >= iso(today));
  const windows = future.map((s) => (Date.parse(s.check_in) - Date.parse(s.booked_date)) / DAY);
  return {
    listing_key: keyOf(l),
    report_year: year,
    revenue_on_books: round(onBooks),
    revenue_ytd: round(ytd),
    revenue_ly_same_period: round(ly * (0.86 + r() * 0.12)),
    first_stay_date: own[0]?.check_in || null,
    yoy_comparable: true,
    booking_window_days: windows.length ? round(windows.reduce((a, b) => a + b, 0) / windows.length, 1) : null,
    bookings_30d: recentBooked.length,
    nights_30d: recentBooked.reduce((a, s) => a + s.no_of_days, 0),
  };
}

const FORWARD_DAYS = [1, 2, 3, 7, 10, 15, 21, 30, 45, 60, 90, 120, 180, 240, 300, 360];

function marketMetrics(l) {
  const r = rng(`metrics:${l.listingId}`);
  const p = profile(l);
  const key = keyOf(l);
  const out = [];
  for (const dfd of FORWARD_DAYS) {
    const decay = Math.exp(-dfd / 110);
    const listingOcc = round(Math.min(98, (p.occ * 100 + 12) * decay + 4 + r() * 3), 1);
    const marketOcc = round(Math.min(95, (p.occ * 100) * decay + 3 + r() * 3), 1);
    out.push({ listing_key: key, level: 'listing', metric: 'occupancy', dfd, value: listingOcc });
    out.push({ listing_key: key, level: 'market', metric: 'occupancy', dfd, value: marketOcc });
    if (dfd === 120) {
      out.push({ listing_key: key, level: 'listing', metric: 'adjusted_occupancy', dfd, value: round(listingOcc + 18, 1) });
      out.push({ listing_key: key, level: 'market', metric: 'adjusted_occupancy', dfd, value: round(marketOcc + 16, 1) });
    }
  }
  for (const dfd of [-7, -30, -90]) {
    const occ = round(p.occ * 100 + (r() - 0.3) * 18, 1);
    const adr = round(p.base * (0.95 + r() * 0.2));
    out.push({ listing_key: key, level: 'listing', metric: 'occupancy', dfd, value: occ });
    out.push({ listing_key: key, level: 'market', metric: 'occupancy', dfd, value: round(occ - 6 + r() * 8, 1) });
    out.push({ listing_key: key, level: 'listing', metric: 'adr', dfd, value: adr });
    out.push({ listing_key: key, level: 'listing', metric: 'revpar', dfd, value: round((adr * occ) / 100) });
    out.push({ listing_key: key, level: 'listing', metric: 'revenue', dfd, value: round((adr * occ * -dfd) / 100) });
  }
  return out;
}

/** Portfolio overview, same shape as getServingPortfolio. */
export function generateMockServingPortfolio(demoListings) {
  const listings = demoListings.map((l) => ({
    key: keyOf(l),
    listingId: l.listingId,
    name: l.name,
    pmsName: l.name,
    city: l.city || '',
    bedrooms: profile(l).bedrooms,
  }));
  const recent = demoListings
    .flatMap((l) => ownStays(l).map((s, i) => ({ id: `${l.listingId}-${i}`, ...s })))
    .filter((s) => s.booked_date <= iso(todayMs()))
    .sort((a, b) => b.booked_date.localeCompare(a.booked_date))
    .slice(0, 10);
  return {
    source: 'serving',
    fetchedAt: new Date().toISOString(),
    isUsingMockData: true,
    listings,
    summaries: demoListings.map(summary),
    monthly: demoListings.flatMap(monthly),
    occupancy: demoListings.flatMap(marketMetrics).filter((m) => m.metric === 'adjusted_occupancy'),
    recent,
  };
}

/** One listing's report, same shape as getServingListing. */
export function generateMockServingListing(demoListing) {
  const l = demoListing;
  const key = keyOf(l);
  const p = profile(l);
  const r = rng(`listing:${l.listingId}`);
  const today = todayMs();
  const all = stays(l);
  const own = all.filter((s) => s.listing_name === l.name);
  const bookedNights = new Set();
  for (const s of own) {
    for (let k = 0; k < s.no_of_days; k++) bookedNights.add(iso(Date.parse(s.check_in) + k * DAY));
  }

  // Prices: ~90 days back to ~180 ahead, like the nightly export.
  const prices = [];
  const reasonFactors = [];
  const reasonSummaries = [];
  const demand = [
    { color: '#9fc5a8', desc: 'Low demand' },
    { color: '#e6d48a', desc: 'Normal demand' },
    { color: '#e2a35f', desc: 'Good demand' },
    { color: '#c4573a', desc: 'High demand' },
  ];
  for (let i = -90; i <= 180; i++) {
    const d = today + i * DAY;
    const dt = new Date(d);
    const m = dt.getUTCMonth();
    const dow = dt.getUTCDay();
    const weekend = dow === 5 || dow === 6;
    const raw = p.base * SEASON[m] * (weekend ? 1.22 : 0.96);
    const uncustomized = round(raw * (0.95 + r() * 0.1));
    const price = round(uncustomized * (i < 14 && i >= 0 ? 0.93 : 1.0));
    const level = Math.min(3, Math.max(0, Math.round((SEASON[m] - 0.6) * 4 + (weekend ? 1 : 0) - 0.5)));
    const date = iso(d);
    const blocked = !bookedNights.has(date) && r() < 0.025;
    prices.push({
      listing_key: key,
      price_date: date,
      price,
      user_price: i >= 0 ? price : null,
      uncustomized_price: uncustomized,
      min_stay: weekend ? 2 : 1 + (SEASON[m] > 1.1 ? 1 : 0),
      booking_status: blocked ? 'Blocked' : bookedNights.has(date) ? 'Booked' : 'Available',
      demand_color: demand[level].color,
      demand_desc: demand[level].desc,
      is_booked: bookedNights.has(date),
    });
    if (i >= 0) {
      const seasonPct = Math.round((SEASON[m] - 1) * 100);
      const dowPct = weekend ? 22 : -4;
      const factors = [
        ['market_factors', 'Seasonality', `${seasonPct >= 0 ? '+' : ''}${seasonPct}%`],
        ['market_factors', 'Day of week', `${dowPct >= 0 ? '+' : ''}${dowPct}%`],
        ['market_factors', 'Demand', demand[level].desc],
      ];
      if (i < 14) factors.push(['pricing_customizations', 'Last minute discount', '-7%']);
      factors.push(['thresholds', 'Minimum price', `$${Math.round(p.base * 0.6)}`]);
      factors.forEach(([section, title, value], k) => {
        reasonFactors.push({ listing_key: key, price_date: date, section, sort_order: k, key: null, title, value, price: null });
      });
      reasonSummaries.push({
        listing_key: key,
        price_date: date,
        customized_price: price,
        summary: `${demand[level].desc} ${weekend ? 'weekend' : 'weekday'}; priced ${price > p.base ? 'above' : 'below'} the $${p.base} base price.`,
      });
    }
  }

  // Neighborhood: comp-set price percentiles and occupancy per day ahead,
  // market KPIs per month.
  const series = [];
  for (let i = 0; i <= 180; i++) {
    const d = today + i * DAY;
    const dt = new Date(d);
    const m = dt.getUTCMonth();
    const weekend = dt.getUTCDay() === 5 || dt.getUTCDay() === 6;
    const p50 = p.base * SEASON[m] * (weekend ? 1.15 : 0.95) * 0.94;
    const date = iso(d);
    [['25th Percentile', 0.74], ['50th Percentile', 1], ['75th Percentile', 1.32], ['90th Percentile', 1.75]].forEach(([metric, k]) => {
      series.push({ listing_key: key, chart: 'price', metric, comp_segment: 'All', x_value: date, x_order: i, value: round(p50 * k * (0.97 + r() * 0.06)) });
    });
    const occ = Math.min(96, (p.occ * 100 * SEASON[m]) * Math.max(0.3, 1 - i / 220) + (weekend ? 10 : 0));
    series.push({ listing_key: key, chart: 'occupancy', metric: 'Occupancy', comp_segment: 'All', x_value: date, x_order: i, value: round(occ, 1) });
    series.push({ listing_key: key, chart: 'occupancy', metric: 'Occupancy_LY', comp_segment: 'All', x_value: date, x_order: i, value: round(Math.min(97, p.occ * 100 * SEASON[m] + (weekend ? 8 : -2) + r() * 4), 1) });
  }
  const start = new Date(today);
  for (let k = 0; k < 12; k++) {
    const dt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 6 + k, 1));
    const m = dt.getUTCMonth();
    const label = `${MONTH_SHORT[m]} ${dt.getUTCFullYear()}`;
    const avail = 30 * 140;
    const booked = Math.round(avail * p.occ * SEASON[m] * 0.9);
    const kpis = {
      Revenue: round(booked * p.base * SEASON[m] * 0.92),
      'Total Booked Days': booked,
      'Total Available Days': avail,
      LOS: round(2.6 + r() * 1.6, 1),
      'Booking Window': round(22 + SEASON[m] * 20 + r() * 8),
    };
    for (const [metric, value] of Object.entries(kpis)) {
      series.push({ listing_key: key, chart: 'market_kpi', metric, comp_segment: 'All', x_value: label, x_order: k, value });
    }
  }

  const bookings = own
    .filter((s) => s.booked_date <= iso(today))
    .sort((a, b) => b.booked_date.localeCompare(a.booked_date))
    .slice(0, 10)
    .map((s, i) => ({ id: i + 1, ...s }));

  return {
    monthly: monthly(l),
    bookings,
    prices,
    reservations: all,
    neighborhoodSeries: series,
    neighborhoodSummary: {
      listing_key: key,
      comp_segment: String(p.bedrooms),
      listings_used: 140,
      currency: 'USD',
      neighborhood_data_source: 'Nearby listings',
      base_price_p25: round(p.base * 0.72),
      base_price_p50: round(p.base * 0.95),
      base_price_p75: round(p.base * 1.28),
      base_price_p90: round(p.base * 1.7),
    },
    marketMetrics: marketMetrics(l),
    metricsSummary: {
      listing_key: key,
      bp_ratio: round(1.04 + r() * 0.08, 3),
      last_booked_date: bookings[0]?.booked_date || null,
      currency: 'USD',
    },
    priceReasonFactors: reasonFactors,
    priceReasonSummaries: reasonSummaries,
  };
}

export function mockListingFor(demoListings, listingKey) {
  return demoListings.find((l) => keyOf(l) === listingKey) || null;
}
