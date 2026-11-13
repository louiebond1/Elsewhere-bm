/** Server-side provenance validation. Structured output is a syntax aid, not proof. */
import type { ExtractionOutput, AssessmentOutput } from './schemas';

const NUM = /\d+(?:[.,]\d+)?/g;

export type Source = { id: string; text: string };

export function validateExtraction(out: ExtractionOutput, sources: Source[]) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const accepted: ExtractionOutput['items'] = [];
  const rejected: { index: number; reason: string }[] = [];
  out.items.forEach((item, index) => {
    const src = byId.get(item.sourceId);
    if (!src) return rejected.push({ index, reason: 'unknown_source' });
    if (!item.quote || !src.text.includes(item.quote)) return rejected.push({ index, reason: 'quote_not_in_source' });
    const nums = [...(item.claim + ' ' + (item.outcome ?? '') + ' ' + item.safeClaim).matchAll(NUM)].map((m) => m[0]);
    if (nums.some((n) => !src.text.includes(n))) return rejected.push({ index, reason: 'unsupported_number' });
    accepted.push(item);
  });
  return { accepted, rejected, conflicts: out.conflicts.filter((c) => c.sourceIds.every((s) => byId.has(s))) };
}

export function validateAssessment(out: AssessmentOutput, criterionIds: string[], evidenceIds: string[], sources?: { id: string; safeClaim: string | null }[]) {
  const ev = new Set(evidenceIds);
  const seen = new Set<string>();
  for (const c of out.criteria) {
    if(c.level==='contradictory')return {ok:false as const,reason:'deprecated_level'};
    if (!criterionIds.includes(c.criterionId)) return { ok: false as const, reason: 'unknown_criterion' };
    if (seen.has(c.criterionId)) return { ok: false as const, reason: 'duplicate_criterion' };
    seen.add(c.criterionId);
    if (sources && c.level !== 'unknown' && (!c.quote?.trim() || !c.evidenceIds.some((id) => sources.find((s) => s.id === id)?.safeClaim?.includes(c.quote)))) return { ok: false as const, reason: 'quote_not_in_source' };
    if (c.level === 'unknown' && (c.evidenceIds.length || c.quote)) return { ok: false as const, reason: 'unknown_with_evidence' };
    if (c.evidenceIds.some((e) => !ev.has(e))) return { ok: false as const, reason: 'foreign_evidence' };
    if (c.level !== 'unknown' && !c.evidenceIds.length) return { ok: false as const, reason: 'missing_evidence' };
  }
  if (seen.size !== criterionIds.length) return { ok: false as const, reason: 'missing_criterion' };
  return { ok: true as const };
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[\s-]?){9,}/;
const URL_RE = /(https?:\/\/|www\.)\S+/i;

/** Blocks direct identifiers in client-safe text. A consultant still reviews residual prose. */
export function safeClaimProblems(text: string, forbidden: string[]): string[] {
  const out: string[] = [];
  if (EMAIL.test(text)) out.push('Contains an email address');
  if (PHONE.test(text)) out.push('Contains a phone number');
  if (URL_RE.test(text)) out.push('Contains a link');
  const lower = text.toLowerCase();
  for (const f of forbidden) {
    const t = f.trim().toLowerCase();
    const escaped=t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if (t.length >= 3 && new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'iu').test(lower)) out.push(`Contains an identifying name: "${f}"`);
  }
  return out;
}
