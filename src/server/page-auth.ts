import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, GATE_COOKIE, gateValid, viewerFromToken, csrfFor, isDemoMode, type Viewer } from './auth';
import { readCtx, type Ctx } from './services/context';
import { notFound } from 'next/navigation';

export async function gateOk() {
  if (!isDemoMode()) notFound();
  const c = await cookies();
  return gateValid(c.get(GATE_COOKIE)?.value);
}

/** Server-component guard. Redirects to the gate or login, or to /403 for the wrong area. */
export async function pageViewer(type?: 'candidate' | 'client' | 'consultant'): Promise<{ viewer: Viewer; ctx: Ctx; csrf: string }> {
  if (!(await gateOk())) redirect('/demo');
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  const viewer = await viewerFromToken(token);
  if (!viewer || !token) redirect('/login');
  if (type && viewer.actor.userType !== type) redirect('/403');
  const ctx = readCtx({ datasetId: viewer.datasetId, generation: viewer.generation, now: viewer.businessNow, actor: viewer.actor });
  return { viewer, ctx, csrf: csrfFor(token) };
}

export async function optionalViewer() {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  return viewerFromToken(token);
}
