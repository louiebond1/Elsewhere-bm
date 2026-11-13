import 'server-only';
import {and,eq,desc,asc,lte,inArray,isNull as sqlIsNull} from 'drizzle-orm';
import {createHash} from 'node:crypto';
import * as S from '../db/schema';
import {type Ctx,type BaseCtx,withTx,readCtx,advisoryLock,requireUser} from './context';
import {criteriaFor,roleForActor} from './roles';
import {assessmentInput} from './matching';
import {anonymousDTO,type AcceptedCandidateDTO} from '../dto/candidate';
import {roleScopedRef,roleScopedEvidenceRef} from '../dto/refs';
import {clientMaySeeCandidateOnRole,activeGrant} from '../policies/privacy';
import {notify,logActivity,clientUserIds} from './audit';
import {enqueue} from './jobs';
import {assessWithEvidence} from '../ai/assess';
import {aiMode,AiFailure} from '../ai';
import {PROMPT_VERSION} from '../ai/prompts';
import {validateAssessment} from '../ai/validate';
import {type AssessmentOutput} from '../ai/schemas';
import {type AssessInput} from '../ai/providers/types';
import {type Level} from '../lib/matching-rules';
import {shortlistMetrics,compareShortlist,contenderPriority,SHORTLIST_VERSION,type Metrics} from '../lib/shortlist-rules';
import {notFound,invalid,conflict} from '../lib/errors';
import {interviewQuestions,runInterview,storeSimulation} from './simulation';
const hour=3600000;
const notice=(ctx:Ctx,ids:string[],n:Parameters<typeof notify>[2])=>notify(ctx,ids,n,{inAppOnly:true});
type Criterion=typeof S.roleCriteria.$inferSelect;
type Capture={input:AssessInput;criteria:Criterion[];profileVersionId:string;role:{title:string;outcomes:string[]};dto:AcceptedCandidateDTO;human:{criterionId:string;level:Level;quote?:string}[]};
export type PublishedEntry={candidateId:string;reference:string;dto:AcceptedCandidateDTO;assessmentMeta?:unknown;sim:NonNullable<Awaited<ReturnType<typeof runInterview>>['result']>|null;metrics:Metrics;revisionId:string|null};
type Publication={entries:PublishedEntry[];previous:PublishedEntry[];pending:number;contenders:number;close:number};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function currentCycle(ctx:Ctx,roleId:string){const [c]=await ctx.tx.select().from(S.shortlistCycles).where(eq(S.shortlistCycles.roleId,roleId)).orderBy(desc(S.shortlistCycles.roleVersion)).limit(1);return c??null;}
export async function startShortlistCycle(ctx:Ctx,roleId:string){
 const role=await roleForCycle(ctx,roleId);if(!role||role.status!=='open'||role.rubricApprovedVersion!==role.roleVersion)return null;
 const now=new Date(),criteria=await criteriaFor(ctx,roleId);
 const [cycle]=await ctx.tx.insert(S.shortlistCycles).values({datasetId:ctx.datasetId,roleId,roleVersion:role.roleVersion,startedAt:now,cutoffAt:new Date(+now+24*hour),publishAt:new Date(+now+25*hour),forcePublishAt:new Date(+now+27*hour),nextUpdateAt:new Date(+now+72*hour),criteria,roleSnapshot:{title:role.title,outcomes:role.outcomes}}).onConflictDoNothing().returning();
 return cycle??currentCycle(ctx,roleId);
}
async function roleForCycle(ctx:Ctx,id:string){const [r]=await ctx.tx.select().from(S.roles).where(and(eq(S.roles.id,id),eq(S.roles.datasetId,ctx.datasetId)));return r;}
/** Called in the evidence-write transaction. Only immutable inputs are added, never rewritten. */
export async function captureShortlistEvidence(ctx:Ctx,roleId:string,candidateId:string,submittedAt=new Date()){
 const role=await roleForCycle(ctx,roleId);if(!role?.shortlistEnabled||role.status!=='open'||role.rubricApprovedVersion!==role.roleVersion)return;
 const cycle=await startShortlistCycle(ctx,roleId);if(!cycle)return;
 const [match]=await ctx.tx.select().from(S.matches).where(and(eq(S.matches.roleId,roleId),eq(S.matches.candidateId,candidateId)));
 if(!match||match.eligibility==='incompatible')return;
 const prepared=await assessmentInput(ctx,roleId,candidateId);if(!prepared?.profileVersionId)return;
 submittedAt=ctx.evidenceSubmittedAt??submittedAt;
 const now=new Date();let [member]=await ctx.tx.select().from(S.shortlistMembers).where(and(eq(S.shortlistMembers.cycleId,cycle.id),eq(S.shortlistMembers.candidateId,candidateId))).for('update');
 if(!member){
  const [candidate]=await ctx.tx.select().from(S.candidates).where(eq(S.candidates.id,candidateId));
  if(!candidate?.userId)return;
  const windowEndsAt=new Date(Math.max(+cycle.cutoffAt,+now+24*hour));
  [member]=await ctx.tx.insert(S.shortlistMembers).values({datasetId:ctx.datasetId,cycleId:cycle.id,candidateId,notifiedAt:now,windowEndsAt}).onConflictDoNothing().returning();
  if(!member){[member]=await ctx.tx.select().from(S.shortlistMembers).where(and(eq(S.shortlistMembers.cycleId,cycle.id),eq(S.shortlistMembers.candidateId,candidateId)));}
  else await notice(ctx,[candidate.userId],{type:'system',subjectRefType:'interview',subjectRefId:roleId,safeTitle:`Your mini-me is being assessed for ${role.title}. Add any missing examples by ${windowEndsAt.toISOString()}. Later answers can still help.`});
 }
 if(!member)return;
 const humanRows=await ctx.tx.select().from(S.screenings).where(and(eq(S.screenings.roleId,roleId),eq(S.screenings.candidateId,candidateId),inArray(S.screenings.status,['completed','returned'])));
 const usableHumanRows=humanRows.filter(r=>r.status==='completed'||r.outcome==='fail');
 const human=(usableHumanRows.flatMap(r=>r.criterionAssessments as {criterionId:string;level:Level}[])).filter(r=>r.level!=='unknown');
 const criteria=cycle.criteria as Criterion[];
 const dto={...await anonymousDTO(ctx,{roleId,candidateId,match}),identity:null} as AcceptedCandidateDTO;
 const payload:Capture={...prepared,profileVersionId:prepared.profileVersionId,criteria,role:cycle.roleSnapshot as Capture['role'],dto,human};
 const fingerprint=digest({input:prepared.input,human,profileVersionId:prepared.profileVersionId});
 const sequence=member.rowVersion+1;await ctx.tx.update(S.shortlistMembers).set({rowVersion:sequence}).where(eq(S.shortlistMembers.id,member.id));
 await ctx.tx.insert(S.shortlistRevisions).values({datasetId:ctx.datasetId,memberId:member.id,candidateId,fingerprint,submittedAt,payload,rowVersion:sequence}).onConflictDoNothing();
 await enqueue(ctx,'shortlist_tick',roleId,`shortlist:${roleId}:${ctx.operationId}`);
}
function scoredEntry(ctx:Ctx,roleId:string,revision:typeof S.shortlistRevisions.$inferSelect):PublishedEntry|null{
 if(!revision.assessment||!revision.interview)return null;
 const p=revision.payload as Capture,a=revision.assessment as AssessmentOutput;
 const levels=new Map(a.criteria.map(c=>[c.criterionId,c.level as Level]));for(const h of p.human)levels.set(h.criterionId,h.level);
 const metrics=shortlistMetrics(p.criteria.map(c=>({criterionId:c.id,label:c.label,weight:c.weight,importance:c.importance})),levels);
 const dto={...p.dto,identity:null,evidenceScore:Math.round(metrics.demonstrated*100)/100,profileCoverage:Math.round(metrics.coverage),confidence:metrics.coverage<50?'low':null,unknowns:metrics.unknown,criteria:p.criteria.map(c=>{const r=a.criteria.find(x=>x.criterionId===c.id)!;const human=p.human.find(h=>h.criterionId===c.id);return {key:c.criterionKey,label:c.label,essential:c.importance==='essential',level:r.level,humanLevel:human?.level??null,evidenceIds:r.evidenceIds.map(id=>roleScopedEvidenceRef(roleId,id)),quote:human?human.quote??'':r.quote,reasonSafe:human?'Checked during the BondMoran screening.':r.reasonSafe,followUp:human?null:r.followUp};})};
 return {candidateId:revision.candidateId,reference:roleScopedRef(roleId,revision.candidateId),dto,metrics,revisionId:revision.id,assessmentMeta:(revision.assessment as {metadata?:unknown}).metadata,sim:revision.interview as PublishedEntry['sim']};
}
export async function latestPublication(ctx:Ctx,roleId:string,version?:number){
 const [p]=await ctx.tx.select().from(S.shortlists).where(and(eq(S.shortlists.roleId,roleId),eq(S.shortlists.datasetId,ctx.datasetId),...(version?[eq(S.shortlists.version,version)]:[]))).orderBy(desc(S.shortlists.version)).limit(1);return p??null;
}
async function selectRevisions(ctx:Ctx,cycle:typeof S.shortlistCycles.$inferSelect,cutoff:Date){
 const members=await ctx.tx.select().from(S.shortlistMembers).where(eq(S.shortlistMembers.cycleId,cycle.id));
 const rows=members.length?await ctx.tx.selectDistinctOn([S.shortlistRevisions.candidateId]).from(S.shortlistRevisions).where(and(inArray(S.shortlistRevisions.memberId,members.map(m=>m.id)),lte(S.shortlistRevisions.submittedAt,cutoff))).orderBy(asc(S.shortlistRevisions.candidateId),desc(S.shortlistRevisions.submittedAt),desc(S.shortlistRevisions.rowVersion),desc(S.shortlistRevisions.createdAt)):[];
 const seen=new Set<string>();return rows.filter(r=>{if(seen.has(r.candidateId))return false;seen.add(r.candidateId);return true;});
}
async function buildPublication(ctx:Ctx,cycle:typeof S.shortlistCycles.$inferSelect,cutoff:Date,kind:string,reason:string){
 await advisoryLock(ctx.tx,`shortlist-publish:${cycle.roleId}`);
 const role=await roleForCycle(ctx,cycle.roleId);if(!role||role.roleVersion!==cycle.roleVersion)return null;
 const prior=await latestPublication(ctx,cycle.roleId);
 const priorPayload=prior?.payload as Publication|undefined;
 const revisions=await selectRevisions(ctx,cycle,cutoff);const scored:PublishedEntry[]=[];let pending=0;
 for(const r of revisions){if(!(await clientMaySeeCandidateOnRole(ctx,{candidateId:r.candidateId,clientId:role.clientId,roleId:role.id,hasIntro:false})))continue;const e=scoredEntry(ctx,role.id,r);if(e)scored.push(e);else {pending++;const previous=kind!=='initial'?priorPayload?.entries.find(e=>e.candidateId===r.candidateId):null;if(previous)scored.push(previous);}}
 scored.sort((a,b)=>compareShortlist({...a.metrics,reference:a.reference},{...b.metrics,reference:b.reference}));
 let entries=scored.slice(0,10);const old=prior?.payload as Publication|undefined;
 // Close outsiders wait for stronger evidence; incumbents are not displaced on a fractional difference.
 if(kind==='update'&&old?.entries.length===10){const incumbents=new Set(old.entries.map(e=>e.candidateId));const current=scored.filter(e=>incumbents.has(e.candidateId));const boundary=current[9]?.metrics;const eligible=scored.filter(e=>incumbents.has(e.candidateId)||!boundary||(!e.metrics.essentialNotMet&&boundary.essentialNotMet)||(e.metrics.essentialNotMet===boundary.essentialNotMet&&e.metrics.working>boundary.working+2.5));entries=eligible.slice(0,10);}
 const listed=new Set(entries.map(e=>e.candidateId));const contenders=scored.filter(e=>contenderPriority(e.metrics,entries[9]?.metrics,entries[2]?.metrics,listed.has(e.candidateId))!==null).length;
 const previous=[...(old?.entries??[]),...(old?.previous??[])].filter((e,i,all)=>!listed.has(e.candidateId)&&all.findIndex(x=>x.candidateId===e.candidateId)===i);
 const payload:Publication={entries,previous,pending,contenders,close:scored.filter(e=>!listed.has(e.candidateId)&&entries[9]&&e.metrics.essentialNotMet===entries[9].metrics.essentialNotMet&&Math.abs(e.metrics.working-entries[9].metrics.working)<=2.5).length};
 // Includes score, ordering, evidence and interview changes, not just membership or flags.
 if(prior&&kind!=='initial'&&digest(prior.payload)===digest(payload))return prior;
 const [publication]=await ctx.tx.insert(S.shortlists).values({datasetId:ctx.datasetId,roleId:role.id,cycleId:cycle.id,version:(prior?.version??0)+1,kind,publishedAt:new Date(),cutoffAt:cutoff,reason,scoringVersion:SHORTLIST_VERSION,promptVersion:PROMPT_VERSION,payload}).returning();
 await logActivity(ctx,{subjectType:'role',subjectId:role.id,action:`shortlist.${kind==='initial'?'published':kind==='correction'?'corrected':'updated'}`,metadata:{version:publication.version,reason}});
 await notice(ctx,await clientUserIds(ctx,role.clientId),{type:'system',subjectRefType:'role',subjectRefId:role.id,safeTitle:`${kind==='initial'?'Your top 10 is ready':kind==='correction'?'Shortlist correction':'Your shortlist has an update'}: ${role.title}`});
 return publication;
}
/** A bounded worker pass: one immutable revision, then delivery/update decisions. Every AI call uses runAi's budget. */
export async function processShortlists(base:BaseCtx,onlyRole?:string){
 const ctx=readCtx(base);const cycles=await ctx.tx.select().from(S.shortlistCycles).innerJoin(S.roles,eq(S.roles.id,S.shortlistCycles.roleId)).where(and(eq(S.shortlistCycles.datasetId,base.datasetId),eq(S.roles.status,'open'),...(onlyRole?[eq(S.roles.id,onlyRole)]:[])));
 for(const {shortlist_cycles:cycle,roles:role} of cycles){
  if(role.roleVersion!==cycle.roleVersion||role.rubricApprovedVersion!==cycle.roleVersion)continue;
  const members=await ctx.tx.select().from(S.shortlistMembers).where(eq(S.shortlistMembers.cycleId,cycle.id));
  for(const member of members)if(!member.remindedAt&&Date.now()-member.notifiedAt.getTime()>=12*hour&&Date.now()<member.windowEndsAt.getTime())await withTx(base,async c=>{const marked=await c.tx.update(S.shortlistMembers).set({remindedAt:new Date()}).where(and(eq(S.shortlistMembers.id,member.id),sqlIsNull(S.shortlistMembers.remindedAt))).returning({id:S.shortlistMembers.id});if(!marked.length)return;const [candidate]=await c.tx.select().from(S.candidates).where(eq(S.candidates.id,member.candidateId));if(candidate?.userId)await notice(c,[candidate.userId],{type:'system',subjectRefType:'interview',subjectRefId:role.id,safeTitle:`There is still time to add missing examples for ${role.title}. Later evidence can still be considered.`});});
  const windowRevisions=await selectRevisions(ctx,cycle,new Date(Math.min(Date.now(),cycle.cutoffAt.getTime()))),currentRevisions=await selectRevisions(ctx,cycle,new Date());
  const revisions=[...windowRevisions,...currentRevisions].filter((r,i,all)=>all.findIndex(x=>x.id===r.id)===i);
  const pending=revisions.find(r=>(!r.assessment||!r.interview)&&(r.failure!=='processing'||Date.now()-r.updatedAt.getTime()>5*60000)&&(r.attempts<3||Date.now()-r.updatedAt.getTime()>15*60000));
  if(pending){
   const claimed=await ctx.tx.update(S.shortlistRevisions).set({attempts:pending.attempts+1,updatedAt:new Date(),failure:'processing'}).where(and(eq(S.shortlistRevisions.id,pending.id),eq(S.shortlistRevisions.attempts,pending.attempts))).returning({id:S.shortlistRevisions.id});
   if(!claimed.length)continue;
   try{
    const p=pending.payload as Capture;let output=pending.assessment as AssessmentOutput|null;
    if(!output){if(!p.input.evidence.length)output={criteria:p.input.criteria.map(c=>({criterionId:c.criterionId,level:'unknown',evidenceIds:[],quote:'',reasonSafe:'No information shared.',followUp:`Tell me about ${c.label.toLowerCase()}.`}))};else{const result=await assessWithEvidence(p.input,{datasetId:base.datasetId,roleId:role.id,candidateId:pending.candidateId});if(aiMode()==='live'&&result.provider!=='anthropic')throw new AiFailure('assessment_pending','Real assessment pending.',true);output=Object.assign(result.output,{metadata:{model:result.usage.modelId}});}
     const {assessmentPrivacySafe}=await import('./matching');if(!(await assessmentPrivacySafe(ctx,pending.candidateId,output)))throw new Error('identifying_assessment');
     const valid=validateAssessment(output,p.input.criteria.map(c=>c.criterionId),p.input.evidence.map(e=>e.id),p.input.evidence);if(!valid.ok)throw new Error('invalid_frozen_assessment');
     await ctx.tx.update(S.shortlistRevisions).set({assessment:{...output,metadata:{model:(output as {metadata?:{model?:string}}).metadata?.model??'no_evidence',promptVersion:PROMPT_VERSION,scoringVersion:SHORTLIST_VERSION,profileVersionId:p.profileVersionId,inputFingerprint:pending.fingerprint}},provider:p.input.evidence.length?aiMode()==='live'?'anthropic':'fixture':'no_evidence'}).where(eq(S.shortlistRevisions.id,pending.id));
    }
    if(output){await withTx(base,async c=>{const [m]=await c.tx.select().from(S.shortlistMembers).where(eq(S.shortlistMembers.id,pending.memberId)).for('update');if(!m||m.notificationId)return;const gaps=output!.criteria.filter(x=>x.level==='unknown').map(x=>p.criteria.find(k=>k.id===x.criterionId)?.label??'a requirement');if(gaps.length){const [candidate]=await c.tx.select().from(S.candidates).where(eq(S.candidates.id,pending.candidateId));if(candidate?.userId){const created=await notice(c,[candidate.userId],{type:'system',subjectRefType:'interview',subjectRefId:role.id,safeTitle:`Add examples for ${gaps.slice(0,3).join(', ')}${gaps.length>3?' and other requirements':''}. You can still improve your mini-me.`});if(created?.[0])await c.tx.update(S.shortlistMembers).set({notificationId:created[0].id}).where(eq(S.shortlistMembers.id,m.id));}}});}
    if(!pending.interview){const questions=interviewQuestions(p.role,p.criteria);const evidence=p.input.evidence.map(e=>({...e,safeClaim:e.safeClaim,strength:e.strength as 'specific'|'partial'|'assertion'}));const r=await runInterview(p.role,questions,evidence,{live:aiMode()==='live',datasetId:base.datasetId,roleId:role.id,candidateId:pending.candidateId});
     const clean=await withTx(base,c=>storeSimulation(c,{roleId:role.id,candidateId:pending.candidateId,roleVersion:cycle.roleVersion,profileVersionId:p.profileVersionId,...r.result,evidenceIds:evidence.map(e=>e.id),snapshotOnly:true}));
     if(!('snapshot' in clean)||!clean.snapshot)throw new Error('snapshot_interview_unavailable');
     await ctx.tx.update(S.shortlistRevisions).set({interview:clean.snapshot}).where(eq(S.shortlistRevisions.id,pending.id));
    }
    await ctx.tx.update(S.shortlistRevisions).set({failure:null}).where(eq(S.shortlistRevisions.id,pending.id));
   }catch(e){await ctx.tx.update(S.shortlistRevisions).set({updatedAt:new Date(),attempts:pending.attempts+1,failure:e instanceof AiFailure?e.code:e instanceof Error&&['identifying_assessment','invalid_frozen_assessment','snapshot_interview_unavailable'].includes(e.message)?e.message:'assessment_failed'}).where(eq(S.shortlistRevisions.id,pending.id));}
  }
  await withTx(base,async c=>{
   const now=new Date();const latest=await latestPublication(c,role.id);const initial=latest?.cycleId===cycle.id?latest:null;
   if(!initial&&now>=cycle.publishAt){const eligible=await selectRevisions(c,cycle,cycle.cutoffAt);if(now>=cycle.forcePublishAt||eligible.every(r=>r.assessment&&r.interview))await buildPublication(c,cycle,cycle.cutoffAt,'initial','Initial evidence window closed.');}
   else if(initial){const lateRecovery=pending&&pending.submittedAt<=initial.cutoffAt&&(initial.payload as Publication).pending>0;if(lateRecovery&&(await selectRevisions(c,cycle,initial.cutoffAt)).find(r=>r.id===pending?.id)?.interview)await buildPublication(c,cycle,initial.cutoffAt,'correction','An assessment delayed by a technical failure is now available.');
    if(now>=cycle.nextUpdateAt){await buildPublication(c,cycle,now,'update','Scheduled review of new evidence and screenings.');await c.tx.update(S.shortlistCycles).set({nextUpdateAt:new Date(+now+168*hour)}).where(eq(S.shortlistCycles.id,cycle.id));}
   }
  });
  if(pending)await enqueue(ctx,'shortlist_tick',role.id,`shortlist-next:${pending.id}:${pending.attempts}:${Date.now()}`);
 }
}
export async function shortlistStatus(ctx:Ctx,roleId:string){const role=await roleForActor(ctx,roleId);const c=role.shortlistEnabled?await currentCycle(ctx,roleId):null,p=await latestPublication(ctx,roleId);return {waiting:role.shortlistEnabled&&(!c||c.roleVersion!==role.roleVersion||p?.cycleId!==c.id),awaitingApproval:role.rubricApprovedVersion!==role.roleVersion,due:c?.roleVersion===role.roleVersion?c.publishAt.toISOString():null,version:p?.version??null,reason:p?.reason??null};}
export async function contenderQueue(ctx:Ctx,roleId:string){requireUser(ctx.actor,'consultant');await roleForActor(ctx,roleId);const cycle=await currentCycle(ctx,roleId);if(!cycle)return [];const revisions=await selectRevisions(ctx,cycle,new Date());const publication=await latestPublication(ctx,roleId);const list=(publication?.payload as Publication|undefined)?.entries??[];const members=await ctx.tx.select().from(S.shortlistMembers).where(eq(S.shortlistMembers.cycleId,cycle.id));return revisions.map(r=>{const e=scoredEntry(ctx,roleId,r);if(!e)return null;const priority=contenderPriority(e.metrics,list[9]?.metrics,list[2]?.metrics,list.some(x=>x.candidateId===e.candidateId));const member=members.find(m=>m.id===r.memberId)!;return priority===null?null:{...e,priority,memberId:member.id,reviewState:member.reviewState,reviewedAt:member.reviewedAt};}).filter((x):x is NonNullable<typeof x>=>!!x).sort((a,b)=>a.priority-b.priority||(b.metrics.upside-b.metrics.working)-(a.metrics.upside-a.metrics.working));}
export async function reviewContender(ctx:Ctx,roleId:string,memberId:string,outcome:string,reason:string){requireUser(ctx.actor,'consultant');await roleForActor(ctx,roleId,{lock:true});const cycle=await currentCycle(ctx,roleId);if(!cycle)throw notFound();const queue=await contenderQueue(ctx,roleId);const item=queue.find(x=>x.memberId===memberId);if(!item)throw notFound();if(!['nudge','invite','no_action'].includes(outcome)||!reason.trim())throw invalid('Choose an outcome and record why.');const since=new Date(Date.now()-168*hour);const reviewed=await ctx.tx.select().from(S.shortlistMembers).where(eq(S.shortlistMembers.cycleId,cycle.id));const count=reviewed.filter(x=>x.reviewedAt&&x.reviewedAt>=since).length;if(count>=8&&(!item.reviewedAt||item.reviewedAt<since))throw conflict('REVIEW_CAPACITY','Eight files have been reviewed this cycle. Other candidates retain their follow-up and later-update route.');await ctx.tx.update(S.shortlistMembers).set({reviewState:outcome,reviewReason:reason.trim().slice(0,600),reviewedAt:new Date()}).where(eq(S.shortlistMembers.id,memberId));if(outcome==='invite'){const {requestScreening}=await import('./screenings');await requestScreening(ctx,{roleId,candidateRef:item.reference});}if(outcome==='nudge'){const [candidate]=await ctx.tx.select().from(S.candidates).where(eq(S.candidates.id,item.candidateId));if(candidate?.userId)await notice(ctx,[candidate.userId],{type:'system',subjectRefType:'interview',subjectRefId:roleId,safeTitle:'A few missing examples could strengthen your match. You can still add them to your mini-me.'});}await logActivity(ctx,{subjectType:'role',subjectId:roleId,action:'contender.reviewed',metadata:{memberId,outcome,reason:reason.trim().slice(0,600)}});}
export async function publishCorrection(ctx:Ctx,roleId:string,reason:string){requireUser(ctx.actor,'consultant');await roleForActor(ctx,roleId);if(!reason.trim())throw invalid('Explain the correction.');const cycle=await currentCycle(ctx,roleId);if(!cycle)throw notFound();const current=await latestPublication(ctx,roleId);if(!current||current.cycleId!==cycle.id)throw invalid('The initial shortlist must be published before it can be corrected.');return buildPublication(ctx,cycle,current.cutoffAt,'correction',reason.trim().slice(0,600));}
export async function candidateWindow(ctx:Ctx,roleId:string,candidateId:string){const cycle=await currentCycle(ctx,roleId);if(!cycle)return null;const [m]=await ctx.tx.select().from(S.shortlistMembers).where(and(eq(S.shortlistMembers.cycleId,cycle.id),eq(S.shortlistMembers.candidateId,candidateId)));return m?.windowEndsAt??null;}
/** Snapshot payloads never contain identity. Revoked consent, blocks and identity grants are evaluated again on every read. */
export async function disclosedPublication(ctx:Ctx,roleId:string,version?:number){const role=await roleForActor(ctx,roleId),cycle=role.shortlistEnabled?await currentCycle(ctx,roleId):null,p=await latestPublication(ctx,roleId,version);if(!p||(!version&&role.shortlistEnabled&&(!cycle||cycle.roleVersion!==role.roleVersion||role.rubricApprovedVersion!==role.roleVersion||p.cycleId!==cycle.id)))return null;const payload=p.payload as Publication;const disclose=async(entries:PublishedEntry[])=>{const out:PublishedEntry[]=[];for(const e of entries){const [intro]=await ctx.tx.select().from(S.introductions).where(and(eq(S.introductions.roleId,roleId),eq(S.introductions.candidateId,e.candidateId)));if(!(await clientMaySeeCandidateOnRole(ctx,{candidateId:e.candidateId,clientId:role.clientId,roleId,hasIntro:!!intro&&['pending','accepted'].includes(intro.state)})))continue;const dto={...e.dto,identity:null} as AcceptedCandidateDTO;const grant=await activeGrant(ctx,{candidateId:e.candidateId,clientId:role.clientId,roleId});if(grant){const [id]=await ctx.tx.select().from(S.candidateIdentity).where(eq(S.candidateIdentity.candidateId,e.candidateId));if(id)dto.identity={fullName:id.fullName,email:id.email};}const [match]=await ctx.tx.select().from(S.matches).where(and(eq(S.matches.roleId,roleId),eq(S.matches.candidateId,e.candidateId)));const [screen]=await ctx.tx.select().from(S.screenings).where(and(eq(S.screenings.roleId,roleId),eq(S.screenings.candidateId,e.candidateId)));dto.screeningStatus=screen&&!['declined','expired'].includes(screen.status)?screen.status:null;dto.screeningSummary=screen?.status==='completed'?screen.summarySafe:null;dto.introState=intro?.state??null;dto.permittedActionFlags={canRequestIntro:role.status==='open'&&!intro&&match?.eligibility!=='incompatible',canRequestScreening:role.status==='open'&&match?.eligibility!=='incompatible'&&(!screen||['cancelled','declined','expired'].includes(screen.status))};out.push({...e,dto});}return out;};return {...p,payload:{...payload,entries:await disclose(payload.entries),previous:await disclose(payload.previous)}};}
export async function assertPublishedCandidate(ctx:Ctx,roleId:string,candidateId:string,allowConsultant=false){if(ctx.actor.kind!=='user')return;if(ctx.actor.userType==='consultant'&&allowConsultant)return;const pub=await disclosedPublication(ctx,roleId);if(!pub||![...pub.payload.entries,...pub.payload.previous].some(e=>e.candidateId===candidateId))throw notFound();}
/** Called before deletion/reset. Privacy erasure takes precedence over historical display. */
export async function eraseShortlistEvidence(ctx:Ctx,candidateId:string){await ctx.tx.delete(S.shortlistMembers).where(eq(S.shortlistMembers.candidateId,candidateId));const pubs=await ctx.tx.select().from(S.shortlists).where(eq(S.shortlists.datasetId,ctx.datasetId));for(const p of pubs){const data=p.payload as Publication;await ctx.tx.update(S.shortlists).set({payload:{...data,entries:data.entries.filter(e=>e.candidateId!==candidateId),previous:data.previous.filter(e=>e.candidateId!==candidateId)}}).where(eq(S.shortlists.id,p.id));}}

/** Freeze existing jobs once. This is never a demo reset and never starts a new evidence window. */
export async function ensureLegacyPublication(ctx:Ctx,roleId:string){
 if(ctx.actor.kind==='user')await roleForActor(ctx,roleId);
 const role=await roleForCycle(ctx,roleId);if(!role||role.shortlistEnabled||role.status==='draft')return;
 if(await latestPublication(ctx,roleId))return;
 const freeze=async(c:Ctx)=>{await advisoryLock(c.tx,`shortlist-publish:${roleId}`);if(await latestPublication(c,roleId))return;
 const criteria=await criteriaFor(c,roleId),rows=await c.tx.select().from(S.matches).where(eq(S.matches.roleId,roleId));
 rows.sort((a,b)=>b.score-a.score||b.coverageBps-a.coverageBps||a.candidateId.localeCompare(b.candidateId));const entries:PublishedEntry[]=[];
 for(const m of rows){if(m.eligibility==='incompatible')continue;const [intro]=await c.tx.select().from(S.introductions).where(and(eq(S.introductions.roleId,roleId),eq(S.introductions.candidateId,m.candidateId)));if(!(await clientMaySeeCandidateOnRole(c,{candidateId:m.candidateId,clientId:role.clientId,roleId,hasIntro:!!intro&&['pending','accepted'].includes(intro.state)})))continue;
 const results=m.criterionResults as {criterionId:string;aiLevel:Level;humanLevel?:Level|null}[];
 const metrics=shortlistMetrics(criteria.map(x=>({criterionId:x.id,label:x.label,weight:x.weight,importance:x.importance})),new Map(results.map(r=>[r.criterionId,r.humanLevel??r.aiLevel])));metrics.working=m.score;metrics.demonstrated=m.score;
 const rankable=m.provider==='anthropic'&&!m.stale&&!!m.assessmentVersion&&m.roleVersion===role.roleVersion&&role.rubricApprovedVersion===role.roleVersion;
 const dto={...await anonymousDTO(c,{roleId,candidateId:m.candidateId,match:m}),identity:null,evidenceScore:rankable?m.score:null,profileCoverage:m.coverageBps/100} as AcceptedCandidateDTO;
 const [sim]=await c.tx.select().from(S.simulatedInterviews).where(and(eq(S.simulatedInterviews.roleId,roleId),eq(S.simulatedInterviews.candidateId,m.candidateId)));
 entries.push({candidateId:m.candidateId,reference:roleScopedRef(roleId,m.candidateId),dto,metrics,revisionId:null,assessmentMeta:{legacyRankable:rankable},sim:sim?{answers:sim.answers as NonNullable<PublishedEntry['sim']>['answers'],fitScore:m.score,summary:sim.summarySafe,concerns:sim.concernsSafe,provider:sim.provider}:null});
 }
 const ready=entries.filter(e=>(e.assessmentMeta as {legacyRankable:boolean}).legacyRankable).slice(0,10);const readyIds=new Set(ready.map(e=>e.candidateId));
 await c.tx.insert(S.shortlists).values({datasetId:c.datasetId,roleId,version:1,kind:'legacy',publishedAt:new Date(),cutoffAt:new Date(),reason:'Existing shortlist preserved at rollout.',scoringVersion:'legacy',promptVersion:'legacy',payload:{entries:ready,previous:entries.filter(e=>!readyIds.has(e.candidateId)),pending:0,contenders:0,close:0}});
 };
 if(ctx.transactional)await freeze(ctx);else await withTx(ctx,freeze);
}
export async function publicationEntry(ctx:Ctx,roleId:string,candidateId:string,version?:number){await ensureLegacyPublication(ctx,roleId);let p=await disclosedPublication(ctx,roleId,version);if(!p){const [intro]=await ctx.tx.select().from(S.introductions).where(and(eq(S.introductions.roleId,roleId),eq(S.introductions.candidateId,candidateId),inArray(S.introductions.state,['pending','accepted'])));if(intro){const previous=await latestPublication(ctx,roleId);if(previous)p=await disclosedPublication(ctx,roleId,previous.version);}}return p?[...p.payload.entries,...p.payload.previous].find(e=>e.candidateId===candidateId)??null:null;}
export async function ownCycleInterview(ctx:Ctx,roleId:string,candidateId:string){
 const role=await roleForCycle(ctx,roleId);if(!role?.shortlistEnabled)return null;const cycle=await currentCycle(ctx,roleId);if(!cycle)return null;
 const [member]=await ctx.tx.select().from(S.shortlistMembers).where(and(eq(S.shortlistMembers.cycleId,cycle.id),eq(S.shortlistMembers.candidateId,candidateId)));if(!member)return null;
 const [r]=await ctx.tx.select().from(S.shortlistRevisions).where(eq(S.shortlistRevisions.memberId,member.id)).orderBy(desc(S.shortlistRevisions.submittedAt),desc(S.shortlistRevisions.rowVersion),desc(S.shortlistRevisions.createdAt)).limit(1);if(!r)return null;
 const p=r.payload as Capture;const interview=r.interview as PublishedEntry['sim'];const qs=interviewQuestions(p.role,p.criteria);
 const answers=qs.map((q,i)=>{const a=interview?.answers[i];return {question:q.text,answer:a?.grounded?a.answer:null,key:q.key,kind:q.kind};});
 return {roleId,title:role.title,region:role.locationRegion,mode:role.workMode,at:member.notifiedAt.toISOString(),updatedAt:r.updatedAt.toISOString(),answers,notShared:'Not known yet',deadline:member.windowEndsAt.toISOString(),lateAllowed:true,open:true};
}
export async function ownCycleInterviews(ctx:Ctx,candidateId:string){const members=await ctx.tx.select({roleId:S.shortlistCycles.roleId}).from(S.shortlistMembers).innerJoin(S.shortlistCycles,eq(S.shortlistCycles.id,S.shortlistMembers.cycleId)).where(eq(S.shortlistMembers.candidateId,candidateId));const out=[];for(const roleId of [...new Set(members.map(m=>m.roleId))]){const i=await ownCycleInterview(ctx,roleId,candidateId);if(i)out.push({roleId,title:i.title,region:i.region,mode:i.mode,at:i.at,asked:i.answers.length,gaps:i.answers.filter(a=>!a.answer).length,deadline:i.deadline,lateAllowed:true,open:true});}return out;}
/** Human corrections cite existing frozen evidence. New experience belongs in the candidate/profile or screening route. */
export async function correctCriterion(ctx:Ctx,roleId:string,candidateRef:string,criterionKey:string,level:Level,quote:string,reason:string){
 requireUser(ctx.actor,'consultant');const {resolveRoleRef}=await import('./intros');const candidateId=await resolveRoleRef(ctx,roleId,candidateRef);const {lockCandidates}=await import('./context');await lockCandidates(ctx.tx,[candidateId]);await roleForActor(ctx,roleId,{lock:true});const cycle=await currentCycle(ctx,roleId);if(!cycle)throw invalid('This role has no assessment cycle.');
 const revisions=await selectRevisions(ctx,cycle,new Date());const previous=revisions.find(r=>roleScopedRef(roleId,r.candidateId)===candidateRef);if(!previous?.assessment||!previous.interview)throw conflict('ASSESSMENT_PENDING','Wait for the assessment before correcting it.');
 const p=previous.payload as Capture,c=p.criteria.find(c=>c.criterionKey===criterionKey);if(!c||reason.trim().length<10)throw invalid('Choose a requirement and explain the correction.');
 if(level==='contradictory'||level==='specific')throw invalid('Use the current requirement scale.');
 if(level!=='unknown'&&(!quote.trim()||!p.input.evidence.some(e=>e.safeClaim.includes(quote.trim()))))throw invalid('Use an exact supporting quote from this frozen profile.');
 const [member]=await ctx.tx.select().from(S.shortlistMembers).where(eq(S.shortlistMembers.id,previous.memberId)).for('update');const sequence=(member?.rowVersion??previous.rowVersion)+1;await ctx.tx.update(S.shortlistMembers).set({rowVersion:sequence}).where(eq(S.shortlistMembers.id,previous.memberId));
 const payload:Capture={...p,human:[...p.human.filter(h=>h.criterionId!==c.id),{criterionId:c.id,level,quote:quote.trim()}]};
 const old=previous.interview as NonNullable<PublishedEntry['sim']>,qs=interviewQuestions(p.role,p.criteria);
 const sim={...old,answers:old.answers.map((a,i)=>qs[i]?.crit?.id===c.id?{...a,score:level==='unknown'||level==='none_stated'||level==='not_met'?0:level==='related'?2.5:level==='partial'?5:level==='clear'?7.5:10,reason:'Corrected by BondMoran against the approved requirement.'}:a)};
 await ctx.tx.insert(S.shortlistRevisions).values({datasetId:ctx.datasetId,memberId:previous.memberId,candidateId:previous.candidateId,submittedAt:previous.submittedAt,rowVersion:sequence,fingerprint:digest({previous:previous.id,human:payload.human,reason}),payload,assessment:previous.assessment,interview:sim,provider:'human_correction'}).onConflictDoNothing();
 await logActivity(ctx,{subjectType:'role',subjectId:roleId,action:'assessment.corrected',metadata:{candidateRef,criterionKey,level,reason:reason.trim().slice(0,600)}});
 const publication=await latestPublication(ctx,roleId);const delivered=publication?(publication.payload as Publication).entries.find(e=>e.candidateId===previous.candidateId):null;if(publication?.cycleId===cycle.id&&delivered?.revisionId===previous.id)await buildPublication(ctx,cycle,publication.cutoffAt,'correction',`BondMoran corrected ${c.label.toLowerCase()} against the existing evidence.`);
}
export async function workingCandidateEntry(ctx:Ctx,roleId:string,candidateId:string){requireUser(ctx.actor,'consultant');await roleForActor(ctx,roleId);const cycle=await currentCycle(ctx,roleId);if(!cycle)return null;const revisions=await selectRevisions(ctx,cycle,new Date());const r=revisions.find(r=>r.candidateId===candidateId);return r?scoredEntry(ctx,roleId,r):null;}
export async function startUpdatedSearch(ctx:Ctx,roleId:string){const role=await roleForActor(ctx,roleId,{lock:true});if(role.status!=='open'||role.rubricApprovedVersion!==role.roleVersion)throw invalid('Review and approve the job checklist first.');await ensureLegacyPublication(ctx,roleId);await ctx.tx.update(S.roles).set({shortlistEnabled:true}).where(eq(S.roles.id,roleId));const {recomputeRole}=await import('./matching');await recomputeRole(ctx,roleId);await logActivity(ctx,{subjectType:'role',subjectId:roleId,action:'shortlist.cycle_started'});}
export async function candidateFollowUps(ctx:Ctx,candidateId:string){const rows=await ctx.tx.select({memberId:S.shortlistMembers.id,roleId:S.roles.id,title:S.roles.title,version:S.shortlistCycles.roleVersion,current:S.roles.roleVersion}).from(S.shortlistMembers).innerJoin(S.shortlistCycles,eq(S.shortlistCycles.id,S.shortlistMembers.cycleId)).innerJoin(S.roles,eq(S.roles.id,S.shortlistCycles.roleId)).where(and(eq(S.shortlistMembers.candidateId,candidateId),eq(S.roles.status,'open')));const out:{key:null;question:string;section:string;kind:'follow_up';targetKey:null;evidenceIds:string[];reason:string}[]=[];for(const row of rows){if(row.version!==row.current)continue;const [r]=await ctx.tx.select().from(S.shortlistRevisions).where(eq(S.shortlistRevisions.memberId,row.memberId)).orderBy(desc(S.shortlistRevisions.submittedAt),desc(S.shortlistRevisions.rowVersion),desc(S.shortlistRevisions.createdAt)).limit(1);const a=r?.assessment as AssessmentOutput|null;for(const c of a?.criteria??[])if(c.followUp)out.push({key:null,question:c.followUp,section:`For ${row.title}`,kind:'follow_up',targetKey:null,evidenceIds:c.evidenceIds,reason:c.reasonSafe});}return out;}
/** A client's correction is a dated annotation, never a global preference or a hidden score bonus. */
export async function annotatePublishedAnswer(ctx:Ctx,roleId:string,candidateId:string,question:string,score:number,reason:string){
 await ensureLegacyPublication(ctx,roleId);await advisoryLock(ctx.tx,`shortlist-publish:${roleId}`);const p=await latestPublication(ctx,roleId);if(!p)return;const data=p.payload as Publication;
 const annotate=(e:PublishedEntry)=>e.candidateId===candidateId&&e.sim?{...e,sim:{...e.sim,answers:e.sim.answers.map(a=>a.question===question?{...a,human:{score,reason}}:a)}}:e;
 const payload={...data,entries:data.entries.map(annotate),previous:data.previous.map(annotate)};if(digest(payload)===digest(data))return;
 await ctx.tx.insert(S.shortlists).values({datasetId:ctx.datasetId,roleId,cycleId:p.cycleId,version:p.version+1,kind:'correction',publishedAt:new Date(),cutoffAt:p.cutoffAt,reason:'A hiring manager annotated an interview answer. Criterion ranking is unchanged.',scoringVersion:p.scoringVersion,promptVersion:p.promptVersion,payload});
}
