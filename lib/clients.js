import { getSupabase } from './supabase.js';

const cache = new Map();
const TTL = 10 * 60 * 1000;

const DEMO = {
  id: 'demo',
  name: 'Sample Portfolio',
  token: 'demo_revfactor_2024_showcase',
  market: 'Gatlinburg / Smoky Mountains, TN',
  useMockData: true,
  demoListings: [
    { listingId: 'demo-001', name: 'Smoky Summit Lodge', city: 'Gatlinburg, TN' },
    { listingId: 'demo-002', name: 'Mountain Mist Cabin', city: 'Gatlinburg, TN' },
    { listingId: 'demo-003', name: 'Cedar Creek Retreat', city: 'Pigeon Forge, TN' },
    { listingId: 'demo-004', name: 'Bearfoot Chalet', city: 'Sevierville, TN' },
    { listingId: 'demo-005', name: 'Wildwood Escape', city: 'Gatlinburg, TN' },
    { listingId: 'demo-006', name: 'Timber Ridge Villa', city: 'Pigeon Forge, TN' },
    { listingId: 'demo-007', name: 'Sunrise View Cottage', city: 'Gatlinburg, TN' },
    { listingId: 'demo-008', name: 'Elk Meadow Cabin', city: 'Sevierville, TN' },
  ],
  nameOverrides: {},
};

// Synthetic training portfolio: no Hub/PriceLabs reads or client records.
const BLACKBIRD_DEMO = {
  ...DEMO,
  id: 'demo-blackbird',
  name: 'Blackbird Demo Portfolio',
  market: 'Ashwood / Guatemala · Fictional training figures',
  demoListings: [
    { listingId: 'demo-ashwood', name: 'Ashwood', city: 'Grand Prairie, TX' },
    { listingId: 'demo-guatemala', name: 'Guatemala', city: 'Buenos Aires, Argentina' },
  ],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,62}$/;
// Slugs that resolve before the managed-dashboards lookup; the admin refuses them.
export const RESERVED_SLUGS = ['demo', 'demo-blackbird'];

// Managed (admin-created) dashboards are cached briefly so disabling one takes
// effect within a minute.
const MANAGED_TTL = 60 * 1000;

/**
 * Look up a dashboard by path slug and return the canonical client shape
 * consumed by the renderer. Resolution order: hardcoded demos → client UUID
 * (`clients`) → managed slug (`dashboards`). Returns null if not found,
 * disabled or expired.
 */
export async function getClientById(id) {
  if (id === 'demo') return DEMO;
  if (id === 'demo-blackbird') return BLACKBIRD_DEMO;
  if (!id) return null;
  if (UUID_RE.test(id)) return cached(id, TTL, () => loadClient(id));
  if (SLUG_RE.test(id)) return cached(`dash:${id}`, MANAGED_TTL, () => loadManagedDashboard(id));
  return null;
}

async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < ttl) return hit.data;
  const data = await load();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

async function loadClient(id) {
  const sb = getSupabase();

  const [clientRes, listingsRes] = await Promise.all([
    sb.from('clients')
      .select('id, name, dashboard_token, pricelabs_group, market, status, dashboard_variant, dashboard_layout')
      .eq('id', id)
      .maybeSingle(),
    sb.from('listings')
      .select('listing_id, name, city, state')
      .eq('client_id', id),
  ]);

  if (clientRes.error) throw clientRes.error;
  if (!clientRes.data) return null;

  const row = clientRes.data;
  const listings = listingsRes.data || [];

  const listingIds = [];
  const nameOverrides = {};
  for (const l of listings) {
    if (!l.listing_id) continue;
    listingIds.push(String(l.listing_id));
    const override = {};
    if (l.name) override.name = l.name;
    if (l.city) {
      override.city = l.state ? `${l.city}, ${l.state}` : l.city;
    }
    if (Object.keys(override).length) nameOverrides[String(l.listing_id)] = override;
  }

  return {
    id: row.id,
    name: row.name,
    token: row.dashboard_token,
    market: row.market || '',
    priceLabsGroup: row.pricelabs_group,
    listingIds,
    nameOverrides,
    variant: row.dashboard_variant || 'stable',
    layout: row.dashboard_layout || 'standard',
  };
}

async function loadManagedDashboard(slug) {
  const sb = getSupabase();
  const { data: row, error } = await sb.from('dashboards')
    .select('slug, name, market, client_id, demo_listings, variant, layout, token, enabled, expires_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!row || !row.enabled) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;

  const shared = {
    id: row.slug,
    name: row.name,
    token: row.token,
    variant: row.variant || 'beta',
    layout: row.layout || 'standard',
    isManaged: true,
  };

  // Linked: the real client's data under the beta link (own slug + token).
  // `id` stays the slug so rendered links point back here; data readers keyed
  // on the Hub client UUID must use `dataClient` (see route.js).
  if (row.client_id) {
    const base = await loadClient(row.client_id);
    if (!base) return null;
    return { ...base, ...shared, market: row.market || base.market, dataClient: base };
  }

  // Unlinked: synthetic mock portfolio, same path as the hardcoded demos.
  return {
    ...shared,
    market: row.market || '',
    useMockData: true,
    demoListings: Array.isArray(row.demo_listings) ? row.demo_listings : [],
    nameOverrides: {},
  };
}

export function clearClientCache() {
  cache.clear();
}
