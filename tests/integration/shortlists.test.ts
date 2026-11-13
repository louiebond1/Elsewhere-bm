import {it,expect} from 'vitest';
import {and,eq} from 'drizzle-orm';
import {load} from './helpers';
import {db} from '../../src/server/db/client';
import * as S from '../../src/server/db/schema';
import {recomputeRole} from '../../src/server/services/matching';
import {saveOwnAnswer} from '../../src/server/services/onboarding';
import {startShortlistCycle,processShortlists,latestPublication,disclosedPublication,contenderQueue} from '../../src/server/services/shortlists';
import {bestPeople,candidateOnRole} from '../../src/server/views/client';
import {readCtx} from '../../src/server/services/context';
import {requestScreening,respondToScreening,completeScreening,returnScreening} from '../../src/server/services/screenings';
import {roleCounters,criteriaFor} from '../../src/server/services/roles';
async function setup(){const w=await load();await db().update(S.roles).set({shortlistEnabled:true,rubricApprovedVersion:1}).where(eq(S.roles.id,w.ids.roles.R1));await w.T(w.consultant(),c=>recomputeRole(c,w.ids.roles.R1));const cycle=await w.T(w.consultant(),c=>startShortlistCycle(c,w.ids.roles.R1));const members=await db().select().from(S.shortlistMembers).where(eq(S.shortlistMembers.cycleId,cycle!.id));const keep=new Set([w.ids.candidates.C01,w.ids.candidates.C02]);for(const m of members)if(!keep.has(m.candidateId))await db().delete(S.shortlistMembers).where(eq(S.shortlistMembers.id,m.id));return {w,cycle:cycle!};}
it('holds all employer paths, snapshots evidence before the cutoff and publishes coherent immutable versions',async()=>{
 const {w,cycle}=await setup();
 expect((await bestPeople(readCtx(w.client('A')),w.ids.roles.R1)).best).toHaveLength(0);
 const {requestIntroduction}=await import('../../src/server/services/intros');
 await expect(w.T(w.client('A'),c=>requestIntroduction(c,{roleId:w.ids.roles.R1,candidateRef:w.ref('R1','C01'),message:'',idempotencyKey:w.key()}))).rejects.toMatchObject({status:404});
 await expect(w.T(w.consultant(),c=>requestIntroduction(c,{roleId:w.ids.roles.R1,candidateRef:w.ref('R1','C01'),message:'',idempotencyKey:w.key()}))).rejects.toMatchObject({status:404});
 await expect(w.T(w.client('A'),c=>requestScreening(c,{roleId:w.ids.roles.R1,candidateRef:w.ref('R1','C01')}))).rejects.toMatchObject({status:404});
 await expect(candidateOnRole(readCtx(w.client('A')),w.ids.roles.R1,w.ref('R1','C01'))).rejects.toMatchObject({status:404});
 const before=await db().select().from(S.shortlistRevisions);
 const cutoff=new Date(Date.now()+20);await new Promise(r=>setTimeout(r,30));
 await w.T(w.cand('C01'),c=>saveOwnAnswer(c,'ex_problem','I investigated an unexpected ledger balance and personally traced it to a duplicate journal.'));
 const after=await db().select().from(S.shortlistRevisions).where(eq(S.shortlistRevisions.candidateId,w.ids.candidates.C01));
 expect(after.length).toBeGreaterThan(before.filter(r=>r.candidateId===w.ids.candidates.C01).length);
 const original=before.find(r=>r.candidateId===w.ids.candidates.C01)!;expect(JSON.stringify(original.payload)).not.toContain('unexpected ledger balance');
 await db().update(S.shortlistCycles).set({cutoffAt:cutoff,publishAt:new Date(Date.now()-1000),forcePublishAt:new Date(Date.now()+60000)}).where(eq(S.shortlistCycles.id,cycle.id));
 for(let i=0;i<4;i++)await processShortlists(w.consultant(),w.ids.roles.R1);
 const p=await latestPublication(readCtx(w.client('A')),w.ids.roles.R1);expect(p?.kind).toBe('initial');
 const v1=JSON.stringify(p!.payload);expect(v1).not.toContain('unexpected ledger balance');
 expect((await bestPeople(readCtx(w.client('A')),w.ids.roles.R1)).best.length).toBeGreaterThan(0);
 await db().update(S.shortlistCycles).set({nextUpdateAt:new Date(Date.now()-1000)}).where(eq(S.shortlistCycles.id,cycle.id));
 await processShortlists(w.consultant(),w.ids.roles.R1);
 const p2=await latestPublication(readCtx(w.client('A')),w.ids.roles.R1);expect(p2!.version).toBeGreaterThan(p!.version);
 expect(JSON.stringify((await latestPublication(readCtx(w.client('A')),w.ids.roles.R1,p!.version))!.payload)).toBe(v1);
 const historical=await disclosedPublication(readCtx(w.client('A')),w.ids.roles.R1,p!.version);expect(JSON.stringify(historical!.payload.entries.map(e=>e.dto.safeEvidence))).not.toContain('unexpected ledger balance');
 expect(JSON.stringify(p2!.payload)).toContain('unexpected ledger balance');
 await db().update(S.roles).set({roleVersion:2}).where(eq(S.roles.id,w.ids.roles.R1));expect((await bestPeople(readCtx(w.client('A')),w.ids.roles.R1)).best).toHaveLength(0);expect(await disclosedPublication(readCtx(w.client('A')),w.ids.roles.R1,p!.version)).toBeTruthy();
});
it('preserves a strong possible contender when the capped upside would otherwise veto review',async()=>{
 const {w,cycle}=await setup();const c=await criteriaFor(readCtx(w.consultant()),w.ids.roles.R1);expect(c.length).toBeGreaterThan(0);
 const [revision]=await db().select().from(S.shortlistRevisions).where(eq(S.shortlistRevisions.candidateId,w.ids.candidates.C01));
 const input=(revision.payload as {input:{evidence:{id:string;safeClaim:string}[]}}).input;
 const output={criteria:c.map((x,i)=>({criterionId:x.id,level:i===c.length-1?'unknown':'strong',quote:i===c.length-1?'':input.evidence[0].safeClaim,evidenceIds:i===c.length-1?[]:[input.evidence[0].id],reasonSafe:'Fixture assessment'}))};
 await db().update(S.shortlistRevisions).set({assessment:output,interview:{answers:[],fitScore:0,summary:'Fixture',concerns:[],provider:'fixture'}}).where(eq(S.shortlistRevisions.id,revision.id));
 const q=await contenderQueue(readCtx(w.consultant()),w.ids.roles.R1);expect(q.some(x=>x.candidateId===w.ids.candidates.C01)).toBe(true);
 const m=await db().select().from(S.shortlistMembers).where(eq(S.shortlistMembers.cycleId,cycle.id));expect(m.every(x=>x.windowEndsAt>=cycle.cutoffAt)).toBe(true);
});
it('requires per-job candidate consent, charges on acceptance, returns on fail and protects a valid pass',async()=>{
 const w=await load();const id=w.ids.roles.R1;const before=await roleCounters(readCtx(w.client('A')),id);
 const invitation=await w.T(w.client('A'),c=>requestScreening(c,{roleId:id,candidateRef:w.ref('R1','C01')}));
 expect(invitation.status).toBe('invited');expect((await roleCounters(readCtx(w.client('A')),id)).screeningsUsed).toBe(before.screeningsUsed);
 await expect(w.T(w.cand('C02'),c=>respondToScreening(c,invitation.id,true))).rejects.toMatchObject({status:404});
 await w.T(w.cand('C01'),c=>respondToScreening(c,invitation.id,true));
 expect((await roleCounters(readCtx(w.client('A')),id)).screeningsUsed).toBe(before.screeningsUsed+1);
 const criteria=await criteriaFor(readCtx(w.consultant()),id);const raw={outcome:'pass' as const,minutes:15,notesPrivate:'',summarySafe:'Reviewed the agreed requirements during a screening.',assessments:criteria.map(x=>({criterionId:x.id,level:'clear' as const,evidenceIds:[],observationPrivate:'Confirmed during the call'}))};
 await w.T(w.consultant(),c=>completeScreening(c,invitation.id,raw));
 await expect(w.T(w.consultant(),c=>returnScreening(c,invitation.id,'Client preference'))).rejects.toMatchObject({code:'REVIEW_REQUIRED'});
 const failed=await w.T(w.client('A'),c=>requestScreening(c,{roleId:id,candidateRef:w.ref('R1','C02')}));await w.T(w.cand('C02'),c=>respondToScreening(c,failed.id,true));await w.T(w.consultant(),c=>completeScreening(c,failed.id,{...raw,outcome:'fail'}));
 expect((await roleCounters(readCtx(w.client('A')),id)).screeningsUsed).toBe(before.screeningsUsed+1);
 const consent=await db().select().from(S.consentEvents).where(and(eq(S.consentEvents.candidateId,w.ids.candidates.C01),eq(S.consentEvents.kind,'screening_job')));expect(consent).toHaveLength(1);
});
it('serialises simultaneous acceptances of the last coupon and records consent only for the winner',async()=>{
 const w=await load();const roleId=w.ids.roles.R1;
 await db().insert(S.screenings).values(['C03','C04','C05','C06'].map(code=>({datasetId:w.ids.datasetId,roleId,candidateId:w.ids.candidates[code],requestedByUserId:w.ids.users.alex,status:'completed' as const,outcome:'pass'})));
 const offers=await db().insert(S.screenings).values(['C01','C02'].map(code=>({datasetId:w.ids.datasetId,roleId,candidateId:w.ids.candidates[code],requestedByUserId:w.ids.users.alex,status:'invited' as const,invitedAt:new Date(),inviteExpiresAt:new Date(Date.now()+3600000)}))).returning();
 const result=await Promise.allSettled(offers.map(o=>w.T(w.cand(o.candidateId===w.ids.candidates.C01?'C01':'C02'),c=>respondToScreening(c,o.id,true))));
 expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await roleCounters(readCtx(w.client('A')),roleId)).screeningsUsed).toBe(5);
 const consent=await db().select().from(S.consentEvents).where(eq(S.consentEvents.kind,'screening_job'));expect(consent.filter(c=>c.granted)).toHaveLength(1);
});
it('publishes an empty cohort on time instead of holding the employer indefinitely',async()=>{
 const {w,cycle}=await setup();await db().delete(S.shortlistMembers).where(eq(S.shortlistMembers.cycleId,cycle.id));await db().update(S.shortlistCycles).set({cutoffAt:new Date(Date.now()-10000),publishAt:new Date(Date.now()-5000)}).where(eq(S.shortlistCycles.id,cycle.id));await processShortlists(w.consultant(),w.ids.roles.R1);const p=await latestPublication(readCtx(w.client('A')),w.ids.roles.R1);expect(p?.kind).toBe('initial');expect((p!.payload as {entries:unknown[]}).entries).toHaveLength(0);
});
it('a quote-backed human correction creates a new version without altering the original evidence',async()=>{
 const {w,cycle}=await setup();await db().update(S.shortlistCycles).set({cutoffAt:new Date(Date.now()+60000),publishAt:new Date(Date.now()-1000),forcePublishAt:new Date(Date.now()+100000)}).where(eq(S.shortlistCycles.id,cycle.id));for(let i=0;i<3;i++)await processShortlists(w.consultant(),w.ids.roles.R1);const before=await latestPublication(readCtx(w.consultant()),w.ids.roles.R1);expect(before).toBeTruthy();const {correctCriterion}=await import('../../src/server/services/shortlists');const revisions=await db().select().from(S.shortlistRevisions).where(eq(S.shortlistRevisions.candidateId,w.ids.candidates.C01));const p=revisions[0].payload as {criteria:{criterionKey:string}[];input:{evidence:{safeClaim:string}[]}};
 await expect(w.T(w.client('A'),c=>correctCriterion(c,w.ids.roles.R1,w.ref('R1','C01'),p.criteria[0].criterionKey,'strong',p.input.evidence[0].safeClaim,'Review of the supplied facts'))).rejects.toMatchObject({status:403});
 await w.T(w.consultant(),c=>correctCriterion(c,w.ids.roles.R1,w.ref('R1','C01'),p.criteria[0].criterionKey,'strong',p.input.evidence[0].safeClaim,'The supplied quote directly demonstrates this approved anchor.'));
 const after=await latestPublication(readCtx(w.client('A')),w.ids.roles.R1);expect(after!.kind).toBe('correction');expect(after!.version).toBeGreaterThan(before!.version);expect((await latestPublication(readCtx(w.consultant()),w.ids.roles.R1,before!.version))!.payload).toEqual(before!.payload);
});
it('an assessment failure stays unranked and recovery issues a correction instead of a weak score',async()=>{
 const {w,cycle}=await setup();await db().delete(S.shortlistMembers).where(and(eq(S.shortlistMembers.cycleId,cycle.id),eq(S.shortlistMembers.candidateId,w.ids.candidates.C02)));
 const {setProviderForTests,AiFailure}=await import('../../src/server/ai');const {fixtureProvider}=await import('../../src/server/ai/providers/fixture');
 await db().update(S.shortlistCycles).set({cutoffAt:new Date(Date.now()+5000),publishAt:new Date(Date.now()-10000),forcePublishAt:new Date(Date.now()-1000)}).where(eq(S.shortlistCycles.id,cycle.id));
 try{setProviderForTests({...fixtureProvider,assessCriteria:async()=>{throw new AiFailure('timeout','Synthetic timeout',true);}});await processShortlists(w.consultant(),w.ids.roles.R1);const first=await latestPublication(readCtx(w.client('A')),w.ids.roles.R1);expect((first!.payload as {entries:unknown[];pending:number}).entries).toHaveLength(0);expect((first!.payload as {pending:number}).pending).toBe(1);
 setProviderForTests(fixtureProvider);await processShortlists(w.consultant(),w.ids.roles.R1);expect((await latestPublication(readCtx(w.client('A')),w.ids.roles.R1))!.kind).toBe('initial');
 setProviderForTests(null);await processShortlists(w.consultant(),w.ids.roles.R1);const recovered=await latestPublication(readCtx(w.client('A')),w.ids.roles.R1);const recoveredRows=await db().select().from(S.shortlistRevisions).where(eq(S.shortlistRevisions.candidateId,w.ids.candidates.C01));expect(recoveredRows.map(r=>({failure:r.failure,assessment:!!r.assessment,interview:!!r.interview}))).toEqual([{failure:null,assessment:true,interview:true}]);expect(recovered!.kind).toBe('correction');expect((recovered!.payload as {entries:unknown[]}).entries).toHaveLength(1);
 }finally{setProviderForTests(null);}
});
