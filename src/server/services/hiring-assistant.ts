import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { hiringConversations, hiringManagerMemory, users, roles, clients, organisations } from '../db/schema';
import { conflict, invalid, notFound } from '../lib/errors';
import { isUuid } from '../lib/ids';
import { requireUser, type Ctx } from './context';
import { createDraftRole } from './roles';
import { logActivity } from './audit';
import {
  EMPTY, missingSlots, readyToSave, readMessage, demoReply, sanitise, toCriteria, notJobRelated,
  MODE_LABEL, REGION_LABEL, type Understanding, type Slot, type Region, type Mode,
} from '../../lib/hiring';

export type Msg = { role: 'assistant' | 'user'; text: string; at: string };
export type Fact = { id: string; kind: 'work_pattern' | 'teaches' | 'priorities' | 'note'; text: string };
type Defaults = { locationRegion?: Region; workMode?: Mode };

const MAX_MESSAGES = 40;
const MAX_NOTES = 5;

function clientUser(ctx: Ctx) {
  const a = requireUser(ctx.actor, 'client');
  if (!a.clientId) throw notFound();
  return { userId: a.userId, clientId: a.clientId };
}

async function firstName(ctx: Ctx, userId: string) {
  const [u] = await ctx.tx.select({ n: users.displayName }).from(users).where(eq(users.id, userId));
  return (u?.n ?? '').split(' ')[0] || 'there';
}

async function memoryRow(ctx: Ctx, userId: string) {
  const [m] = await ctx.tx.select().from(hiringManagerMemory).where(and(eq(hiringManagerMemory.datasetId, ctx.datasetId), eq(hiringManagerMemory.userId, userId)));
  return m ?? null;
}

/** Opening message and starting understanding. Returning managers get their usual location and work pattern assumed. */
function opening(name: string, mem: Awaited<ReturnType<typeof memoryRow>>): { text: string; understanding: Understanding } {
  const u: Understanding = structuredClone(EMPTY);
  if (!mem || mem.rolesCreated === 0) {
    return { understanding: u, text: `Hi ${name}, I'm your hiring assistant. Tell me about the person you need, in your own words. I'll ask about anything else I need, then set up the role for you.` };
  }
  const d = (mem.defaults ?? {}) as Defaults;
  if (d.locationRegion) { u.locationRegion = d.locationRegion; u.assumed.push('locationRegion'); }
  if (d.workMode) { u.workMode = d.workMode; u.assumed.push('workMode'); }
  const assumed = d.locationRegion && d.workMode ? ` I've assumed ${MODE_LABEL[d.workMode].toLowerCase()} in ${REGION_LABEL[d.locationRegion]} like last time; just tell me if this one's different.` : '';
  return { understanding: u, text: `Welcome back, ${name}. Last time we set up ${mem.lastRoleTitle ?? 'a role'} together.${assumed} What are you hiring for this time?` };
}

/** Page model: the active conversation if there is one, otherwise the opening message (nothing is stored until the first reply). */
export async function assistantView(ctx: Ctx) {
  const { userId, clientId } = clientUser(ctx);
  const [conv] = await ctx.tx.select().from(hiringConversations).where(and(eq(hiringConversations.userId, userId), eq(hiringConversations.clientId, clientId), eq(hiringConversations.status, 'active'), eq(hiringConversations.datasetId, ctx.datasetId))).orderBy(desc(hiringConversations.createdAt)).limit(1);
  const mem = await memoryRow(ctx, userId);
  const facts = ((mem?.facts ?? []) as Fact[]);
  if (conv) return { conversationId: conv.id, rowVersion: conv.rowVersion, messages: conv.messages as Msg[], understanding: conv.understanding as Understanding, lastAsked: (conv.lastAsked as Slot | null) ?? null, facts };
  const o = opening(await firstName(ctx, userId), mem);
  return { conversationId: null, rowVersion: 0, messages: [{ role: 'assistant', text: o.text, at: ctx.now.toISOString() }] as Msg[], understanding: o.understanding, lastAsked: null as Slot | null, facts };
}

export type Prepared = { userId: string; clientId: string; conv: typeof hiringConversations.$inferSelect | null; messages: Msg[]; understanding: Understanding; lastAsked: Slot | null; memory: string[] };

/** Read-only: everything a turn needs, so any AI call can happen outside a transaction. */
export async function prepareTurn(ctx: Ctx, conversationId: string | null): Promise<Prepared> {
  const { userId, clientId } = clientUser(ctx);
  const mem = await memoryRow(ctx, userId);
  const memory = ((mem?.facts ?? []) as Fact[]).map((f) => f.text);
  if (!conversationId) {
    const o = opening(await firstName(ctx, userId), mem);
    return { userId, clientId, conv: null, messages: [{ role: 'assistant', text: o.text, at: ctx.now.toISOString() }], understanding: o.understanding, lastAsked: null, memory };
  }
  if (!isUuid(conversationId)) throw notFound();
  const [conv] = await ctx.tx.select().from(hiringConversations).where(and(eq(hiringConversations.id, conversationId), eq(hiringConversations.datasetId, ctx.datasetId)));
  if (!conv || conv.userId !== userId) throw notFound();
  if (conv.status !== 'active') throw conflict('CONVERSATION_CLOSED', 'This conversation has finished. Start a new one to add another role.');
  return { userId, clientId, conv, messages: conv.messages as Msg[], understanding: conv.understanding as Understanding, lastAsked: (conv.lastAsked as Slot | null) ?? null, memory };
}

export type TurnResult = { understanding: Understanding; reply: string; asked: Slot | null; learned: string[]; provider: 'fixture' | 'anthropic' };

/** What the live model receives for one turn. */
export function liveInput(p: Prepared, text: string) {
  return { messages: [...p.messages, { role: 'user' as const, text }].map((m) => ({ role: m.role, text: m.text })), understanding: p.understanding, memory: p.memory, missing: missingSlots(p.lastAsked === 'teachable' ? { ...p.understanding, askedTeachable: true } : p.understanding) };
}

/** Demo mode: keyword reader plus templated wording. */
export function demoTurn(p: Prepared, text: string): TurnResult {
  const declined = notJobRelated(text);
  const next = readMessage(p.understanding, text, p.lastAsked);
  const r = demoReply(p.understanding, next, declined);
  return { understanding: next, reply: r.text, asked: r.asked, learned: [], provider: 'fixture' };
}

/** Live mode: the model's proposal is clamped to allowed values; readiness is decided here, not by the model. */
export function liveResult(p: Prepared, out: { reply: string; understanding: Record<string, unknown>; learned: string[] }, provider: 'anthropic' | 'fixture'): TurnResult {
  const prev = p.lastAsked === 'teachable' ? { ...p.understanding, askedTeachable: true } : p.understanding;
  const next = sanitise(out.understanding as Partial<Understanding> & Record<string, unknown>, prev);
  const asked = missingSlots(next)[0] ?? null;
  const learned = out.learned.map((l) => l.trim()).filter((l) => l && !notJobRelated(l)).slice(0, 3);
  return { understanding: next, reply: out.reply.trim() || 'Thanks. Tell me a bit more.', asked, learned, provider };
}

/** Stores the user's message and the reply. Refuses if the conversation moved on since it was read. */
export async function commitTurn(ctx: Ctx, p: Prepared, text: string, r: TurnResult) {
  const now = ctx.now.toISOString();
  const messages: Msg[] = [...p.messages, { role: 'user', text: text.slice(0, 2000), at: now }, { role: 'assistant', text: r.reply, at: now }];
  if (messages.length > MAX_MESSAGES) throw conflict('CONVERSATION_TOO_LONG', 'This conversation is getting long. Save what you have as a draft, or start over.');
  let id: string;
  if (!p.conv) {
    const [row] = await ctx.tx.insert(hiringConversations).values({ datasetId: ctx.datasetId, clientId: p.clientId, userId: p.userId, messages, understanding: r.understanding, lastAsked: r.asked, provider: r.provider }).returning();
    id = row.id;
  } else {
    const [row] = await ctx.tx.update(hiringConversations).set({ messages, understanding: r.understanding, lastAsked: r.asked, provider: r.provider, updatedAt: new Date(), rowVersion: p.conv.rowVersion + 1 })
      .where(and(eq(hiringConversations.id, p.conv.id), eq(hiringConversations.rowVersion, p.conv.rowVersion), eq(hiringConversations.status, 'active'))).returning();
    if (!row) throw conflict('CONVERSATION_CHANGED', 'This conversation changed in another window. Refresh to continue.');
    id = row.id;
  }
  if (r.learned.length) await rememberNotes(ctx, p.userId, p.clientId, r.learned);
  return { id };
}

async function upsertMemory(ctx: Ctx, userId: string, clientId: string, patch: (m: { facts: Fact[]; defaults: Defaults; rolesCreated: number; lastRoleTitle: string | null }) => void) {
  const [existing] = await ctx.tx.select().from(hiringManagerMemory).where(and(eq(hiringManagerMemory.datasetId, ctx.datasetId), eq(hiringManagerMemory.userId, userId))).for('update');
  const m = { facts: ((existing?.facts ?? []) as Fact[]).slice(), defaults: { ...((existing?.defaults ?? {}) as Defaults) }, rolesCreated: existing?.rolesCreated ?? 0, lastRoleTitle: existing?.lastRoleTitle ?? null };
  patch(m);
  if (existing) await ctx.tx.update(hiringManagerMemory).set({ ...m, updatedAt: new Date(), rowVersion: existing.rowVersion + 1 }).where(eq(hiringManagerMemory.id, existing.id));
  else await ctx.tx.insert(hiringManagerMemory).values({ datasetId: ctx.datasetId, clientId, userId, ...m });
}

async function rememberNotes(ctx: Ctx, userId: string, clientId: string, notes: string[]) {
  await upsertMemory(ctx, userId, clientId, (m) => {
    for (const n of notes) if (!m.facts.some((f) => f.text.toLowerCase() === n.toLowerCase())) m.facts.push({ id: randomUUID(), kind: 'note', text: n });
    const kept = m.facts.filter((f) => f.kind === 'note').slice(-MAX_NOTES).map((f) => f.id);
    m.facts = m.facts.filter((f) => f.kind !== 'note' || kept.includes(f.id));
  });
}

async function nextVacancyKey(ctx: Ctx, clientId: string) {
  const rs = await ctx.tx.select({ k: roles.vacancyKey }).from(roles).where(eq(roles.clientId, clientId));
  let prefix: string | null = null;
  let max = 0;
  for (const r of rs) {
    const m = r.k.match(/^([A-Z]{2,5})-(\d{1,4})$/);
    if (m) { prefix ??= m[1]; if (m[1] === prefix) max = Math.max(max, Number(m[2])); }
  }
  if (!prefix) {
    const [o] = await ctx.tx.select({ n: organisations.displayName }).from(clients).innerJoin(organisations, eq(organisations.id, clients.organisationId)).where(eq(clients.id, clientId));
    prefix = (o?.n ?? 'ROLE').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  }
  const taken = new Set(rs.map((r) => r.k));
  let n = max + 1;
  while (taken.has(`${prefix}-${String(n).padStart(3, '0')}`)) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

/** Saves the conversation as an ordinary draft role (free, no slot used) and updates what the assistant knows about this manager. */
export async function saveAsDraft(ctx: Ctx, conversationId: string) {
  const p = await prepareTurn(ctx, conversationId);
  const [conv] = await ctx.tx.select().from(hiringConversations).where(eq(hiringConversations.id, conversationId)).for('update');
  if (conv.status !== 'active') throw conflict('CONVERSATION_CLOSED', 'This conversation has already been saved.');
  const u = conv.understanding as Understanding;
  if (!readyToSave(u)) throw invalid('I still need a few details before saving.', Object.fromEntries(missingSlots(u).filter((s) => s !== 'teachable').map((s) => [s, 'Still needed'])));
  const transcript = (conv.messages as Msg[]).filter((m) => m.role === 'user').map((m) => m.text).join('\n').slice(0, 8000);
  const role = await createDraftRole(ctx, {
    vacancyKey: await nextVacancyKey(ctx, p.clientId),
    title: u.title, roleFamily: u.roleFamily, salaryPounds: u.salaryPounds, locationRegion: u.locationRegion, workMode: u.workMode,
    workAuthorisationRequired: true, outcomes: u.outcomes, teachableSkills: u.teachable, briefText: transcript, serviceMode: 'standard', criteria: toCriteria(u),
  });
  await ctx.tx.update(hiringConversations).set({ status: 'saved', roleId: role.id, updatedAt: new Date(), rowVersion: conv.rowVersion + 1 }).where(eq(hiringConversations.id, conv.id));
  await upsertMemory(ctx, p.userId, p.clientId, (m) => {
    const put = (kind: Fact['kind'], text: string | null) => { m.facts = m.facts.filter((f) => f.kind !== kind); if (text) m.facts.push({ id: randomUUID(), kind, text }); };
    put('work_pattern', `Usually hires for ${MODE_LABEL[u.workMode!].toLowerCase()} roles in ${REGION_LABEL[u.locationRegion!]}`);
    put('priorities', u.mustHaves.length ? `Tends to prioritise ${u.mustHaves.slice(0, 3).map((i) => i.label.toLowerCase()).join(', ')}` : null);
    if (u.teachable.length) put('teaches', `Happy to teach: ${u.teachable.slice(0, 3).join('; ')}`);
    m.defaults = { locationRegion: u.locationRegion!, workMode: u.workMode! };
    m.rolesCreated += 1;
    m.lastRoleTitle = u.title;
  });
  await logActivity(ctx, { subjectType: 'role', subjectId: role.id, action: 'role.drafted_with_assistant', clientId: p.clientId });
  return role;
}

export async function startOver(ctx: Ctx, conversationId: string) {
  const p = await prepareTurn(ctx, conversationId);
  await ctx.tx.update(hiringConversations).set({ status: 'abandoned', updatedAt: new Date() }).where(and(eq(hiringConversations.id, p.conv!.id), eq(hiringConversations.status, 'active')));
  return { id: p.conv!.id };
}

/** The manager can remove anything the assistant remembers about them. */
export async function forgetFact(ctx: Ctx, factId: string) {
  const { userId, clientId } = clientUser(ctx);
  const mem = await memoryRow(ctx, userId);
  if (!mem || !((mem.facts ?? []) as Fact[]).some((f) => f.id === factId)) throw notFound();
  await upsertMemory(ctx, userId, clientId, (m) => {
    const f = m.facts.find((x) => x.id === factId);
    m.facts = m.facts.filter((x) => x.id !== factId);
    if (f?.kind === 'work_pattern') m.defaults = {};
  });
  return { id: factId };
}

/** Removes one item from the summary (a must-have, bonus, goal or teachable thing) without typing. */
export async function removeItem(ctx: Ctx, conversationId: string, list: 'mustHaves' | 'niceToHaves' | 'outcomes' | 'teachable', index: number) {
  const p = await prepareTurn(ctx, conversationId);
  const u: Understanding = structuredClone(p.understanding);
  const arr = u[list] as unknown[];
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) throw notFound();
  arr.splice(index, 1);
  const [row] = await ctx.tx.update(hiringConversations).set({ understanding: u, lastAsked: missingSlots(u)[0] ?? null, updatedAt: new Date(), rowVersion: p.conv!.rowVersion + 1 })
    .where(and(eq(hiringConversations.id, p.conv!.id), eq(hiringConversations.rowVersion, p.conv!.rowVersion))).returning();
  if (!row) throw conflict('CONVERSATION_CHANGED', 'This conversation changed in another window. Refresh to continue.');
  return { id: row.id };
}
