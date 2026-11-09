/**
 * Hiring assistant: the shared "what I've understood" model, plus the deterministic demo-mode reader.
 *
 * The client talks in plain language. Under the hood a saved role still needs the structured fields the
 * matching engine uses (3 to 6 job-related items, each tied to evidence tags). The client never sees tags
 * or the word "criteria"; they see "must-haves", "nice to haves" and "things you'll teach".
 *
 * Demo mode (no live AI) uses simple keyword matching on what the client typed. It is labelled as such and
 * does not pretend to understand more than the keywords it recognises.
 */
import { TAXONOMY, type Tag } from '../server/services/inputs';

export type Family = 'finance' | 'operations' | 'commercial';
export type Region = 'london' | 'hertfordshire' | 'manchester' | 'remote_uk';
export type Mode = 'onsite' | 'hybrid' | 'remote';
export type Item = { label: string; tags: Tag[] };

export type Understanding = {
  title: string | null;
  roleFamily: Family | null;
  salaryPounds: number | null;
  locationRegion: Region | null;
  workMode: Mode | null;
  outcomes: string[];
  mustHaves: Item[];
  niceToHaves: Item[];
  teachable: string[];
  /** Fields filled from memory of earlier roles rather than this conversation. */
  assumed: Array<'locationRegion' | 'workMode'>;
  /** The assistant has already asked about teachable things once. */
  askedTeachable: boolean;
};

export const EMPTY: Understanding = { title: null, roleFamily: null, salaryPounds: null, locationRegion: null, workMode: null, outcomes: [], mustHaves: [], niceToHaves: [], teachable: [], assumed: [], askedTeachable: false };

export const MAX_ITEMS = 6;
export const MIN_ITEMS = 3;

export const TAG_LABEL: Record<Tag, string> = {
  reconciliations: 'Reconciliations', reporting: 'Reporting', month_end: 'Month-end close', budgeting: 'Budgeting', forecasting: 'Forecasting',
  controls: 'Financial controls', audit: 'Audit', payroll: 'Payroll', bookkeeping: 'Bookkeeping', credit_control: 'Credit control', tax: 'Tax and VAT',
  analysis: 'Analysis', excel: 'Excel', sql: 'SQL and data', automation: 'Automating manual work', process_design: 'Improving processes',
  customer_work: 'Working with customers', sales: 'Sales', partnerships: 'Partnerships', project_delivery: 'Delivering projects',
  coordination: 'Coordinating people and tasks', leadership: 'Leading others', learning: 'Learning quickly',
};

export const REGION_LABEL: Record<Region, string> = { london: 'London', hertfordshire: 'Hertfordshire', manchester: 'Manchester', remote_uk: 'Remote, UK' };
export const MODE_LABEL: Record<Mode, string> = { onsite: 'In the office', hybrid: 'Hybrid', remote: 'Remote' };
export const FAMILY_LABEL: Record<Family, string> = { finance: 'Finance', operations: 'Operations', commercial: 'Commercial' };

/** Requirements that are not job-related or could discriminate. Mentioning them is declined, not stored. */
const NOT_JOB_RELATED = /\b(young|younger|old(er)?|age[ds]?|under \d{2}|over \d{2}|gender|male|female|man|woman|men|women|girls?|guys?|pregnan\w*|maternity|religio\w*|christian|muslim|jewish|hindu|nationality|native speaker|british born|ethnic\w*|race|white|black|asian|disab\w*|married|single|children|kids|oxbridge|russell group|top universit\w*|good school|private school)\b/i;
export function notJobRelated(text: string): string | null {
  return text.match(NOT_JOB_RELATED)?.[0] ?? null;
}

/** Keywords recognised in demo mode, per evidence tag. */
const TAG_WORDS: Array<[Tag, RegExp]> = [
  ['reconciliations', /reconcil/i], ['month_end', /month[- ]?end|period[- ]end|close process|\bthe close\b/i], ['payroll', /payroll/i],
  ['bookkeeping', /bookkeep|ledger|invoic(e|ing) process/i], ['credit_control', /credit control|chasing (invoices|payments|debts)|collections|debtors/i],
  ['tax', /\btax\b|\bvat\b/i], ['budgeting', /budget/i], ['forecasting', /forecast/i], ['reporting', /report/i], ['controls', /\bcontrols?\b/i],
  ['audit', /audit/i], ['analysis', /analys|insight|numbers/i], ['excel', /excel|spreadsheet/i], ['sql', /\bsql\b|database|data\b/i],
  ['automation', /automat/i], ['process_design', /process|workflow|handoff|hand-off/i], ['customer_work', /customer|client[- ]facing|working with clients/i],
  ['sales', /\bsales?\b|selling|new business|business development/i], ['partnerships', /partner/i], ['project_delivery', /project|deliver/i],
  ['coordination', /coordinat|organis|organiz|schedul|juggl/i], ['leadership', /\blead\b|leading|manag(e|ing) (a |the )?team|supervis|mentor/i],
  ['learning', /learn|curious|pick (things )?up|eager/i],
];

const FAMILY_WORDS: Array<[Family, RegExp]> = [
  ['commercial', /\bsales (manager|executive|role|person|rep|team)|commercial|partnership|account manager|business development|marketing|customer success/i],
  ['finance', /account|financ|payroll|bookkeep|reconcil|credit control|month[- ]end|\btax\b|\bvat\b|audit|controller/i],
  ['operations', /operation|\bops\b|process|logistic|coordinat|office manager|administrat|supply chain|project/i],
];

const NICE = /nice to have|bonus|ideally|would be (good|great|nice)|helpful|plus\b|not essential|not a must/i;
const TEACH = /\b(we('| wi)ll|we can|happy to|i('| wi)ll|i can) (teach|train|show|coach)|teach (them|it)|train (them|up)|learn (it )?on the job|don'?t need to know|no need to know|we use our own|can be taught/i;
const OUTCOME = /so that|in (the first )?(six|6|three|3|twelve|12) months|success (looks|is|would)|good looks like|goal|achieve|reduce|improve|speed up|make sure|get (our|the) |own the|take over|sort out|fix /i;

const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+|;\s*/).map((s) => s.trim()).filter(Boolean);
const tidy = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().replace(/^[-•*]\s*/, '').slice(0, n);

/** Tags in the order the person mentioned them. */
function tagsIn(text: string): Tag[] {
  const hits: Array<[number, Tag]> = [];
  for (const [tag, re] of TAG_WORDS) { const m = re.exec(text); if (m) hits.push([m.index, tag]); }
  return hits.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

function salaryIn(text: string): number | null {
  const k = text.match(/£?\s?(\d{2,3}(?:\.\d)?)\s?k\b/i);
  if (k) return Math.round(Number(k[1]) * 1000);
  const full = text.match(/£\s?(\d{2,3}),?(\d{3})\b|\b(\d{2,3}),(\d{3})\b|\b(\d{5,6})\b(?=\s*(?:a year|per year|salary|pounds|gbp|p\.?a\.?|$))/i);
  if (full) {
    const n = full[1] ? Number(full[1] + full[2]) : full[3] ? Number(full[3] + full[4]) : Number(full[5]);
    return n >= 10000 && n <= 1000000 ? n : null;
  }
  return null;
}

function regionIn(text: string): Region | null {
  if (/\bmanchester\b/i.test(text)) return 'manchester';
  if (/\bhert(s|fordshire)\b|st albans|watford/i.test(text)) return 'hertfordshire';
  if (/\blondon\b/i.test(text)) return 'london';
  if (/fully remote|remote[- ]first|anywhere in the uk|remote,? uk/i.test(text)) return 'remote_uk';
  return null;
}

function modeIn(text: string): Mode | null {
  if (/hybrid|(\d|two|three|couple of) days? (a week )?in|split between/i.test(text)) return 'hybrid';
  if (/fully remote|\bremote\b|from home|wfh/i.test(text)) return 'remote';
  if (/in the office|on[- ]?site|office[- ]based|five days in|full[- ]time in/i.test(text)) return 'onsite';
  return null;
}

function familyIn(text: string): Family | null {
  for (const [f, re] of FAMILY_WORDS) if (re.test(text)) return f;
  return null;
}

function titleIn(text: string): string | null {
  const m = text.match(/\b(?:hire|hiring|need|needs|looking for|recruit(?:ing)?|role (?:is|for)|called)\s+(?:an?\s+|a new\s+|another\s+|the\s+)?([A-Za-z][A-Za-z&/ -]{2,50}?)(?=\s+(?:to|who|for|in|at|on|with|that|and|because|based|starting|paying|on £)\b|[.,!?;]|$)/i);
  if (!m) return null;
  const t = m[1].trim().replace(/\s+/g, ' ');
  if (/^(someone|somebody|person|people|help|hand|new hire|them|it|this|that|you|us)$/i.test(t) || t.split(' ').length > 6) return null;
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

export type Slot = 'title' | 'outcomes' | 'skills' | 'teachable' | 'salary' | 'family' | 'location' | 'workMode';

/** The next thing the assistant still needs, in the order it asks. Empty means ready to save. */
export function missingSlots(u: Understanding): Slot[] {
  const m: Slot[] = [];
  if (!u.title) m.push('title');
  if (!u.outcomes.length) m.push('outcomes');
  if (u.mustHaves.length + u.niceToHaves.length < MIN_ITEMS) m.push('skills');
  if (!u.askedTeachable) m.push('teachable');
  if (u.salaryPounds == null) m.push('salary');
  if (!u.roleFamily) m.push('family');
  if (!u.locationRegion) m.push('location');
  if (!u.workMode) m.push('workMode');
  return m;
}

/** Required to save; the teachable question is asked once but never blocks. */
export const readyToSave = (u: Understanding) => missingSlots(u).every((s) => s === 'teachable');

function addItem(list: Item[], others: Item[], tag: Tag) {
  if ([...list, ...others].some((i) => i.tags.includes(tag))) return;
  list.push({ label: TAG_LABEL[tag], tags: [tag] });
}

/**
 * Demo-mode reading of one client message, merged into the current understanding.
 * `lastAsked` lets a short answer ("London", "about 45k", "excel and reporting") fill the slot just asked about.
 */
export function readMessage(prev: Understanding, text: string, lastAsked: Slot | null): Understanding {
  const u: Understanding = structuredClone(prev);
  const clean = text.slice(0, 2000);
  const salary = salaryIn(clean);
  if (salary) u.salaryPounds = salary;
  const region = regionIn(clean);
  if (region) { u.locationRegion = region; u.assumed = u.assumed.filter((a) => a !== 'locationRegion'); }
  const mode = modeIn(clean);
  if (mode) { u.workMode = mode; u.assumed = u.assumed.filter((a) => a !== 'workMode'); }
  const title = titleIn(clean) ?? (lastAsked === 'title' && clean.split(' ').length <= 6 ? tidy(clean.replace(/^(an?|the)\s+/i, ''), 60).replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  if (title && !u.title) u.title = title;
  const fam = familyIn(clean) ?? (lastAsked === 'family' ? (/financ/i.test(clean) ? 'finance' : /operat/i.test(clean) ? 'operations' : /commerc|sales/i.test(clean) ? 'commercial' : null) : null);
  if (fam && !u.roleFamily) u.roleFamily = fam;
  if (lastAsked === 'teachable') u.askedTeachable = true;

  for (const raw of sentences(clean)) {
    // Drop only the clauses that are not job-related, so the rest of the sentence still counts.
    const s = notJobRelated(raw) ? raw.split(/,|\band\b|\bbut\b/i).filter((c) => !notJobRelated(c)).join(', ').trim() : raw;
    if (!s) continue;
    const tags = tagsIn(s);
    const teach = TEACH.test(s) || (lastAsked === 'teachable' && !tags.length);
    if (teach) {
      if (!/^(no|nope|nothing|none|not really|n\/a)\b/i.test(s)) {
        const t = tidy(s.replace(/^.*?\b(teach|train|show|coach)\b\s+(them|people|whoever|the person)?\s*/i, ''), 120).replace(/[.!]$/, '');
        if (t.length >= 2 && !u.teachable.includes(t) && u.teachable.length < 8) u.teachable.push(t);
      }
      continue;
    }
    if (OUTCOME.test(s) || (lastAsked === 'outcomes' && !u.outcomes.length)) {
      const o = tidy(s, 300);
      if (o && !u.outcomes.includes(o) && u.outcomes.length < 6) u.outcomes.push(o);
    }
    // "Reporting matters, and Excel would be a bonus": bonus wording applies to its own clause only.
    let nice = false;
    for (const clause of s.split(/,|;|\band\b|\bbut\b/i)) {
      // Bonus wording carries on through the rest of the sentence ("Ideally Excel and SQL") until must-have wording appears.
      if (NICE.test(clause)) nice = true;
      else if (/\b(essential|must|need|needs|important|key|critical)\b/i.test(clause)) nice = false;
      for (const tag of tagsIn(clause)) {
        if (u.mustHaves.length + u.niceToHaves.length >= MAX_ITEMS) break;
        if (nice) addItem(u.niceToHaves, u.mustHaves, tag);
        else addItem(u.mustHaves, u.niceToHaves, tag);
      }
    }
  }
  return u;
}

/** Clamps a model-proposed understanding to allowed values. Unknown tags and non-job-related items are dropped. */
export function sanitise(u: Partial<Understanding> & Record<string, unknown>, prev: Understanding): Understanding {
  const tagOk = (t: unknown): t is Tag => typeof t === 'string' && (TAXONOMY as readonly string[]).includes(t);
  const items = (v: unknown): Item[] => (Array.isArray(v) ? v : []).flatMap((i) => {
    const label = typeof i?.label === 'string' ? tidy(i.label, 80) : '';
    const tags = (Array.isArray(i?.tags) ? i.tags : []).filter(tagOk).slice(0, 8);
    return label.length >= 2 && tags.length && !notJobRelated(label) ? [{ label, tags }] : [];
  });
  const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : []).filter((s): s is string => typeof s === 'string' && !!s.trim() && !notJobRelated(s)).map((s) => tidy(s, n)).slice(0, max);
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T | null) => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);
  const must = items(u.mustHaves);
  const nice = items(u.niceToHaves).slice(0, Math.max(0, MAX_ITEMS - must.length));
  const salary = typeof u.salaryPounds === 'number' && Number.isInteger(u.salaryPounds) && u.salaryPounds >= 10000 && u.salaryPounds <= 1000000 ? u.salaryPounds : prev.salaryPounds;
  const title = typeof u.title === 'string' && u.title.trim().length >= 2 ? tidy(u.title, 120) : prev.title;
  const region = pick(u.locationRegion, ['london', 'hertfordshire', 'manchester', 'remote_uk'] as const, prev.locationRegion);
  const mode = pick(u.workMode, ['onsite', 'hybrid', 'remote'] as const, prev.workMode);
  return {
    title,
    roleFamily: pick(u.roleFamily, ['finance', 'operations', 'commercial'] as const, prev.roleFamily),
    salaryPounds: salary,
    locationRegion: region,
    workMode: mode,
    outcomes: strs(u.outcomes, 300, 6),
    mustHaves: must.slice(0, MAX_ITEMS),
    niceToHaves: nice,
    teachable: strs(u.teachable, 120, 8),
    assumed: prev.assumed.filter((a) => (a === 'locationRegion' ? region === prev.locationRegion : mode === prev.workMode)),
    askedTeachable: prev.askedTeachable || u.askedTeachable === true,
  };
}

/** The structured items the matching engine needs, built from the plain-language lists. */
export function toCriteria(u: Understanding) {
  const used = new Set<string>();
  const key = (label: string) => {
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 34) || 'item';
    let k = base.length >= 2 ? base : `${base}_x`;
    for (let n = 2; used.has(k); n++) k = `${base}_${n}`;
    used.add(k);
    return k;
  };
  const must = u.mustHaves.slice(0, MAX_ITEMS).map((i, idx) => ({ key: key(i.label), label: i.label, description: i.label, importance: 'essential' as const, weight: idx === 0 ? 5 : idx < 3 ? 4 : 3, evidenceTags: i.tags }));
  const nice = u.niceToHaves.slice(0, MAX_ITEMS - must.length).map((i) => ({ key: key(i.label), label: i.label, description: i.label, importance: 'desirable' as const, weight: 2, evidenceTags: i.tags }));
  return [...must, ...nice];
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Plain questions, one at a time. Shared by demo mode and the screen's quick answers. */
export const QUESTIONS: Record<Slot, string> = {
  title: 'What is the job called?',
  outcomes: 'What should they have done after six months? In other words, what does a great hire achieve?',
  skills: 'What will they do day to day? For example: reconciliations, reporting, month-end, working with customers.',
  teachable: 'Is there anything you will teach them, like your systems? Then we won’t turn people away for not knowing it.',
  salary: 'What is the salary? A rough number is fine, like 45k.',
  family: 'Which area is it in?',
  location: 'Where is the job?',
  workMode: 'How will they work?',
};

/** Tap-to-answer options for questions with a fixed set of answers. Each is sent as an ordinary message. */
export const QUICK_ANSWERS: Partial<Record<Slot, string[]>> = {
  family: ['Finance', 'Operations', 'Commercial'],
  location: ['London', 'Hertfordshire', 'Manchester', 'Remote, anywhere in the UK'],
  workMode: ['In the office', 'Hybrid', 'Remote'],
  teachable: ['Nothing to teach', 'We will teach our systems', 'We will teach our reporting format'],
};

const sentenceCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Demo-mode assistant wording: short notes on what it picked up, then the next plain question. */
export function demoReply(prev: Understanding, next: Understanding, declined: string | null): { text: string; asked: Slot | null } {
  const notes: string[] = [];
  if (next.title && next.title !== prev.title) notes.push(`Job: ${next.title}`);
  const had = (i: Item) => [...prev.mustHaves, ...prev.niceToHaves].some((p) => p.label === i.label);
  const newMust = next.mustHaves.filter((i) => !had(i)).map((i) => i.label.toLowerCase());
  const newNice = next.niceToHaves.filter((i) => !had(i)).map((i) => i.label.toLowerCase());
  if (newMust.length) notes.push(`They need ${list(newMust)}`);
  if (newNice.length) notes.push(`${sentenceCase(list(newNice))} would be a bonus`);
  if (next.outcomes.length > prev.outcomes.length) notes.push('Great, that’s a clear goal');
  if (next.teachable.length > prev.teachable.length) notes.push(`You’ll teach ${list(next.teachable.slice(prev.teachable.length))}`);
  if (next.salaryPounds && next.salaryPounds !== prev.salaryPounds) notes.push(`Salary: £${next.salaryPounds.toLocaleString('en-GB')}`);
  if (next.locationRegion && next.locationRegion !== prev.locationRegion) notes.push(`Based in ${REGION_LABEL[next.locationRegion]}`);
  if (next.workMode && next.workMode !== prev.workMode) notes.push(`${MODE_LABEL[next.workMode]}`);
  let text = notes.length ? `${notes.join('. ')}. ` : 'Thanks. ';
  if (declined) text += `I’ve left out “${declined}”, as I can only use things to do with the job itself. `;
  const slot = missingSlots(next)[0] ?? null;
  if (!slot) return { text: `${text}That’s everything I need. Check “Your role so far”, then press Create role.`, asked: null };
  const q = slot === 'skills' && next.mustHaves.length + next.niceToHaves.length > 0
    ? `What else matters for this job? I have ${next.mustHaves.length + next.niceToHaves.length} so far and need at least ${MIN_ITEMS}.`
    : QUESTIONS[slot];
  return { text: `${text}${q}`, asked: slot };
}
