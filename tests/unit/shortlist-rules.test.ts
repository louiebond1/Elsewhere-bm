import {it,expect} from 'vitest';
import {shortlistMetrics,contenderPriority,compareShortlist} from '../../src/server/lib/shortlist-rules';
import type {Level} from '../../src/server/lib/matching-rules';
const criteria=[{criterionId:'a',label:'Reconciliations',weight:30,importance:'essential'},{criterionId:'b',label:'Close',weight:25,importance:'essential'},{criterionId:'c',label:'Explain',weight:20,importance:'essential'},{criterionId:'d',label:'Improve',weight:15,importance:'desirable'},{criterionId:'e',label:'Sheets',weight:10,importance:'desirable'}];
const m=(values:Record<string,Level>)=>shortlistMetrics(criteria,new Map(Object.entries(values)));
it('keeps proven evidence separate from bounded unknown credit and confirmed non-fit',()=>{
 const missing=m({a:'strong',b:'strong',c:'strong',d:'strong'}),honest=m({a:'strong',b:'strong',c:'strong',d:'strong',e:'none_stated'});
 expect(missing.demonstrated).toBe(90);expect(missing.working).toBe(92.25);expect(missing.ceiling).toBe(100);expect(honest.working).toBe(90);
 expect(m({a:'none_stated'}).essentialNotMet).toBe(false);expect(m({a:'not_met'}).essentialNotMet).toBe(true);
 expect(m({e:'strong'}).working).toBe(12.25);
 expect(compareShortlist({...m({a:'not_met',b:'strong',c:'strong',d:'strong',e:'strong'}),reference:'A'},{...m({e:'related'}),reference:'B'})).toBeGreaterThan(0);
});
it('does not lose the mountain candidate through an upside-estimate veto',()=>{
 const person=m({a:'strong',b:'strong',c:'strong',d:'strong'});const boundary={...m({a:'strong',b:'strong',c:'strong',d:'strong',e:'strong'}),demonstrated:98,working:98};
 expect(person.upside).toBe(97.5);expect(contenderPriority(person,boundary,boundary,false)).toBe(3);
 expect(contenderPriority(m({e:'strong'}),boundary,boundary,false)).toBeNull();
});
it('stays bounded and rewards every evidenced level of Related or better across combinations',()=>{
 const levels:Level[]=['unknown','none_stated','related','partial','clear','strong','not_met'];
 for(const a of levels)for(const b of levels)for(const c of levels){const input={a,b,c};const before=m(input);expect(before.working).toBeGreaterThanOrEqual(0);expect(before.working).toBeLessThanOrEqual(100);for(const next of ['related','partial','clear','strong'] as Level[]){const after=m({...input,d:next});expect(after.working+1e-8).toBeGreaterThanOrEqual(before.working);}}
});
