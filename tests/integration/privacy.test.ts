import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { readCtx } from '../../src/server/services/context';
import { roleMatches, candidateOnRole, pipelineForRole } from '../../src/server/views/client';
import { acceptIntroduction, withdrawIntroduction, requestIntroduction } from '../../src/server/services/intros';
import { requestDeletion, setCurrentEmployer, addBlock, setDiscovery, reviseEvidence } from '../../src/server/services/candidates';
import { fileForDownload } from '../../src/server/services/files';
import { grantCredits } from '../../src/server/services/hires';
import { roleForActor } from '../../src/server/services/roles';
import { prepFor } from '../../src/server/services/prep';
import { drainJobs } from '../../src/server/services/worker-handlers';
import { CANDIDATES } from '../../fixtures/candidates';

const allNames = CANDIDATES.map((c) => c.name);
const employers = CANDIDATES.map((c) => c.employer).filter(Boolean) as string[];
const leaks = (json: string, allowed: string[] = []) => [...allNames, ...employers, '@example.test', '.pdf'].filter((s) => !allowed.includes(s) && json.includes(s));

describe('anonymous client DTOs (P01, P05, P06)', () => {
  it('match lists contain no names, emails, employers or filenames', async () => {
    const w = await load();
    for (const r of ['R1', 'R2', 'R4']) {
      const c = r === 'R4' ? 'B' : 'A';
      const m = await roleMatches(readCtx(w.client(c)), w.ids.roles[r]);
      const json = JSON.stringify(m);
      const allowed = r === 'R2' ? ['Isaac Green', '@example.test'] : r === 'R4' ? ['Amara James', '@example.test'] : [];
      expect(leaks(json, allowed)).toEqual([]);
    }
  });
  it('acceptance reveals name and email only for that client and role', async () => {
    const w = await load('S21');
    const i = await w.intro('R1', 'C01');
    await w.T(w.cand('C01'), (c) => acceptIntroduction(c, i.id, w.key()));
    const a = await candidateOnRole(readCtx(w.client('A')), w.ids.roles.R1, w.ref('R1', 'C01'));
    expect(a.dto.identity).toEqual({ fullName: 'Maya Ellis', email: 'candidate.c01@example.test' });
    const b = await candidateOnRole(readCtx(w.client('B')), w.ids.roles.R4, w.ref('R4', 'C01'));
    expect(b.dto.identity).toBeNull();
    expect(JSON.stringify(b)).not.toContain('Maya');
    // same client, another role: still anonymous (P06)
    const other = await roleMatches(readCtx(w.client('A')), w.ids.roles.R2);
    expect(JSON.stringify(other)).not.toContain('Maya');
    expect(JSON.stringify(a.dto)).not.toContain('Mallow');
  });
});

describe('employer blocks (P07, P08, S12)', () => {
  it('C05 never reaches Alder, by list or by role-scoped reference', async () => {
    const w = await load();
    const m = await roleMatches(readCtx(w.client('A')), w.ids.roles.R1);
    expect(JSON.stringify(m)).not.toContain(w.ref('R1', 'C05'));
    await expect(candidateOnRole(readCtx(w.client('A')), w.ids.roles.R1, w.ref('R1', 'C05'))).rejects.toMatchObject({ status: 404 });
    await expect(w.T(w.client('A'), (c) => requestIntroduction(c, { roleId: w.ids.roles.R1, candidateRef: w.ref('R1', 'C05'), message: '', idempotencyKey: w.key() }))).rejects.toMatchObject({ status: 404 });
  });
  it('a block revokes an existing grant and cancels pending requests immediately', async () => {
    const w = await load('S17');
    const i = await w.intro('R1', 'C01');
    const alder = w.ids.orgs['Alder Works'];
    await w.T(w.cand('C01'), (c) => addBlock(c, alder));
    const [g] = await db().select().from(S.identityGrants).where(eq(S.identityGrants.introductionId, i.id));
    expect(g.revocationReason).toBe('employer_block');
    await expect(candidateOnRole(readCtx(w.client('A')), w.ids.roles.R1, w.ref('R1', 'C01'))).rejects.toMatchObject({ status: 404 });
  });
  it('blocking the parent group hides from a client created later in that group', async () => {
    const w = await load();
    const group = w.ids.orgs['Alder Group'];
    await w.T(w.cand('C02'), (c) => addBlock(c, group));
    const m = await roleMatches(readCtx(w.client('A')), w.ids.roles.R1);
    expect(JSON.stringify(m)).not.toContain(w.ref('R1', 'C02'));
  });
  it('an unresolved typed employer pauses discovery (P09)', async () => {
    const w = await load();
    const r = await w.T(w.cand('C04'), (c) => setCurrentEmployer(c, { mode: 'typed', label: 'Some Unknown Firm' }));
    expect(r.status).toBe('unresolved');
    const m = await roleMatches(readCtx(w.client('A')), w.ids.roles.R1);
    expect(JSON.stringify(m)).not.toContain(w.ref('R1', 'C04'));
  });
});

describe('withdrawal, deletion and discovery (P10, P11, S18)', () => {
  it('withdraw removes identity from the client view', async () => {
    const w = await load('S17');
    const i = await w.intro('R1', 'C01');
    await w.T(w.cand('C01'), (c) => withdrawIntroduction(c, i.id));
    const pipe = await pipelineForRole(readCtx(w.client('A')), w.ids.roles.R1);
    expect(JSON.stringify(pipe)).not.toContain('Maya');
  });
  it('deletion revokes everything at once and the worker purges private data while finance stays', async () => {
    const w = await load('S18');
    const n = (await w.txs('A')).length;
    await w.T(w.cand('C01'), (c) => requestDeletion(c, 'TestOnly2026!', 'DELETE'));
    expect((await w.intro('R4', 'C01')).state).toBe('cancelled');
    expect((await w.intro('R1', 'C01')).state).toBe('withdrawn');
    const pipeA = await pipelineForRole(readCtx(w.client('A')), w.ids.roles.R1);
    expect(JSON.stringify(pipeA)).not.toContain('Maya');
    const mB = await roleMatches(readCtx(w.client('B')), w.ids.roles.R4);
    expect(JSON.stringify(mB)).not.toContain(w.ref('R4', 'C01'));
    await drainJobs();
    const [idn] = await db().select().from(S.candidateIdentity).where(eq(S.candidateIdentity.candidateId, w.ids.candidates.C01));
    expect(idn).toBeUndefined();
    const ev = await db().select().from(S.evidenceItems).where(eq(S.evidenceItems.candidateId, w.ids.candidates.C01));
    expect(ev).toHaveLength(0);
    const [c] = await db().select().from(S.candidates).where(eq(S.candidates.id, w.ids.candidates.C01));
    expect(c.status).toBe('deleted');
    const objs = await db().select().from(S.localObjects);
    expect(objs.some((o) => o.objectKey.includes(w.ids.candidates.C01))).toBe(false);
    expect((await w.txs('A')).length).toBe(n);
  });
  it('discovery off cancels pending and releases the hold', async () => {
    const w = await load('S16');
    await w.T(w.cand('C01'), (c) => setDiscovery(c, false));
    expect((await w.intro('R1', 'C01')).state).toBe('cancelled');
    expect((await w.wallet('A')).held).toBe('0');
  });
  it('editing evidence removes the old claim from client views immediately', async () => {
    const w = await load();
    const [old] = await db().select().from(S.evidenceItems).where(and(eq(S.evidenceItems.candidateId, w.ids.candidates.C01), eq(S.evidenceItems.strength, 'specific')));
    await w.T(w.cand('C01'), (c) => reviseEvidence(c, { evidenceId: old.id, claim: 'Updated private claim', safeClaim: 'Improved a recurring reconciliation check', tags: ['reconciliations'], uncertainty: null }));
    const m = await roleMatches(readCtx(w.client('A')), w.ids.roles.R1);
    expect(JSON.stringify(m)).not.toContain('18 to 4');
  });
});

describe('access control (P02, P03, P13, P14, P15, P16)', () => {
  it('clients cannot download CVs or recordings; candidates cannot get recordings', async () => {
    const w = await load();
    const [cv] = await db().select().from(S.files).where(and(eq(S.files.candidateId, w.ids.candidates.C25), eq(S.files.purpose, 'cv')));
    const [rec] = await db().select().from(S.files).where(eq(S.files.purpose, 'screening_recording'));
    await expect(fileForDownload(readCtx(w.client('B')), cv.id)).rejects.toMatchObject({ status: 404 });
    await expect(fileForDownload(readCtx(w.client('B')), rec.id)).rejects.toMatchObject({ status: 404 });
    await expect(fileForDownload(readCtx(w.cand('C25')), rec.id)).rejects.toMatchObject({ status: 404 });
    await expect(fileForDownload(readCtx(w.cand('C01')), cv.id)).rejects.toMatchObject({ status: 404 });
    expect((await fileForDownload(readCtx(w.cand('C25')), cv.id)).bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect((await fileForDownload(readCtx(w.consultant()), rec.id)).mime).toBe('audio/wav');
  });
  it('foreign role IDs are indistinguishable 404s', async () => {
    const w = await load();
    await expect(roleForActor(readCtx(w.client('B')), w.ids.roles.R1)).rejects.toMatchObject({ status: 404 });
    await expect(roleForActor(readCtx(w.client('B')), '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ status: 404 });
  });
  it('clients cannot grant credits and candidates cannot accept another candidate’s intro', async () => {
    const w = await load('S02');
    await expect(w.T(w.client('A'), (c) => grantCredits(c, { clientId: w.ids.clients.A, credits: 5, reason: 'x', idempotencyKey: w.key() }))).rejects.toMatchObject({ status: 403 });
    const i = await w.intro('R1', 'C01');
    await expect(w.T(w.cand('C02'), (c) => acceptIntroduction(c, i.id, w.key()))).rejects.toMatchObject({ status: 404 });
    await expect(w.T(w.consultant(), (c) => acceptIntroduction(c, i.id, w.key()))).rejects.toMatchObject({ status: 403 });
  });
  it('interview prep is shared, safe and unavailable to other clients', async () => {
    const w = await load('S17');
    const i = await w.intro('R1', 'C01');
    const p = await prepFor(readCtx(w.client('A')), i.id);
    expect(p.questions).toHaveLength(3);
    expect(JSON.stringify(p)).not.toContain('Mallow');
    await expect(prepFor(readCtx(w.client('B')), i.id)).rejects.toMatchObject({ status: 404 });
  });
});
