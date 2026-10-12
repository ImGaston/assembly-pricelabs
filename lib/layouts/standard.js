import { renderDashboard } from '../render.js';

// The original dashboard every client sees today.
export default {
  key: 'standard',
  name: 'Standard',
  description: 'Current dashboard: Pricing (KPIs, pacing, listings, reservations) + SEO Visibility.',
  render: renderDashboard,
};
