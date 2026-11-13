import {it,expect} from 'vitest';
import {interviewTouched} from '../../src/server/services/simulation';
it('new context evidence and an answered adaptive question refresh the interview, without treating a hobby as work evidence',()=>{
 const then=new Date('2026-11-13T09:00:00Z'),now=new Date('2026-11-13T10:00:00Z');
 const sim={updatedAt:then,scoreCard:{factors:{keys:[],tags:[],itemIds:[]},gaps:{keys:[],tags:[],anyExample:false}},answers:[]};
 expect(interviewTouched(sim,[{key:'difficult_conditions',topic:null,answer:'I negotiated a supplier payment plan during a cash shortage.',updatedAt:now}])).toBe(true);
 expect(interviewTouched(sim,[{key:'extra:follow',topic:'What happened after you challenged the wage delay?',answer:'We agreed a payment timetable.',updatedAt:now}])).toBe(true);
 expect(interviewTouched(sim,[{key:'extra:hobby',topic:'Favourite football team',answer:'Tottenham',updatedAt:now}])).toBe(false);
});
