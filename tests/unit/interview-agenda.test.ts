import {it,expect} from 'vitest';
import {contextFollowUps} from '../../src/server/lib/interview-agenda';
it('asks about conditions and decisions without awarding hardship or inferring first job',()=>{
  const factory=contextFollowUps([{id:'1',text:'I was CFO at a sweatshop factory in China.'}]);
  const multinational=contextFollowUps([{id:'2',text:'I was CFO of a multinational.'}]);
  expect(factory.some(q=>q.question.includes('directly experience'))).toBe(true);
  expect(multinational.some(q=>q.question.includes('decision you personally made'))).toBe(true);
  const team=contextFollowUps([{id:'3',text:'I was the youngest person in my team.'}]);
  expect(team[0].question).toContain('built trust');
  expect(team[0].question).not.toContain('first job');
});
it('suppresses a follow-up once the exact question has an answer',()=>{
  const seed={id:'1',text:'I was CFO of a factory.'};
  const questions=contextFollowUps([seed]);
  expect(contextFollowUps([seed,...questions.map((q,i)=>({id:`a${i}`,text:`${q.question}\nI personally did the work.`}))])).toHaveLength(0);
});
