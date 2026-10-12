import Link from 'next/link';
import { formatDemoListings } from '../../../lib/admin.js';
import { listLayouts } from '../../../lib/layouts/index.js';
import { saveDashboard } from '../actions.js';

export default function DashboardForm({ dashboard, clients }) {
  const d = dashboard || { enabled: true, variant: 'beta', layout: 'standard', demo_listings: [] };
  const layouts = listLayouts();
  return (
    <form action={saveDashboard}>
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <div className="grid2">
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required defaultValue={d.name || ''} />
          <div className="hint">Shown in the dashboard header.</div>
        </div>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input id="slug" name="slug" type="text" required pattern="[a-z0-9][a-z0-9-]{2,62}" placeholder="beta-ashwood" defaultValue={d.slug || ''} />
          <div className="hint">Part of the URL — lowercase, numbers, dashes.</div>
        </div>
        <div className="field">
          <label htmlFor="market">Market</label>
          <input id="market" name="market" type="text" defaultValue={d.market || ''} />
        </div>
        <div className="field">
          <label htmlFor="client_id">Data source</label>
          <select id="client_id" name="client_id" defaultValue={d.client_id || ''}>
            <option value="">Sample data (listings below)</option>
            {clients.map((cl) => (
              <option key={cl.id} value={cl.id}>Real data: {cl.name}</option>
            ))}
          </select>
          <div className="hint">Real data shows that client&apos;s dashboard under this new link.</div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="demo_listings">Sample listings</label>
        <textarea className="mono" id="demo_listings" name="demo_listings" defaultValue={formatDemoListings(d.demo_listings)} placeholder={'Ashwood | Grand Prairie, TX\nGuatemala | Buenos Aires, Argentina'} />
        <div className="hint">Only for sample data. One per line: <code>Name | City</code>. Figures are generated and stable per name.</div>
      </div>

      <div className="field">
        <label htmlFor="layout">Model</label>
        <select id="layout" name="layout" defaultValue={d.layout || 'standard'}>
          {layouts.map((l) => (
            <option key={l.key} value={l.key}>{l.name} — {l.description}</option>
          ))}
        </select>
        <div className="hint">Which dashboard design this link renders. New models are built in code, then picked here.</div>
      </div>

      <div className="grid2">
        <div className="field">
          <label htmlFor="variant">Variant</label>
          <select id="variant" name="variant" defaultValue={d.variant}>
            <option value="beta">Beta (shows Beta Preview badge)</option>
            <option value="stable">Stable</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="expires_at">Expires</label>
          <input id="expires_at" name="expires_at" type="date" defaultValue={d.expires_at ? d.expires_at.slice(0, 10) : ''} />
          <div className="hint">Optional. The link returns 404 after this date.</div>
        </div>
      </div>

      <div className="field">
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={d.enabled} /> Enabled (link works)
        </label>
      </div>

      <div className="field">
        <label htmlFor="notes">Internal notes</label>
        <textarea id="notes" name="notes" defaultValue={d.notes || ''} />
      </div>

      <div className="actions">
        <button className="btn" type="submit">{d.id ? 'Save changes' : 'Create dashboard'}</button>
        <Link className="btn ghost" href="/admin">Cancel</Link>
      </div>
    </form>
  );
}
