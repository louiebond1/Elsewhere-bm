import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { load } from './helpers';
import { db } from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import { createDraftRole, approveRubric, activateRole, criteriaFor } from '../../src/server/services/roles';
import { assessmentInput, applyAssessment } from '../../src/server/services/matching';
import { bestPeople } from '../../src/server/views/client';

describe('approved evidence ranking', () => {
  it('blocks activation until the displayed checklist is approved', async () => {
    const w = await load();
    const role = await w.T(w.client('A'), c => createDraftRole(c, {
      vacancyKey: 'evidence-check', title: 'Delivery driver', roleFamily: 'operations', salaryPounds: 30000,
      locationRegion: 'london', workMode: 'hybrid', outcomes: ['Deliver reliably'],
      criteria: ['Driving', 'Routes', 'Customers'].map((label, i) => ({ key: `driver_${i}`, label, description: `Specific evidence of ${label.toLowerCase()}`, importance: 'essential' as const, weight: i === 0 ? 5 : 3, evidenceTags: ['driving' as const] })),
    }));
    await expect(w.T(w.client('A'), c => activateRole(c, role.id, { confirmExtraDeposit: true, idempotencyKey: w.key() }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(w.T(w.client('A'), c => approveRubric(c, role.id, role.rowVersion + 1))).rejects.toMatchObject({ code: 'STALE_VERSION' });
    await w.T(w.client('A'), c => approveRubric(c, role.id, role.rowVersion));
    const [stored] = await db().select().from(S.roles).where(eq(S.roles.id, role.id));
    expect(stored.rubricApprovedVersion).toBe(stored.roleVersion);
  });
  it('ranks only current criterion assessments and rejects stale profile evidence', async () => {
    const w = await load();
    const roleId = w.ids.roles.R1;
    const candidateId = w.ids.candidates.C01;
    expect((await w.T(w.client('A'), c => bestPeople(c, roleId))).best).toHaveLength(0);
    const prepared = await w.T(w.consultant(), c => assessmentInput(c, roleId, candidateId));
    expect(prepared).not.toBeNull();
    const output = { criteria: prepared!.input.criteria.map(c => ({ criterionId: c.criterionId, level: 'clear' as const, evidenceIds: [prepared!.input.evidence[0].id], quote: prepared!.input.evidence[0].safeClaim, reasonSafe: 'Specific evidence supplied.' })) };
    const args = { roleId, candidateId, profileVersionId: prepared!.profileVersionId, roleVersion: prepared!.roleVersion, evidenceFingerprint: prepared!.evidenceFingerprint, output };
    expect(await w.T(w.consultant(), c => applyAssessment(c, { ...args, evidenceFingerprint: 'stale' }))).toMatchObject({ applied: false, reason: 'stale_discarded' });
    expect(await w.T(w.consultant(), c => applyAssessment(c, args))).toMatchObject({ applied: true });
    const ranked = await w.T(w.client('A'), c => bestPeople(c, roleId));
    expect(ranked.best).toHaveLength(1);
    expect(ranked.best[0].dto.evidenceScore).toBe(75);
    expect(ranked.best[0].dto.profileCoverage).toBe(100);
    const crit = await w.T(w.consultant(), c => criteriaFor(c, roleId));
    expect(crit.length).toBeGreaterThan(0);
    await db().update(S.matches).set({ assessmentVersion: null }).where(and(eq(S.matches.roleId, roleId), eq(S.matches.candidateId, candidateId)));
    expect((await w.T(w.client('A'), c => bestPeople(c, roleId))).best).toHaveLength(0);
  });
});
