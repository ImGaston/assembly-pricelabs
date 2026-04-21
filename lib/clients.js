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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Look up a client by UUID (or "demo") and return the canonical shape consumed
 * by the dashboard renderer. Returns null if not found.
 */
export async function getClientById(id) {
  if (id === 'demo') return DEMO;
  if (!id || !UUID_RE.test(id)) return null;

  const cached = cache.get(id);
  if (cached && Date.now() - cached.timestamp < TTL) return cached.data;

  const sb = getSupabase();

  const [clientRes, listingsRes] = await Promise.all([
    sb.from('clients')
      .select('id, name, dashboard_token, pricelabs_group, market, status')
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

  const nameOverrides = {};
  for (const l of listings) {
    if (!l.listing_id) continue;
    const override = {};
    if (l.name) override.name = l.name;
    if (l.city) {
      override.city = l.state ? `${l.city}, ${l.state}` : l.city;
    }
    if (Object.keys(override).length) nameOverrides[String(l.listing_id)] = override;
  }

  const client = {
    id: row.id,
    name: row.name,
    token: row.dashboard_token,
    market: row.market || '',
    priceLabsGroup: row.pricelabs_group,
    nameOverrides,
  };

  cache.set(id, { data: client, timestamp: Date.now() });
  return client;
}

export function clearClientCache() {
  cache.clear();
}
