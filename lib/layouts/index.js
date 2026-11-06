import standard from './standard.js';
import performanceReport from './performance-report.js';
import pricelabsReport from './pricelabs-report.js';

// Dashboard models. Each one exports { key, name, description, render } where
// render(client, data, { tab, seo, listing, reservations, dayOfWeek }) returns the
// full HTML page — same contract as renderDashboard in lib/render.js. Optional:
// `singlePage: true` (one page, ignores ?tab/?listing) and `needs: { seo, dayOfWeek }`
// (extra datasets the route loads for it). A model with its own data source
// exports `load({ client, dataClient, params, isMock })` → { data, ...opts } or
// { empty: true } (no data yet → setup page) or { error: { status, message } };
// the route then skips the Hub report. Register new models
// here; assign them to clients / beta dashboards from /admin.
const LAYOUTS = [standard, performanceReport, pricelabsReport];

const BY_KEY = new Map(LAYOUTS.map((l) => [l.key, l]));

export const DEFAULT_LAYOUT = 'standard';

export function listLayouts() {
  return LAYOUTS.map(({ key, name, description }) => ({ key, name, description }));
}

/** Catalog info for /admin/templates (plain data, safe for client components). */
export function describeLayout(key) {
  const l = BY_KEY.get(key);
  if (!l) return null;
  const traits = [];
  if (l.singlePage) traits.push('Single page');
  else if (!l.load) traits.push('Pricing + SEO tabs', 'Per-listing drill-down');
  if (l.load) traits.push('Per-listing reports', 'Own data source (pricelabs-dashboard DB)');
  else traits.push('Hub report data');
  if (l.needs?.seo) traits.push('SEO funnel');
  if (l.needs?.dayOfWeek) traits.push('Day-of-week insights');
  return { key: l.key, name: l.name, description: l.description, isDefault: l.key === DEFAULT_LAYOUT, traits };
}

export function isLayout(key) {
  return BY_KEY.has(key);
}

/** Unknown or removed keys fall back to the standard model. */
export function getLayout(key) {
  return BY_KEY.get(key) || BY_KEY.get(DEFAULT_LAYOUT);
}
