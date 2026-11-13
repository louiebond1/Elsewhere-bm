import {LEVEL_VALUE,type Level} from './matching-rules';
export const SHORTLIST_VERSION='shortlist-v1';
export const SHORTLIST_DEFAULTS={hours:24,processingHours:1,maxProcessingHours:3,updateHours:72,weeklyHours:168,closeMargin:2.5,reviewLimit:8,minimumCoverage:50,minimumKnownAverage:75,invitationHours:48} as const;
export type Requirement={criterionId:string;label:string;weight:number;importance?:string};
export function shortlistMetrics(criteria:Requirement[],levels:Map<string,Level>){
 const total=criteria.reduce((s,c)=>s+c.weight,0)||1;
 const weight=(c:Requirement)=>100*c.weight/total;
 const known=criteria.filter(c=>levels.has(c.criterionId)&&levels.get(c.criterionId)!=='unknown');
 const rawC=known.reduce((s,c)=>s+weight(c),0);
 const rawD=known.reduce((s,c)=>s+weight(c)*LEVEL_VALUE[levels.get(c.criterionId)!]/100,0);
 const C=Math.max(0,Math.min(100,rawC)),D=Math.max(0,Math.min(100,rawD));
 const Q=C?100*D/C:0,f=Math.min(25,Math.max(0,Q-25))*C/100;
 const essentialNotMet=criteria.some(c=>c.importance==='essential'&&levels.get(c.criterionId)==='not_met');
 const unknown=criteria.filter(c=>!levels.has(c.criterionId)||levels.get(c.criterionId)==='unknown');
 return {demonstrated:D,coverage:C,knownAverage:Q,working:D+(100-C)*f/100,upside:D+(100-C)*Math.min(75,Math.max(0,Q-25))/100,ceiling:D+100-C,essentialNotMet,essentialPoints:known.filter(c=>c.importance==='essential').reduce((s,c)=>s+weight(c)*LEVEL_VALUE[levels.get(c.criterionId)!]/100,0),unknown:unknown.map(c=>c.label),unknownEssentials:unknown.filter(c=>c.importance==='essential').map(c=>c.label)};
}
export type Metrics=ReturnType<typeof shortlistMetrics>;
const difference=(a:number,b:number)=>Math.abs(a-b)<1e-9?0:a-b;
export function compareShortlist(a:Metrics&{reference:string},b:Metrics&{reference:string}){return Number(a.essentialNotMet)-Number(b.essentialNotMet)||difference(b.working,a.working)||difference(b.demonstrated,a.demonstrated)||difference(b.essentialPoints,a.essentialPoints)||a.reference.localeCompare(b.reference);}
/** A realistic estimate prioritises investigation; it never vetoes a strong person's mathematical possibility. */
export function contenderPriority(m:Metrics,tenth:Metrics|undefined,third:Metrics|undefined,listed:boolean){
 if(m.essentialNotMet||!m.unknown.length||m.coverage<50||m.knownAverage<75)return null;
 if(tenth&&!tenth.essentialNotMet&&m.ceiling<tenth.demonstrated)return null;
 if(tenth&&!tenth.essentialNotMet&&m.ceiling<tenth.working)return null;
 if(!m.unknownEssentials.length&&listed)return null;
 return m.unknownEssentials.length?(third&&m.ceiling>=third.working?1:2):3;
}
