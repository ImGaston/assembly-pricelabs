import Link from 'next/link';
import { requireAdmin } from '../../../../lib/admin-auth.js';
import { listClients } from '../../../../lib/admin.js';
import Shell from '../../Shell.js';
import DashboardForm from '../DashboardForm.js';

export default async function NewDashboardPage({ searchParams }) {
  requireAdmin();
  const clients = await listClients();
  return (
    <Shell crumb="New">
      <Link className="back" href="/admin">← Back</Link>
      <div className="page-head"><h1>New beta dashboard</h1></div>
      {searchParams?.error && <div className="notice err">{searchParams.error}</div>}
      <section className="card"><DashboardForm clients={clients} /></section>
    </Shell>
  );
}
