import Link from 'next/link';
import { requireAdmin } from '../../lib/admin-auth.js';
import { dashboardUrl, filterClients, listClients, listDashboards } from '../../lib/admin.js';
import { getLayout, listLayouts } from '../../lib/layouts/index.js';
import { changeClientLayout, toggleClientVariant } from './actions.js';
import ClientFilters from './ClientFilters.js';
import CopyLink from './CopyLink.js';
import Shell from './Shell.js';

function formatDate(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '—';
}

function dashboardState(d) {
  if (!d.enabled) return <span className="pill off">Disabled</span>;
  if (d.expires_at && new Date(d.expires_at) < new Date()) return <span className="pill off">Expired</span>;
  return <span className={`pill ${d.variant}`}>{d.variant}</span>;
}

const one = (v) => (Array.isArray(v) ? v[0] : v) || '';

export default async function AdminHome({ searchParams }) {
  requireAdmin();
  const [allClients, dashboards] = await Promise.all([listClients(), listDashboards()]);
  const layouts = listLayouts();
  const filters = {
    q: one(searchParams?.q),
    status: one(searchParams?.status),
    layout: one(searchParams?.layout),
    variant: one(searchParams?.variant),
  };
  const clients = filterClients(allClients, filters);
  // Keep the active filters after a Set / Make beta round trip.
  const backQs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const statuses = [...new Set(allClients.map((cl) => cl.status || 'none'))].sort();

  return (
    <Shell>
      <div className="page-head">
        <div>
          <h1>Dashboard Manager</h1>
          <p className="muted">Manage client dashboards, models and share links.</p>
        </div>
        <Link className="btn ghost" href="/admin/templates">Templates</Link>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Beta dashboards</h2>
            <p className="card-desc">Isolated dashboards with their own link. Disabled or expired links return 404.</p>
          </div>
        </div>
        {dashboards.length === 0 ? (
          <p className="muted">No managed dashboards yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr><th>Name</th><th>Data</th><th>Model</th><th>State</th><th>Expires</th><th>Link</th><th></th></tr>
              </thead>
              <tbody>
                {dashboards.map((d) => (
                  <tr key={d.id}>
                    <td><div className="cell-title">{d.name}</div><div className="cell-sub mono">/{d.slug}</div></td>
                    <td>
                      {d.client_id
                        ? (d.client?.name || 'Linked client')
                        : <span className="pill mock">Sample · {d.demo_listings?.length || 0}</span>}
                    </td>
                    <td>{getLayout(d.layout).name}</td>
                    <td>{dashboardState(d)}</td>
                    <td className="muted">{formatDate(d.expires_at)}</td>
                    <td><CopyLink url={dashboardUrl(d.slug, d.token)} /></td>
                    <td><Link className="btn ghost small" href={`/admin/dashboards/${d.id}`}>Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" id="clients">
        <div className="card-head">
          <div>
            <h2 className="card-title">Client dashboards</h2>
            <p className="card-desc">Changes here apply to the client's existing link and can take up to 6 hours to show (CDN cache). To test with a client, use a beta dashboard link — it updates instantly.</p>
          </div>
        </div>
        <ClientFilters values={filters} statuses={statuses} layouts={layouts} total={allClients.length} shown={clients.length} />
        {clients.length === 0 ? (
          <p className="muted">No clients match these filters.</p>
        ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Client</th><th>Status</th><th>Model</th><th>Variant</th><th>Link</th></tr>
            </thead>
            <tbody>
              {clients.map((cl) => {
                const variant = cl.dashboard_variant || 'stable';
                const next = variant === 'beta' ? 'stable' : 'beta';
                return (
                  <tr key={cl.id}>
                    <td><div className="cell-title">{cl.name}</div><div className="cell-sub">{cl.market || ''}</div></td>
                    <td><span className={`pill status-${cl.status || 'none'}`}>{cl.status || '—'}</span></td>
                    <td>
                      <form className="row-actions" action={changeClientLayout}>
                        <input type="hidden" name="back" value={backQs} />
                        <input type="hidden" name="client_id" value={cl.id} />
                        <select name="layout" defaultValue={cl.dashboard_layout || 'standard'} aria-label={`Model for ${cl.name}`} style={{ height: 28, minWidth: 120 }}>
                          {layouts.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
                        </select>
                        <button className="btn ghost xs" type="submit">Set</button>
                      </form>
                    </td>
                    <td>
                      <div className="row-actions">
                        <span className={`pill ${variant}`}>{variant}</span>
                        <form className="inline" action={toggleClientVariant}>
                          <input type="hidden" name="client_id" value={cl.id} />
                          <input type="hidden" name="variant" value={next} />
                          <input type="hidden" name="back" value={backQs} />
                          <button className="btn ghost xs" type="submit">Make {next}</button>
                        </form>
                      </div>
                    </td>
                    <td>{cl.dashboard_token ? <CopyLink url={dashboardUrl(cl.id, cl.dashboard_token)} /> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </Shell>
  );
}
