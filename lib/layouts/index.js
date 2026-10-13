import standard from './standard.js';
import performanceReport from './performance-report.js';
import pricelabsReport from './pricelabs-report.js';

// Dashboard models. Each one exports { key, name, description, render } where
// render(client, data, { tab, seo, listing, reservations, dayOfWeek }) returns the
// full HTML page — same contract as renderDashboard in lib/render.js. Optional:
// `singlePage: true` (one page, ignores ?tab/?listing) and `needs: { seo, dayOfWeek }`
// (extra datasets the route loads for it). A model with its own data source
// exports `load({ client, dataClient, params, isMock })` → { data, ...opts } or
// { error: { status, message } }; the route then skips the Hub report. Register new models
// here; assign them to clients / beta dashboards from /admin.
const LAYOUTS = [standard, performanceReport, pricelabsReport];

const BY_KEY = new Map(LAYOUTS.map((l) => [l.key, l]));

export const DEFAULT_LAYOUT = 'standard';

export function listLayouts() {
  return LAYOUTS.map(({ key, name, description }) => ({ key, name, description }));
}

export function isLayout(key) {
  return BY_KEY.has(key);
}

/** Unknown or removed keys fall back to the standard model. */
export function getLayout(key) {
  return BY_KEY.get(key) || BY_KEY.get(DEFAULT_LAYOUT);
}
