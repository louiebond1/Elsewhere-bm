import 'server-only';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import * as S from '../db/schema';
import type { Ctx } from '../services/context';
import { roleCharges, roleCounters, criteriaFor, roleForActor } from '../services/roles';
import { clientCandidateDTO, candidateLabelForClient } from '../dto/candidate';
import { resolveRoleRef } from '../services/intros';
import { compareMatches } from '../lib/matching-rules';
import { balances, getWallet } from '../services/ledger';
import { activeContractForClient, instalmentSchedule } from '../services/contracts';
import { activeGrant, clientMaySeeCandidateOnRole } from '../policies/privacy';
import { notFound } from '../lib/errors';
import { roleScopedRef } from '../dto/refs';
import { prototype } from '../../config/prototype';

export async function clientSummary(ctx: Ctx, clientId: string) {
  const [c] = await ctx.tx.select({ id: S.clients.id, name: S.organisations.displayName, consultantId: S.clients.consultantUserId, contactName: S.clients.contactName }).from(S.clients).innerJoin(S.organisations, eq(S.organisations.id, S.clients.organisationId)).where(eq(S.clients.id, clientId));
  const [consultant] = await ctx.tx.select({ name: S.users.displayName, email: S.users.emailNormalized }).from(S.users).where(eq(S.users.id, c.consultantId));
  const [onb] = await ctx.tx.select().from(S.clientOnboarding).where(eq(S.clientOnboarding.clientId, clientId));
  return { ...c, consultant, onboarding: onb ?? null };
}

export async function walletView(ctx: Ctx, clientId: string) {
  const w = await getWallet(ctx, clientId);
  if (!w) return { posted: '0', held: '0', spendable: '0', walletId: null };
  const b = await balances(ctx, w.id);
  return { posted: b.posted.toString(), held: b.held.toString(), spendable: b.spendable.toString(), walletId: w.id };
}

export async function rolesForClient(ctx: Ctx, clientId: string) {
  const rs = await ctx.tx.select().from(S.roles).where(eq(S.roles.clientId, clientId)).orderBy(S.roles.vacancyKey);
  const out = [];
  for (const r of rs) {
    const ch = r.status === 'draft' ? null : await roleCharges(ctx, r.id);
    const pipe = await ctx.tx.select({ stage: S.pipelineEntries.stage }).from(S.pipelineEntries).innerJoin(S.introductions, eq(S.introductions.id, S.pipelineEntries.introductionId)).where(eq(S.introductions.roleId, r.id));
    const activePipe = pipe.filter((p) => !['rejected', 'withdrawn', 'hired'].includes(p.stage)).length;
    const next = r.status === 'draft' ? 'Check it and make it live' : ch && ch.pending ? `Waiting for ${ch.pending} ${ch.pending === 1 ? 'person' : 'people'} to answer` : activePipe ? `${activePipe} ${activePipe === 1 ? 'person' : 'people'} to interview` : ch && ch.accepted === 0 ? 'Look at your candidates' : 'Keep interviews moving';
    out.push({ id: r.id, title: r.title, vacancyKey: r.vacancyKey, status: r.status, salaryPence: r.salaryPence.toString(), workMode: r.workMode, isExtra: r.isExtraRole, isReplacement: r.isReplacementRole, mode: r.defaultServiceMode, charges: ch, activePipe, next });
  }
  return out;
}

export type ClientMatchCard = Awaited<ReturnType<typeof clientCandidateDTO>> & { score?: number };

/** Matches for a role, policy-filtered at read time. Low confidence goes to "Worth a conversation". */
export async function roleMatches(ctx: Ctx, roleId: string) {
  const role = await roleForActor(ctx, roleId);
  const ms = await ctx.tx.select().from(S.matches).where(and(eq(S.matches.roleId, roleId), ne(S.matches.eligibility, 'incompatible')));
  const refs = await ctx.tx.select({ id: S.candidates.id, ref: S.candidates.publicRef }).from(S.candidates).where(inArray(S.candidates.id, ms.length ? ms.map((m) => m.candidateId) : ['00000000-0000-0000-0000-000000000000']));
  const refOf = new Map(refs.map((r) => [r.id, r.ref]));
  const sorted = ms.map((m) => ({ m, publicRef: refOf.get(m.candidateId) ?? '', eligibility: m.eligibility, score: m.score, coverageBps: m.coverageBps })).sort(compareMatches);
  const counters = await roleCounters(ctx, roleId);
  const strong: ClientMatchCard[] = [];
  const worth: ClientMatchCard[] = [];
  for (const s of sorted) {
    const [intro] = await ctx.tx.select({ state: S.introductions.state }).from(S.introductions).where(and(eq(S.introductions.roleId, roleId), eq(S.introductions.candidateId, s.m.candidateId)));
    if (!(await clientMaySeeCandidateOnRole(ctx, { candidateId: s.m.candidateId, clientId: role.clientId, roleId, hasIntro: !!intro && ['pending', 'accepted'].includes(intro.state) }))) continue;
    const [scr] = await ctx.tx.select({ status: S.screenings.status }).from(S.screenings).where(and(eq(S.screenings.roleId, roleId), eq(S.screenings.candidateId, s.m.candidateId)));
    const flags = { canRequestIntro: role.status === 'open' && !intro && counters.accepted + counters.pending < prototype.maxAcceptedIntros && !s.m.stale, canRequestScreening: role.status === 'open' && (!scr || scr.status === 'cancelled') && counters.screeningsUsed < prototype.includedScreenings };
    const dto = await clientCandidateDTO(ctx, { roleId, clientId: role.clientId, candidateId: s.m.candidateId, match: s.m, actionFlags: flags });
    (s.m.confidence === 'low' ? worth : strong).push(dto);
  }
  return { strong, worth };
}

export async function candidateOnRole(ctx: Ctx, roleId: string, ref: string) {
  const role = await roleForActor(ctx, roleId);
  const candidateId = await resolveRoleRef(ctx, roleId, ref);
  const [m] = await ctx.tx.select().from(S.matches).where(and(eq(S.matches.roleId, roleId), eq(S.matches.candidateId, candidateId)));
  const [intro] = await ctx.tx.select().from(S.introductions).where(and(eq(S.introductions.roleId, roleId), eq(S.introductions.candidateId, candidateId)));
  const hasIntro = !!intro && ['pending', 'accepted'].includes(intro.state);
  if ((!m || m.eligibility === 'incompatible') && !hasIntro) throw notFound();
  if (!(await clientMaySeeCandidateOnRole(ctx, { candidateId, clientId: role.clientId, roleId, hasIntro }))) throw notFound();
  const counters = await roleCounters(ctx, roleId);
  const [scr] = await ctx.tx.select({ id: S.screenings.id, status: S.screenings.status }).from(S.screenings).where(and(eq(S.screenings.roleId, roleId), eq(S.screenings.candidateId, candidateId)));
  const flags = { canRequestIntro: role.status === 'open' && !intro && counters.accepted + counters.pending < prototype.maxAcceptedIntros && !(m?.stale), canRequestScreening: role.status === 'open' && (!scr || scr.status === 'cancelled') && counters.screeningsUsed < prototype.includedScreenings };
  const dto = await clientCandidateDTO(ctx, { roleId, clientId: role.clientId, candidateId, match: m ?? null, actionFlags: flags });
  const [hire] = intro ? await ctx.tx.select({ start: S.hires.startDate }).from(S.hires).where(eq(S.hires.introductionId, intro.id)) : [];
  return { hiredStart: hire?.start ?? null, role: { id: role.id, title: role.title, status: role.status }, dto, introId: intro && intro.acceptedAt ? intro.id : intro?.state === 'pending' ? intro.id : null, introState: intro?.state ?? null, counters };
}

export async function pipelineForRole(ctx: Ctx, roleId: string) {
  const role = await roleForActor(ctx, roleId);
  const rows = await ctx.tx.select({ intro: S.introductions, stage: S.pipelineEntries.stage, note: S.pipelineEntries.clientNote }).from(S.introductions).leftJoin(S.pipelineEntries, eq(S.pipelineEntries.introductionId, S.introductions.id)).where(eq(S.introductions.roleId, roleId)).orderBy(desc(S.introductions.requestedAt));
  const out = [];
  for (const r of rows) {
    const [c] = await ctx.tx.select({ status: S.candidates.status, ref: S.candidates.publicRef }).from(S.candidates).where(eq(S.candidates.id, r.intro.candidateId));
    const deleted = !c || c.status === 'deleting' || c.status === 'deleted';
    const lbl = deleted ? { label: 'This profile is no longer available for this role.', identified: false } : await candidateLabelForClient(ctx, { roleId, clientId: role.clientId, candidateId: r.intro.candidateId, fallbackRef: c.ref });
    const [hire] = await ctx.tx.select({ id: S.hires.id }).from(S.hires).where(eq(S.hires.introductionId, r.intro.id));
    out.push({ introId: r.intro.id, state: r.intro.state, stage: r.stage, note: r.note, label: lbl.label, identified: lbl.identified, ref: deleted ? null : roleScopedRef(roleId, r.intro.candidateId), expiresAt: r.intro.expiresAt.toISOString(), requestedAt: r.intro.requestedAt.toISOString(), hired: !!hire, unavailable: deleted });
  }
  return out;
}

export async function screeningsForRole(ctx: Ctx, roleId: string) {
  await roleForActor(ctx, roleId);
  const rows = await ctx.tx.select().from(S.screenings).where(eq(S.screenings.roleId, roleId)).orderBy(desc(S.screenings.createdAt));
  return rows.map((s) => ({ id: s.id, status: s.status, mode: s.selectionMode, summarySafe: s.status === 'completed' ? s.summarySafe : null, ref: roleScopedRef(roleId, s.candidateId), scheduledAt: s.scheduledAt?.toISOString() ?? null }));
}

const ACTION_LABEL: Record<string, string> = {
  'role.draft_created': 'Draft created', 'role.activated': 'Role activated inside the open-role limit', 'role.activated_extra': 'Extra role activated and deposit paid', 'role.closed': 'Role closed', 'role.reopened': 'Role reopened', 'role.upgraded_full_search': 'Upgraded to full search', 'role.brief_updated': 'Brief updated',
  'hold.created': 'Deposit reserved for pending introductions', 'hold.released': 'Reservation released', 'intro.requested': 'Introduction requested', 'intro.accepted': 'Introduction accepted', 'intro.declined': 'Introduction declined', 'intro.withdrawn': 'Candidate withdrew', 'intro.cancelled': 'Request cancelled',
  'screening.requested': 'Screening requested', 'screening.completed': 'Screening completed', 'screening.auto_confirmed': 'Automatic screening picks confirmed', 'hire.recorded': 'Hire recorded', 'hire.outside_recorded': 'Outside-system hire recorded', 'pipeline.stage_changed': 'Pipeline stage changed', 'ranking.adjusted': 'Consultant ranking review', 'prep.updated': 'Interview preparation updated',
};

export async function activityForRole(ctx: Ctx, roleId: string) {
  await roleForActor(ctx, roleId);
  const intros = await ctx.tx.select({ id: S.introductions.id }).from(S.introductions).where(eq(S.introductions.roleId, roleId));
  const hs = await ctx.tx.select({ id: S.hires.id }).from(S.hires).where(eq(S.hires.roleId, roleId));
  const ids = [roleId, ...intros.map((i) => i.id), ...hs.map((h) => h.id)];
  const rows = await ctx.tx.select().from(S.activityEvents).where(inArray(S.activityEvents.subjectId, ids)).orderBy(desc(S.activityEvents.createdAt)).limit(50);
  return rows.map((r) => ({ id: r.id, at: r.eventAt.toISOString(), label: ACTION_LABEL[r.action] ?? r.action }));
}

export async function creditsView(ctx: Ctx, clientId: string, filter: { type?: string; roleId?: string }) {
  const wallet = await walletView(ctx, clientId);
  const contract = await activeContractForClient(ctx, clientId);
  const all = await ctx.tx.select().from(S.contracts).where(eq(S.contracts.clientId, clientId)).orderBy(desc(S.contracts.startDate));
  const txs = await ctx.tx.select({ t: S.creditTransactions, roleTitle: S.roles.title, vacancyKey: S.roles.vacancyKey }).from(S.creditTransactions).leftJoin(S.roles, eq(S.roles.id, S.creditTransactions.roleId)).where(eq(S.creditTransactions.clientId, clientId)).orderBy(desc(S.creditTransactions.seq)).limit(50);
  const ledger = txs.filter((x) => (!filter.type || x.t.type === filter.type) && (!filter.roleId || x.t.roleId === filter.roleId)).map((x) => ({ id: x.t.id, type: x.t.type, units: x.t.deltaUnits.toString(), pence: x.t.deltaPence.toString(), rate: x.t.valuationRatePence, reason: x.t.reason, at: x.t.businessEventAt.toISOString(), balanceAfter: x.t.balanceAfterUnits.toString(), role: x.roleTitle ? `${x.roleTitle} (${x.vacancyKey})` : null, roleId: x.t.roleId, orderId: x.t.orderId, reversalOf: x.t.reversalOfId }));
  const rolesList = await ctx.tx.select({ id: S.roles.id, title: S.roles.title, key: S.roles.vacancyKey }).from(S.roles).where(eq(S.roles.clientId, clientId));
  return { wallet, contract, contracts: all.map((c) => ({ id: c.id, label: c.label, planType: c.planType, status: c.status, startDate: c.startDate, endDate: c.endDate, rate: c.creditRatePence, roles: c.includedOpenRoles, committed: c.committedCreditUnits.toString(), rollover: c.rolloverNote, exclusivity: c.exclusivityNote, schedule: c.creditRatePence ? instalmentSchedule(c) : null })), ledger, roles: rolesList };
}

export async function receipt(ctx: Ctx, clientId: string | null, txId: string) {
  const [t] = await ctx.tx.select().from(S.creditTransactions).where(and(eq(S.creditTransactions.id, txId), eq(S.creditTransactions.datasetId, ctx.datasetId)));
  if (!t || (clientId && t.clientId !== clientId)) throw notFound();
  const order = t.orderId ? (await ctx.tx.select().from(S.hireOrders).where(eq(S.hireOrders.id, t.orderId)))[0] : null;
  const previous = order ? (await ctx.tx.select().from(S.creditTransactions).where(eq(S.creditTransactions.orderId, order.id))).filter((x) => x.seq < t.seq) : [];
  return { t, order, previous };
}

export async function hiresForClient(ctx: Ctx, clientId: string) {
  const rows = await ctx.tx.select({ h: S.hires, title: S.roles.title, key: S.roles.vacancyKey, order: S.hireOrders }).from(S.hires).innerJoin(S.roles, eq(S.roles.id, S.hires.roleId)).innerJoin(S.hireOrders, eq(S.hireOrders.id, S.hires.orderId)).where(eq(S.hires.clientId, clientId)).orderBy(desc(S.hires.startDate));
  const out = [];
  for (const r of rows) {
    const lbl = await candidateLabelForClient(ctx, { roleId: r.h.roleId, clientId, candidateId: r.h.candidateId, fallbackRef: r.h.candidateRefSnapshot });
    const [rc] = await ctx.tx.select().from(S.replacementCases).where(eq(S.replacementCases.originalHireId, r.h.id));
    out.push({ id: r.h.id, roleId: r.h.roleId, role: `${r.title} (${r.key})`, label: lbl.label, start: r.h.startDate, offer: r.h.acceptedOfferDate, status: r.h.status, leftDate: r.h.leftDate, source: r.h.source, orderKind: r.order.kind, orderNumber: r.order.orderNumber, totalUnits: r.order.totalUnits.toString(), totalPence: r.order.totalPence.toString(), replacement: rc ? { id: rc.id, status: rc.status, eligibility: rc.eligibility, roleId: rc.replacementRoleId } : null });
  }
  return out;
}

/** Accepted introductions with an active grant whose pipeline still needs action. */
export async function awaitingAction(ctx: Ctx, clientId: string) {
  const rows = await ctx.tx.select({ i: S.introductions, stage: S.pipelineEntries.stage }).from(S.introductions).innerJoin(S.pipelineEntries, eq(S.pipelineEntries.introductionId, S.introductions.id)).where(and(eq(S.introductions.clientId, clientId), eq(S.introductions.state, 'accepted'), inArray(S.pipelineEntries.stage, ['introduced', 'interview', 'offer'])));
  let n = 0;
  for (const r of rows) if (await activeGrant(ctx, { candidateId: r.i.candidateId, clientId, roleId: r.i.roleId })) n++;
  return n;
}

export { criteriaFor, isNull };
