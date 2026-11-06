/** Authoritative fixture outputs for the known C40 demo helper answers. Used only in fixture mode. */
import { CANDIDATES } from './candidates';

const c40 = CANDIDATES.find((c) => c.code === 'C40')!;

export const FIXTURE_EXTRACTIONS = [
  { answer: c40.q1, quote: c40.q1, claim: 'Organised group project tasks when two deadlines overlapped and checked progress with each person.', safeClaim: c40.safe1, tags: ['coordination', 'learning'], outcome: null as string | null, uncertainty: 'Study example; outcome not described.' as string | null, strength: 'partial' as const },
  { answer: c40.q2, quote: c40.q2, claim: 'Has not worked in a commercial role yet; examples are from study.', safeClaim: c40.safe2, tags: ['learning'], outcome: null as string | null, uncertainty: 'No commercial experience yet.' as string | null, strength: 'assertion' as const },
];
