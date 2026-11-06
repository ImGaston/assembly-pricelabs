import Link from 'next/link';
import { requireAdmin } from '../../../lib/admin-auth.js';
import { listClients, listDashboards, templatePreviewUrl } from '../../../lib/admin.js';
import { DEFAULT_LAYOUT, describeLayout, listLayouts } from '../../../lib/layouts/index.js';
import Shell from '../Shell.js';

// Catalog of dashboard models ("templates") that can be assigned to a client or
// beta dashboard, with usage counts and a live preview on sample data.
export default async function TemplatesPage() {
  requireAdmin();
  const [clients, dashboards] = await Promise.all([listClients(), listDashboards()]);
  const templates = listLayouts().map((l) => {
    const using = clients.filter((cl) => (cl.dashboard_layout || DEFAULT_LAYOUT) === l.key);
    const usingDash = dashboards.filter((d) => (d.layout || DEFAULT_LAYOUT) === l.key);
    return { ...describeLayout(l.key), clients: using, dashboards: usingDash };
  });

  return (
    <Shell crumb="Templates">
      <Link className="back" href="/admin">← Back</Link>
      <div className="page-head">
        <div>
          <h1>Dashboard templates</h1>
          <p className="muted">Models you can assign to a client or a beta dashboard. Previews use sample data.</p>
        </div>
      </div>

      <div className="tpl-grid">
        {templates.map((t) => (
          <section className="card tpl" key={t.key}>
            <a className="tpl-thumb" href={`/admin/templates/${t.key}`} aria-label={`Open ${t.name}`}>
              <iframe src={templatePreviewUrl(t.key)} title={`${t.name} preview`} loading="lazy" tabIndex={-1} />
            </a>
            <div className="card-head">
              <div>
                <h2 className="card-title">
                  {t.name} {t.isDefault && <span className="pill stable">Default</span>}
                </h2>
                <p className="cell-sub mono">{t.key}</p>
              </div>
            </div>
            <p className="card-desc">{t.description}</p>
            <div className="tags">{t.traits.map((x) => <span className="pill mock" key={x}>{x}</span>)}</div>
            <p className="cell-sub">
              {t.clients.length} client{t.clients.length === 1 ? '' : 's'} · {t.dashboards.length} beta dashboard{t.dashboards.length === 1 ? '' : 's'}
            </p>
            <div className="actions">
              <Link className="btn small" href={`/admin/templates/${t.key}`}>View & assign</Link>
              <a className="btn ghost small" href={templatePreviewUrl(t.key)} target="_blank" rel="noreferrer">Open preview</a>
            </div>
          </section>
        ))}
      </div>
    </Shell>
  );
}
