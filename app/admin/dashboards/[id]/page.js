import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '../../../../lib/admin-auth.js';
import { dashboardUrl, getDashboard, listClients } from '../../../../lib/admin.js';
import { regenerateToken } from '../../actions.js';
import CopyLink from '../../CopyLink.js';
import Shell from '../../Shell.js';
import DashboardForm from '../DashboardForm.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditDashboardPage({ params, searchParams }) {
  requireAdmin();
  if (!UUID_RE.test(params.id)) notFound();
  const [dashboard, clients] = await Promise.all([getDashboard(params.id), listClients()]);
  if (!dashboard) notFound();

  return (
    <Shell crumb={dashboard.name}>
      <Link className="back" href="/admin">← Back</Link>
      <div className="page-head">
        <div>
          <h1>{dashboard.name}</h1>
          <p className="muted mono">/{dashboard.slug}</p>
        </div>
      </div>
      {searchParams?.saved && <div className="notice ok">Saved.</div>}
      {searchParams?.error && <div className="notice err">{searchParams.error}</div>}

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Share link</h2>
            <p className="card-desc">Send this to the client or paste it into their Assembly dashboard embed.</p>
          </div>
        </div>
        <CopyLink url={dashboardUrl(dashboard.slug, dashboard.token)} />
        <form action={regenerateToken} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={dashboard.id} />
          <button className="btn ghost small" type="submit">Regenerate token</button>
          <span className="hint" style={{ marginLeft: 8 }}>The old link stops working.</span>
        </form>
      </section>

      <section className="card">
        <div className="card-head"><h2 className="card-title">Settings</h2></div>
        <DashboardForm dashboard={dashboard} clients={clients} />
      </section>
    </Shell>
  );
}
