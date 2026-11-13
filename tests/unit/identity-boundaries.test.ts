import {it,expect} from 'vitest';
import {safeClaimProblems} from '../../src/server/ai/validate';
it('blocks identifying names as tokens without confusing them with ordinary words',()=>{
 expect(safeClaimProblems('Reviewed the agreed requirements.',['Reed','Ann','Lee'])).toEqual([]);
 expect(safeClaimProblems('Reed reviewed the requirements.',['Reed'])).not.toEqual([]);
 expect(safeClaimProblems('The note names Ann.',['Ann'])).not.toEqual([]);
 expect(safeClaimProblems('Lee’s notes',['Lee'])).not.toEqual([]);
 expect(safeClaimProblems('Worked at Acme Ltd.',['Acme Ltd'])).not.toEqual([]);
});
