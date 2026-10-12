import crypto from 'crypto';
import { getSupabase } from './supabase.js';
import { SLUG_RE, RESERVED_SLUGS } from './clients.js';
import { DEFAULT_LAYOUT, isLayout } from './layouts/index.js';

// Admin data layer. Callers must have passed requireAdmin() (lib/admin-auth.js).

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://assembly-pricelabs.vercel.app';

export function dashboardUrl(slug, token) {
  return `${SITE_URL}/api/dashboard/${encodeURIComponent(slug)}?token=${encodeURIComponent(token || '')}`;
}

export async function listClients() {
  const { data, error } = await getSupabase()
    .from('clients')
    .select('id, name, market, status, dashboard_token, dashboard_variant, dashboard_layout')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function listDashboards() {
  const { data, error } = await getSupabase()
    .from('dashboards')
    .select('*, client:clients(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getDashboard(id) {
  const { data, error } = await getSupabase()
    .from('dashboards')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setClientVariant(clientId, variant) {
  if (!['stable', 'beta'].includes(variant)) throw new Error('invalid variant');
  const { error } = await getSupabase()
    .from('clients')
    .update({ dashboard_variant: variant })
    .eq('id', clientId);
  if (error) throw error;
}

export async function setClientLayout(clientId, layout) {
  if (!isLayout(layout)) throw new Error('invalid layout');
  const { error } = await getSupabase()
    .from('clients')
    .update({ dashboard_layout: layout })
    .eq('id', clientId);
  if (error) throw error;
}

/** "Name | City" per line → demo_listings consumed by the mock-data generators. */
export function parseDemoListings(text, slug) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line, i) => {
      const [name, city] = line.split('|').map((s) => s.trim());
      return { listingId: `${slug}-${i + 1}`, name, city: city || '' };
    });
}

export function formatDemoListings(list) {
  return (list || []).map((l) => (l.city ? `${l.name} | ${l.city}` : l.name)).join('\n');
}

/** Validate + normalize form input. Returns { values } or { error }. */
export function normalizeDashboardInput(form) {
  const slug = String(form.get('slug') || '').trim().toLowerCase();
  const name = String(form.get('name') || '').trim();
  if (!name) return { error: 'Name is required.' };
  if (!SLUG_RE.test(slug)) return { error: 'Slug: 3–63 chars, lowercase letters, numbers and dashes.' };
  if (RESERVED_SLUGS.includes(slug)) return { error: `Slug "${slug}" is reserved.` };

  const clientId = String(form.get('client_id') || '').trim() || null;
  const demoListings = clientId ? [] : parseDemoListings(form.get('demo_listings'), slug);
  if (!clientId && demoListings.length === 0) {
    return { error: 'Link a client or add at least one sample listing.' };
  }

  const expires = String(form.get('expires_at') || '').trim();
  return {
    values: {
      slug,
      name,
      market: String(form.get('market') || '').trim() || null,
      client_id: clientId,
      demo_listings: demoListings,
      variant: form.get('variant') === 'stable' ? 'stable' : 'beta',
      layout: isLayout(String(form.get('layout'))) ? String(form.get('layout')) : DEFAULT_LAYOUT,
      enabled: form.get('enabled') === 'on',
      expires_at: expires ? new Date(`${expires}T23:59:59Z`).toISOString() : null,
      notes: String(form.get('notes') || '').trim() || null,
    },
  };
}

export async function createDashboard(values, createdBy) {
  const { data, error } = await getSupabase()
    .from('dashboards')
    .insert({ ...values, created_by: createdBy })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateDashboard(id, values) {
  const { error } = await getSupabase().from('dashboards').update(values).eq('id', id);
  if (error) throw error;
}

export async function regenerateDashboardToken(id) {
  const token = crypto.randomBytes(24).toString('hex');
  const { error } = await getSupabase().from('dashboards').update({ token }).eq('id', id);
  if (error) throw error;
}
