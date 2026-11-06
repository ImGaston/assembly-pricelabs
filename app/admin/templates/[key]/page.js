import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '../../../../lib/admin-auth.js';
import { listClients, listDashboards, templatePreviewUrl } from '../../../../lib/admin.js';
import { DEFAULT_LAYOUT, describeLayout, getLayout } from '../../../../lib/layouts/index.js';
import { changeClientLayout } from '../../actions.js';
import Shell from '../../Shell.js';

// One template: full-size preview on sample data, who uses it, and a form to
// assign it to another (non-inactive) client.
export default async function TemplatePage({ params, searchParams }) {
  requireAdmin();
  const t = describeLayout(params.key);
  if (!t) notFound();
  const [clients, dashboards] = await Promise.all([listClients(), listDashboards()]);
  const using = clients.filter((cl) => (cl.dashboard_layout || DEFAULT_LAYOUT) === t.key);
  const others = clients.filter((cl) => (cl.dashboard_layout || DEFAULT_LAYOUT) !== t.key);
  const usingDash = dashboards.filter((d) => (d.layout || DEFAULT_LAYOUT) === t.key);
  const back = `/admin/templates/${t.key}?saved=1`;
  const preview = templatePreviewUrl(t.key);

  return (
    <Shell crumb={t.name}>
      <Link className="back" href="/admin/templates">← Templates</Link>
      <div className="page-head">
        <div>
          <h1>{t.name} {t.isDefault && <span className="pill stable">Default</span>}</h1>
          <p className="muted">{t.description}</p>
          <div className="tags">{t.traits.map((x) => <span className="pill mock" key={x}>{x}</span>)}</div>
        </div>
        <a className="btn ghost" href={preview} target="_blank" rel="noreferrer">Open preview in new tab</a>
      </div>
      {searchParams?.saved && <div className="notice ok">Template assigned. The client's existing link can take up to 6 hours to update (CDN cache).</div>}

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Preview</h2>
            <p className="card-desc">Sample portfolio — navigation inside the preview works like a real client link.</p>
          </div>
        </div>
        <iframe className="tpl-frame" src={preview} title={`${t.name} preview`} />
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Assign to a client</h2>
            <p className="card-desc">Switches the client's dashboard to this template. Inactive clients are not listed.</p>
          </div>
        </div>
        {others.length === 0 ? (
          <p className="muted">Every client already uses this template.</p>
        ) : (
          <form className="filters" action={changeClientLayout}>
            <input type="hidden" name="layout" value={t.key} />
            <input type="hidden" name="back" value={back} />
            <select name="client_id" required defaultValue="" aria-label="Client">
              <option value="" disabled>Choose a client…</option>
              {others.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name}{cl.status && cl.status !== 'active' ? ` (${cl.status})` : ''} — now {getLayout(cl.dashboard_layout).name}
                </option>
              ))}
            </select>
            <button className="btn small" type="submit">Assign {t.name}</button>
          </form>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Using this template</h2>
            <p className="card-desc">{using.length} client{using.length === 1 ? '' : 's'} · {usingDash.length} beta dashboard{usingDash.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {using.length === 0 && usingDash.length === 0 ? (
          <p className="muted">Nobody uses this template yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {using.map((cl) => (
                  <tr key={cl.id}>
                    <td><div className="cell-title">{cl.name}</div><div className="cell-sub">{cl.market || ''}</div></td>
                    <td className="muted">Client</td>
                    <td><span className={`pill status-${cl.status || 'none'}`}>{cl.status || '—'}</span></td>
                  </tr>
                ))}
                {usingDash.map((d) => (
                  <tr key={d.id}>
                    <td><Link className="cell-title" href={`/admin/dashboards/${d.id}`}>{d.name}</Link><div className="cell-sub mono">/{d.slug}</div></td>
                    <td className="muted">Beta dashboard</td>
                    <td><span className={`pill ${d.enabled ? d.variant : 'off'}`}>{d.enabled ? d.variant : 'Disabled'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
