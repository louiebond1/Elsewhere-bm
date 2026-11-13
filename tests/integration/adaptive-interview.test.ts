import {it,expect} from 'vitest';
import {load} from './helpers';
import {saveOwnAnswer,questionsLeft} from '../../src/server/services/onboarding';
import {chatTurn} from '../../src/server/services/mini-me-chat';
it('the connector agenda and built-in coach explore a clue and stop repeating it once answered',async()=>{
 const w=await load();const me=w.cand('C01');
 await w.T(me,c=>saveOwnAnswer(c,'current_role','I was CFO at a factory in China described as a sweatshop.'));
 const agenda=await w.T(me,c=>questionsLeft(c));
 expect(agenda.followUps[0].question).toContain('directly experience');
 expect(agenda.followUps[0].targetKey).toBe('difficult_conditions');
 const first=await chatTurn(me,null);
 expect(first.reply).toContain('directly experience');
 const second=await chatTurn(me,'We had two finance staff. I negotiated staged supplier payments and challenged a proposal to delay wages.');
 expect(second.reply).not.toContain('What conditions did you directly experience');
 const next=await w.T(me,c=>questionsLeft(c));
 expect(next.followUps.some(q=>q.targetKey==='difficult_conditions')).toBe(false);
});
it('age-comparison statements trigger team questions, never assumed first-job status',async()=>{
 const w=await load();const me=w.cand('C01');
 await w.T(me,c=>saveOwnAnswer(c,'current_role','I was the youngest colleague. It was my third job.'));
 const agenda=await w.T(me,c=>questionsLeft(c));
 expect(agenda.followUps[0].question).toContain('built trust');
 expect(agenda.followUps[0].question).not.toContain('first job');
});
