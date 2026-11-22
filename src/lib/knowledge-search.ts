/** Plain word matching between a question and knowledge records. No AI: used to pick what to send, and for basic answers. */
const STOP = new Set('the a an and or but of to in on at for with from by about as is are was were be been being am i me my mine you your yours we our it its this that these those what which who whom whose when where why how do does did done have has had can could would should will shall may might must not no yes so if then than there here into out up down over under again more most some any all each other such only own same too very just also tell describe give time times thing things something anything really get got like ever'.split(' '));

export function stem(w: string) {
  let out = w;
  for (const suf of ['ingly', 'ings', 'ing', 'edly', 'ies', 'ied', 'ed', 'es', 'ly', 's']) {
    if (w.length >= suf.length + 3 && w.endsWith(suf)) { out = suf === 'ies' || suf === 'ied' ? w.slice(0, -suf.length) + 'y' : w.slice(0, -suf.length); break; }
  }
  // "move" and "moving" meet at "mov".
  return out.length >= 4 && out.endsWith('e') ? out.slice(0, -1) : out;
}

export function words(s: string) {
  return [...new Set(s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9£%]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map(stem))];
}

export type Searchable = { id: string; title: string; text: string; question?: string | null; area?: string };

/**
 * Records ranked by how many of the question's words they share; the title and question count double.
 * `coverage` is the share of the question's words the record contains (0 to 1).
 */
export function rankRecords<T extends Searchable>(question: string, records: T[]) {
  const q = words(question);
  if (!q.length) return [] as { record: T; score: number; coverage: number }[];
  // Rarer words count for more, so "the" style words that slipped through don't dominate.
  const docs = records.map((r) => ({ r, head: new Set(words(`${r.title} ${r.question ?? ''} ${r.area ?? ''}`)), body: new Set(words(r.text)) }));
  const df = new Map(q.map((w) => [w, docs.filter((d) => d.head.has(w) || d.body.has(w)).length]));
  const idf = (w: string) => Math.log(1 + records.length / (1 + (df.get(w) ?? 0)));
  return docs
    .map((d) => ({ record: d.r, score: q.reduce((a, w) => a + (d.head.has(w) ? 2 : 0) * idf(w) + (d.body.has(w) ? 1 : 0) * idf(w), 0), coverage: q.filter((w) => d.head.has(w) || d.body.has(w)).length / q.length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}
