'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { checkPassword, endSession, requireAdmin, startSession } from '../../lib/admin-auth.js';
import { clearClientCache } from '../../lib/clients.js';
import {
  createDashboard,
  normalizeDashboardInput,
  regenerateDashboardToken,
  setClientLayout,
  setClientVariant,
  updateDashboard,
} from '../../lib/admin.js';

function done(path) {
  clearClientCache();
  revalidatePath('/admin');
  redirect(path);
}

function dbErrorMessage(err) {
  if (err?.code === '23505') return 'That slug is already in use.';
  return 'Could not save. Check the server logs.';
}

export async function login(formData) {
  if (!checkPassword(String(formData.get('password') || ''))) {
    // Slow down guessing; the password is the only gate.
    await new Promise((r) => setTimeout(r, 1000));
    redirect('/admin/login?error=1');
  }
  startSession();
  redirect('/admin');
}

export async function signOut() {
  endSession();
  redirect('/admin/login');
}

export async function toggleClientVariant(formData) {
  requireAdmin();
  await setClientVariant(String(formData.get('client_id')), String(formData.get('variant')));
  done('/admin');
}

export async function changeClientLayout(formData) {
  requireAdmin();
  await setClientLayout(String(formData.get('client_id')), String(formData.get('layout')));
  done('/admin');
}

export async function saveDashboard(formData) {
  requireAdmin();
  const id = String(formData.get('id') || '');
  const back = id ? `/admin/dashboards/${id}` : '/admin/dashboards/new';

  const { values, error } = normalizeDashboardInput(formData);
  if (error) redirect(`${back}?error=${encodeURIComponent(error)}`);

  let newId;
  try {
    if (id) await updateDashboard(id, values);
    else newId = await createDashboard(values, 'admin');
  } catch (err) {
    console.error('saveDashboard failed:', err.message);
    redirect(`${back}?error=${encodeURIComponent(dbErrorMessage(err))}`);
  }
  done(`/admin/dashboards/${id || newId}?saved=1`);
}

export async function regenerateToken(formData) {
  requireAdmin();
  const id = String(formData.get('id'));
  await regenerateDashboardToken(id);
  done(`/admin/dashboards/${id}?saved=1`);
}
