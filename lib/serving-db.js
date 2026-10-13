import postgres from 'postgres';

// Read-only connection to the pricelabs-dashboard serving database (a separate
// Supabase project fed nightly from BigQuery by pricelabs-sync's web-export).
// Used only by the "PriceLabs Report" model (lib/layouts/pricelabs-report.js).
//
// PRICELABS_SERVING_DATABASE_URL is server-only (never NEXT_PUBLIC_): the
// `dashboard_reader` login, which may SELECT the serving tables and nothing
// else. Use Supabase's TRANSACTION pooler (port 6543); `prepare: false` is
// required there. Created on first use so `next build` needs no database.

let client = null;

// Keep the shapes pricelabs-dashboard was written against: numerics as
// numbers, dates/timestamps as ISO strings.
const asNumber = { serialize: (x) => String(x), parse: (x) => Number(x) };
const asText = { serialize: (x) => x, parse: (x) => x };

export function isServingConfigured() {
  return !!process.env.PRICELABS_SERVING_DATABASE_URL;
}

export function servingDb() {
  if (client) return client;
  const url = process.env.PRICELABS_SERVING_DATABASE_URL;
  if (!url) throw new Error('PRICELABS_SERVING_DATABASE_URL is not set');
  client = postgres(url, {
    ssl: 'require',
    prepare: false,
    max: Number(process.env.PRICELABS_SERVING_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 15,
    types: {
      numeric: { to: 1700, from: [1700], ...asNumber },
      bigint: { to: 20, from: [20], ...asNumber },
      date: { to: 1082, from: [1082], ...asText },
      timestamptz: { to: 1184, from: [1184], ...asText },
    },
  });
  return client;
}

/** postgres.js RowList → plain array of plain objects. */
export function plain(rows) {
  return Array.from(rows, (row) => ({ ...row }));
}
