'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Orbit, Library, GraduationCap, Settings, ArrowLeft, ArrowUp, Search, Shuffle, Plus, Check, X } from 'lucide-react';
import { useCommand, type ApiError } from '../client';
import { cx } from '../ui';
import { KnowledgeGlobe, useReducedMotion } from './globe';

/** Mini Me: the candidate's Knowledge Globe, with Ask, Test (interview mode) and their records. Black, quiet, real data only. */

export type Item = { id: string; category: string; categoryChosen: boolean; title: string; text: string; question: string | null; source: 'self' | 'ai'; provider: string | null; confirmed: boolean; createdAt: string; updatedAt: string };
export type View = { items: Item[]; categories: { key: string; label: string; count: number; unanswered: string[] }[]; total: number; areas: number; missingAreas: { key: string; label: string; empty: boolean; unanswered: number }[]; unconfirmed: number; lastUpdatedAt: string | null };
type Answer = { question: string; mode: 'ask' | 'interview'; answer: string; usedIds: string[]; notKnown: string | null; live: boolean; basic: string | null };
type Panel = { kind: 'inside' } | { kind: 'category'; key: string } | { kind: 'item'; id: string; from: Panel } | { kind: 'add'; topic: string; category: string | null; from: Panel };

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const sourceOf = (i: Item) => i.source === 'self'
  ? (i.provider ? `Saved by ${i.provider === 'Elsewhere' ? 'the Elsewhere coach' : i.provider}, confirmed by you` : 'Written by you')
  : `Saved by ${i.provider === 'Elsewhere' ? 'the Elsewhere coach' : (i.provider ?? 'your AI')}`;

const MUTED = 'text-[#8E8E93]';
const FAINT = 'text-[#5E5E63]';
const CARD = 'rounded-[22px] border border-white/[0.08] bg-white/[0.035]';
const BTN = 'press inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium transition-colors disabled:opacity-40';
const BTN_PRIMARY = cx(BTN, 'bg-white text-black hover:bg-white/90');
const BTN_QUIET = cx(BTN, 'bg-white/[0.08] text-white hover:bg-white/[0.14]');
const FIELD = 'w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder:text-[#5E5E63] focus:border-white/30 focus:outline-none';

function Err({ error }: { error: ApiError | null }) {
  return error ? <p role="alert" className="mt-2 text-[13px] text-[#FF8A80]">{error.message}</p> : null;
}

export function MiniMeExperience({ view, connected, waiting, interviewQuestions, starters, screen }: { view: View; connected: string | null; waiting: { checkInDrafts: number; toCheck: number }; interviewQuestions: string[]; starters: string[]; screen: 'globe' | 'knowledge' }) {
  const reducedMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>({ kind: 'inside' });
  const [litIds, setLitIds] = useState<string[]>([]);
  const byId = useMemo(() => new Map(view.items.map((i) => [i.id, i])), [view.items]);
  const label = useMemo(() => Object.fromEntries(view.categories.map((c) => [c.key, c.label])), [view.categories]);
  const dots = useMemo(() => view.items.map((i) => ({ id: i.id, category: i.category })), [view.items]);
  const focusCategory = panel.kind === 'category' ? panel.key : null;

  const openItem = useCallback((id: string | null) => {
    setSelectedId(id);
    setPanel((p) => (id ? { kind: 'item', id, from: p.kind === 'item' ? p.from : p } : p.kind === 'item' ? p.from : p));
  }, []);
  const openCategory = (key: string | null) => { setSelectedId(null); setLitIds([]); setPanel(key ? { kind: 'category', key } : { kind: 'inside' }); };
  const showAnswer = (ids: string[]) => { setLitIds(ids); setSelectedId(null); setPanel((p) => (p.kind === 'category' ? { kind: 'inside' } : p)); };

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const callout = selected ? (
    <div className="relative">
      <span className="absolute -left-[9px] -top-[9px] h-[18px] w-[18px] rounded-full border border-white/70" />
      <span className="absolute left-[7px] top-[-7px] h-px w-9 origin-left -rotate-[35deg] bg-white/40" />
      <div className="absolute left-[36px] top-[-52px] w-max max-w-[220px] rounded-xl border border-white/10 bg-black/80 px-3 py-2 backdrop-blur">
        <p className={cx('text-[11px] uppercase tracking-[0.12em]', MUTED)}>{label[selected.category]}</p>
        <p className="mt-0.5 truncate text-[14px] font-medium text-white">{selected.title}</p>
      </div>
    </div>
  ) : null;

  const side = (
    <SidePanel panel={panel} setPanel={setPanel} view={view} byId={byId} label={label} openItem={openItem} openCategory={openCategory} />
  );

  return (
    <div className="takeover fixed inset-0 z-[100] overflow-y-auto bg-black text-white [color-scheme:dark]">
      <div className="mx-auto flex min-h-full max-w-[1560px] flex-col lg:flex-row">
        <Rail screen={screen} />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-4 sm:px-6 lg:px-10 lg:pt-10">
          <header>
            <h1 className="font-display text-[34px] font-semibold leading-none tracking-[-0.035em] text-white lg:text-[44px]">{screen === 'knowledge' ? 'Knowledge' : 'Mini Me'}</h1>
            <p className={cx('mt-3 max-w-[52ch] text-[15px] lg:text-[17px]', MUTED)}>{screen === 'knowledge' ? 'Everything your Mini Me knows. Check it, correct it, or remove it.' : 'An AI version of you, trained on your life, thoughts, and experiences.'}</p>
            {(waiting.checkInDrafts > 0 || waiting.toCheck > 0) && (
              <div className="mt-4 flex flex-wrap gap-2 text-[14px]">
                {waiting.checkInDrafts > 0 && <Link href="/candidate/ai" className="rounded-full border border-white/15 px-4 py-1.5 text-white no-underline hover:border-white/30">Your AI also drafted {waiting.checkInDrafts} answer{waiting.checkInDrafts > 1 ? 's' : ''} to a check-in question →</Link>}
                {waiting.toCheck > 0 && <Link href="/candidate/onboarding?mode=train" className="rounded-full border border-white/15 px-4 py-1.5 text-white no-underline hover:border-white/30">Your AI wrote {waiting.toCheck} new thing{waiting.toCheck > 1 ? 's' : ''} to check →</Link>}
              </div>
            )}
          </header>

          {screen === 'knowledge' ? (
            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className={cx(CARD, 'p-5')}><ItemList items={view.items} label={label} categories={view.categories} onOpen={openItem} withFilter /></div>
              <div className="lg:sticky lg:top-6 lg:self-start">{panel.kind === 'item' || panel.kind === 'add' ? side : <InsideSummary view={view} openItem={openItem} />}</div>
            </div>
          ) : (
            <div className="mt-4 grid gap-6 lg:mt-2 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px]">
              <section aria-label="Your Knowledge Globe" className="relative lg:sticky lg:top-4 lg:self-start">
                <div className="relative mx-auto h-[min(100vw,560px)] w-full lg:h-[max(520px,calc(100vh-190px))]">
                  {view.total === 0 && <p className={cx('pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-[15px]', MUTED)}>Nothing here yet. What your Mini Me learns appears as points of light.</p>}
                  <KnowledgeGlobe dots={dots} selectedId={selectedId} focusCategory={focusCategory} litIds={litIds} reducedMotion={reducedMotion} onSelect={openItem} callout={callout} />
                </div>
                <SummaryCard view={view} connected={connected} />
              </section>
              <div className="space-y-4 lg:pt-4">
                {side}
                <AskPanel interviewQuestions={interviewQuestions} starters={starters} byId={byId} label={label} onAnswer={showAnswer} openItem={openItem} onAdd={(topic) => setPanel((p) => ({ kind: 'add', topic, category: null, from: p }))} />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Rail({ screen }: { screen: 'globe' | 'knowledge' }) {
  const items = [
    { href: '/candidate/onboarding', label: 'Mini Me', icon: Orbit, on: screen === 'globe' },
    { href: '/candidate/onboarding?view=knowledge', label: 'Knowledge', icon: Library, on: screen === 'knowledge' },
    { href: '/candidate/onboarding?mode=train', label: 'Training', icon: GraduationCap, on: false },
    { href: '/candidate/ai', label: 'Settings', icon: Settings, on: false },
  ];
  return (
    <aside className="sticky top-0 z-10 shrink-0 border-b border-white/[0.06] bg-black/90 px-4 py-3 backdrop-blur sm:px-6 lg:h-screen lg:w-[232px] lg:border-b-0 lg:border-r lg:px-5 lg:py-9">
      <div className="flex items-center justify-between gap-4 lg:h-full lg:flex-col lg:items-stretch lg:justify-start">
        <Link href="/candidate/home" className="font-display text-[22px] font-semibold tracking-[-0.04em] text-white no-underline lg:px-3 lg:text-[26px]">elsewhere</Link>
        <nav aria-label="Mini Me" className="flex gap-1 overflow-x-auto lg:mt-12 lg:flex-col">
          {items.map(({ href, label, icon: Icon, on }) => (
            <Link key={label} href={href} aria-current={on ? 'page' : undefined} className={cx('flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-[14px] no-underline transition-colors lg:py-2.5 lg:text-[15px]', on ? 'bg-white/[0.09] text-white' : cx(MUTED, 'hover:bg-white/[0.05] hover:text-white'))}>
              <Icon aria-hidden size={18} strokeWidth={1.6} /><span className="sr-only sm:not-sr-only">{label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/candidate/home" className={cx('mt-auto hidden items-center gap-2 px-3 text-[14px] no-underline hover:text-white lg:flex', FAINT)}><ArrowLeft aria-hidden size={16} /> Back to Elsewhere</Link>
      </div>
    </aside>
  );
}

function SummaryCard({ view, connected }: { view: View; connected: string | null }) {
  return (
    <div className={cx(CARD, 'mt-4 grid grid-cols-2 gap-3 p-4 bg-black/60 backdrop-blur lg:absolute lg:bottom-6 lg:left-0 lg:mt-0 lg:w-[300px] lg:grid-cols-1 lg:gap-4 lg:p-5')}>
      <p className={cx('col-span-2 text-[12px] uppercase tracking-[0.14em] lg:col-span-1', MUTED)}>Your Knowledge Globe</p>
      <p><span className="tnum block font-display text-[26px] font-semibold leading-none lg:inline lg:text-[30px]">{view.total}</span> <span className={cx('text-[13px] lg:text-[14px]', MUTED)}>piece{view.total === 1 ? '' : 's'} of information</span></p>
      <p><span className="tnum block font-display text-[26px] font-semibold leading-none lg:inline lg:text-[30px]">{view.areas}</span> <span className={cx('text-[13px] lg:text-[14px]', MUTED)}>of {view.categories.length} key areas</span></p>
      <p className="col-span-2 text-[13px] leading-snug lg:col-span-1 lg:text-[14px]">
        {connected ? <><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white align-middle" />Learning from your {connected}</> : <Link href="/candidate/onboarding?mode=train&ai=1" className={cx('no-underline hover:text-white', MUTED)}>Not learning yet. Connect your AI</Link>}
        {view.lastUpdatedAt && <span className={cx('block', FAINT)}>Last updated {day(view.lastUpdatedAt)}</span>}
      </p>
    </div>
  );
}

function SidePanel({ panel, setPanel, view, byId, label, openItem, openCategory }: { panel: Panel; setPanel: (p: Panel) => void; view: View; byId: Map<string, Item>; label: Record<string, string>; openItem: (id: string | null) => void; openCategory: (k: string | null) => void }) {
  if (panel.kind === 'item') {
    const item = byId.get(panel.id);
    if (!item) return <div className={cx(CARD, 'p-5')}><p className={MUTED}>That item has been removed.</p><button type="button" className={cx(BTN_QUIET, 'mt-3')} onClick={() => openItem(null)}>Back</button></div>;
    return <ItemDetail key={item.id + item.updatedAt} item={item} label={label} categories={view.categories} onBack={() => openItem(null)} />;
  }
  if (panel.kind === 'add') return <ProposeAdd key={panel.topic} topic={panel.topic} category={panel.category} categories={view.categories} onDone={() => setPanel(panel.from)} />;
  if (panel.kind === 'category') {
    const c = view.categories.find((x) => x.key === panel.key)!;
    return (
      <div className={cx(CARD, 'p-5')}>
        <button type="button" onClick={() => openCategory(null)} className={cx('flex items-center gap-1.5 text-[13px] hover:text-white', MUTED)}><ArrowLeft aria-hidden size={14} /> What’s inside</button>
        <h2 className="mt-3 font-display text-[22px] font-semibold tracking-[-0.02em] text-white">{c.label}</h2>
        <p className={cx('text-[14px]', MUTED)}>{c.count} record{c.count === 1 ? '' : 's'}{c.unanswered.length ? ` · ${c.unanswered.length} question${c.unanswered.length === 1 ? '' : 's'} not answered yet` : ''}</p>
        <div className="mt-4"><ItemList items={view.items.filter((i) => i.category === c.key)} label={label} categories={view.categories} onOpen={openItem} /></div>
        {c.unanswered.length > 0 && <Link href="/candidate/onboarding?mode=type" className={cx('mt-4 block text-[13px] no-underline hover:text-white', MUTED)}>Not answered yet: {c.unanswered.slice(0, 4).join(', ')}{c.unanswered.length > 4 ? '…' : ''} →</Link>}
        <button type="button" className={cx(BTN_QUIET, 'mt-4')} onClick={() => setPanel({ kind: 'add', topic: '', category: c.key, from: panel })}><Plus aria-hidden size={15} /> Add to {c.label}</button>
      </div>
    );
  }
  return (
    <div className={cx(CARD, 'p-5')}>
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-white">What’s inside</h2>
      <ul className="mt-2 divide-y divide-white/[0.06]">
        {view.categories.map((c) => (
          <li key={c.key}>
            <button type="button" onClick={() => openCategory(c.key)} className="group flex w-full items-center justify-between gap-3 py-[7px] text-left">
              <span className={cx('text-[15px]', c.count ? 'text-white' : FAINT)}>{c.label}</span>
              <span className={cx('tnum text-[15px] group-hover:text-white', c.count ? MUTED : FAINT)}>{c.count}</span>
            </button>
          </li>
        ))}
      </ul>
      <InsideFooter view={view} openItem={openItem} />
    </div>
  );
}

function InsideFooter({ view, openItem }: { view: View; openItem: (id: string | null) => void }) {
  const gaps = view.missingAreas.filter((m) => m.empty);
  return (
    <div className={cx('mt-3 space-y-2 border-t border-white/[0.06] pt-3 text-[13px]', MUTED)}>
      <p><span className="tnum text-white">{view.total}</span> records in <span className="tnum text-white">{view.areas}</span> area{view.areas === 1 ? '' : 's'}{view.unconfirmed ? <> · <span className="tnum text-white">{view.unconfirmed}</span> not checked by you</> : null}</p>
      {gaps.length > 0 && <p>Nothing yet about: {gaps.map((g) => g.label).join(', ')}</p>}
      {view.items.length > 0 && (
        <p className="leading-relaxed">Latest: {view.items.slice(0, 3).map((i, n) => <span key={i.id}>{n ? ', ' : ''}<button type="button" onClick={() => openItem(i.id)} className="text-white/80 hover:text-white">{i.title}</button></span>)} <span className={FAINT}>· {day(view.items[0].updatedAt)}</span></p>
      )}
    </div>
  );
}

function InsideSummary({ view, openItem }: { view: View; openItem: (id: string | null) => void }) {
  return <div className={cx(CARD, 'p-5')}><h2 className="font-display text-[20px] font-semibold text-white">Summary</h2><InsideFooter view={view} openItem={openItem} /><p className={cx('mt-4 text-[13px]', FAINT)}>Pick a record to see where it came from, check it, change it or remove it.</p></div>;
}

function ItemList({ items, label, categories, onOpen, withFilter }: { items: Item[]; label: Record<string, string>; categories: View['categories']; onOpen: (id: string) => void; withFilter?: boolean }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const shown = items.filter((i) => (!cat || i.category === cat) && (!q.trim() || `${i.title} ${i.text}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search records</span>
        <Search aria-hidden size={16} className={cx('absolute left-3.5 top-1/2 -translate-y-1/2', FAINT)} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={cx(FIELD, 'py-2.5 pl-10')} />
      </label>
      {withFilter && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[{ key: null as string | null, label: 'All', count: items.length }, ...categories.filter((c) => c.count)].map((c) => (
            <button key={c.key ?? 'all'} type="button" aria-pressed={cat === c.key} onClick={() => setCat(c.key)} className={cx('rounded-full px-3 py-1 text-[13px]', cat === c.key ? 'bg-white text-black' : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.1]')}>{c.label} <span className="tnum opacity-60">{c.count}</span></button>
          ))}
        </div>
      )}
      {shown.length === 0 ? <p className={cx('mt-4 text-[14px]', MUTED)}>{items.length ? 'No records match.' : 'Nothing here yet.'}</p> : (
        <ul className={cx('mt-3 divide-y divide-white/[0.06]', !withFilter && 'max-h-[44vh] overflow-y-auto pr-1')}>
          {shown.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => onOpen(i.id)} className="block w-full py-3 text-left">
                <span className="flex items-baseline justify-between gap-3"><span className="truncate text-[15px] text-white">{i.title}</span>{!i.confirmed && <span className={cx('shrink-0 text-[11px] uppercase tracking-[0.1em]', FAINT)}>Unchecked</span>}</span>
                <span className={cx('mt-0.5 line-clamp-2 text-[13px] leading-snug', MUTED)}>{withFilter ? `${label[i.category]} · ` : ''}{i.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemDetail({ item, label, categories, onBack }: { item: Item; label: Record<string, string>; categories: View['categories']; onBack: () => void }) {
  const { run, busy, error } = useCommand();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div className={cx(CARD, 'p-5')}>
      <button type="button" onClick={onBack} className={cx('flex items-center gap-1.5 text-[13px] hover:text-white', MUTED)}><ArrowLeft aria-hidden size={14} /> Back</button>
      <p className={cx('mt-4 text-[11px] uppercase tracking-[0.14em]', MUTED)}>{label[item.category]}</p>
      <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-white">{item.title}</h2>
      {item.question && <p className={cx('mt-1 text-[13px]', FAINT)}>Answers: {item.question}</p>}
      {editing ? <ProposeEdit item={item} onDone={() => setEditing(false)} /> : <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">{item.text}</p>}
      <dl className={cx('mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-white/[0.06] pt-4 text-[13px]', MUTED)}>
        <dt>Source</dt><dd className="text-white/85">{sourceOf(item)}</dd>
        <dt>Status</dt><dd className="text-white/85">{item.confirmed ? 'Confirmed' : 'Inferred by your AI, not checked by you'}</dd>
        <dt>Updated</dt><dd className="text-white/85">{day(item.updatedAt)}</dd>
        <dt>Area</dt>
        <dd>
          <label className="sr-only" htmlFor={`area-${item.id}`}>Area</label>
          <select id={`area-${item.id}`} disabled={busy} value={item.categoryChosen ? item.category : ''} onChange={(e) => void run('knowledge/category', { id: item.id, category: e.target.value || null })} className="rounded-lg border border-white/10 bg-black px-2 py-1 text-[13px] text-white">
            <option value="">Automatic ({label[item.category]})</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </dd>
      </dl>
      <Err error={error} />
      {!editing && (deleting ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[14px] text-white">Delete for good?</span>
          <button type="button" disabled={busy} className={cx(BTN, 'bg-[#FF453A] text-white')} onClick={async () => { if (await run('knowledge/delete', { id: item.id })) onBack(); }}>Delete</button>
          <button type="button" className={BTN_QUIET} onClick={() => setDeleting(false)}>Cancel</button>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          {!item.confirmed && <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => void run('knowledge/confirm', { id: item.id })}><Check aria-hidden size={15} /> That’s right</button>}
          <button type="button" className={BTN_QUIET} onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className={cx(BTN_QUIET, 'text-[#FF8A80]')} onClick={() => setDeleting(true)}>Delete</button>
        </div>
      ))}
    </div>
  );
}

/** Change a record: write it, see before and after, then approve. Nothing is saved until "Save change". */
function ProposeEdit({ item, onDone }: { item: Item; onDone: () => void }) {
  const { run, busy, error } = useCommand();
  const [text, setText] = useState(item.text);
  const [review, setReview] = useState(false);
  const changed = text.trim() !== item.text.trim();
  if (review) return (
    <div className="mt-4 space-y-3">
      <p className={cx('text-[12px] uppercase tracking-[0.12em]', MUTED)}>Proposed change</p>
      <div className="rounded-2xl bg-white/[0.03] p-3"><p className={cx('text-[12px]', FAINT)}>Before</p><p className="mt-1 whitespace-pre-wrap text-[14px] text-white/50 line-through decoration-white/20">{item.text}</p></div>
      <div className="rounded-2xl bg-white/[0.06] p-3"><p className={cx('text-[12px]', MUTED)}>After</p><p className="mt-1 whitespace-pre-wrap text-[14px] text-white">{text.trim() || '(removed)'}</p></div>
      <Err error={error} />
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={async () => { if (await run('onboarding/answer', { key: item.id, answer: text.trim() })) onDone(); }}>Save change</button>
        <button type="button" className={BTN_QUIET} onClick={() => setReview(false)}>Back</button>
      </div>
    </div>
  );
  return (
    <div className="mt-4">
      <label htmlFor={`edit-${item.id}`} className="sr-only">Edit {item.title}</label>
      <textarea id={`edit-${item.id}`} value={text} maxLength={1500} rows={6} onChange={(e) => setText(e.target.value)} className={FIELD} />
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={!changed || !text.trim()} className={BTN_PRIMARY} onClick={() => setReview(true)}>Review change</button>
        <button type="button" className={BTN_QUIET} onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Add something new: shown as it will be saved, then approved. */
function ProposeAdd({ topic: t0, category: c0, categories, onDone }: { topic: string; category: string | null; categories: View['categories']; onDone: () => void }) {
  const { run, busy, error } = useCommand<{ id: string }>();
  const [topic, setTopic] = useState(t0.slice(0, 200));
  const [text, setText] = useState('');
  const [cat, setCat] = useState<string>(c0 ?? '');
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState(false);
  if (saved) return <div className={cx(CARD, 'p-5')}><p className="text-[15px] text-white">Added to your Mini Me.</p><p className={cx('mt-1 text-[13px]', MUTED)}>Ask again to see the difference.</p><button type="button" className={cx(BTN_QUIET, 'mt-3')} onClick={onDone}>Done</button></div>;
  return (
    <div className={cx(CARD, 'p-5')}>
      <button type="button" onClick={onDone} className={cx('flex items-center gap-1.5 text-[13px] hover:text-white', MUTED)}><ArrowLeft aria-hidden size={14} /> Back</button>
      <h2 className="mt-3 font-display text-[20px] font-semibold text-white">Add to your Mini Me</h2>
      {review ? (
        <div className="mt-3 space-y-3">
          <p className={cx('text-[12px] uppercase tracking-[0.12em]', MUTED)}>This will be added{cat ? ` to ${categories.find((c) => c.key === cat)?.label}` : ''}</p>
          <div className="rounded-2xl bg-white/[0.06] p-3"><p className="text-[14px] font-medium text-white">{topic}</p><p className="mt-1 whitespace-pre-wrap text-[14px] text-white/85">{text}</p></div>
          <Err error={error} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={async () => { if (await run('knowledge/add', { topic: topic.trim(), answer: text.trim(), category: cat || null })) setSaved(true); }}>Add to Mini Me</button>
            <button type="button" className={BTN_QUIET} onClick={() => setReview(false)}>Back</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block"><span className={cx('text-[13px]', MUTED)}>Heading</span><input value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} className={cx(FIELD, 'mt-1')} placeholder="For example: Why I moved into finance" /></label>
          <label className="block"><span className={cx('text-[13px]', MUTED)}>In your own words</span><textarea value={text} maxLength={1500} rows={5} onChange={(e) => setText(e.target.value)} className={cx(FIELD, 'mt-1')} /></label>
          <label className="block"><span className={cx('text-[13px]', MUTED)}>Area</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={cx(FIELD, 'mt-1 py-2.5')}><option value="">Work it out from the wording</option>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          </label>
          <button type="button" disabled={topic.trim().length < 2 || !text.trim()} className={cx(BTN_PRIMARY, 'mt-1')} onClick={() => setReview(true)}>Review</button>
        </div>
      )}
    </div>
  );
}

function AskPanel({ interviewQuestions, starters, byId, label, onAnswer, openItem, onAdd }: { interviewQuestions: string[]; starters: string[]; byId: Map<string, Item>; label: Record<string, string>; onAnswer: (ids: string[]) => void; openItem: (id: string) => void; onAdd: (topic: string) => void }) {
  const [tab, setTab] = useState<'ask' | 'interview'>('ask');
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [verdict, setVerdict] = useState<'good' | 'inaccurate' | 'incomplete' | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const { run, busy, error } = useCommand<Omit<Answer, 'question' | 'mode'>>();
  const review = useCommand();
  const answerRef = useRef<HTMLDivElement>(null);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ(text); setVerdict(null); setFixing(null);
    const r = await run('knowledge/ask', { question: text, mode: tab }, { refresh: false });
    if (!r) return;
    setAnswer({ ...r, question: text, mode: tab });
    onAnswer(r.usedIds);
    requestAnimationFrame(() => answerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const random = () => {
    const pool = interviewQuestions.filter((x) => x !== q);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) setQ(pick);
  };
  const rate = async (v: 'good' | 'inaccurate' | 'incomplete') => {
    if (!answer) return;
    setVerdict(v); setFixing(null);
    await review.run('knowledge/review', { verdict: v, usedIds: answer.usedIds }, { refresh: false });
  };
  const used = (answer?.usedIds ?? []).map((id) => byId.get(id)).filter((x): x is Item => !!x);

  return (
    <section aria-label="Ask Mini Me" className={cx(CARD, 'p-5')}>
      <div role="tablist" className="flex gap-1 rounded-full bg-white/[0.05] p-1">
        {(['ask', 'interview'] as const).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => { setTab(t); setAnswer(null); setVerdict(null); onAnswer([]); }} className={cx('flex-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] transition-colors', tab === t ? 'bg-white text-black' : cx(MUTED, 'hover:text-white'))}>{t === 'ask' ? 'Ask Mini Me' : 'Test It (Interview Mode)'}</button>
        ))}
      </div>
      <form className="relative mt-4" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <label htmlFor="ask-input" className="sr-only">{tab === 'ask' ? 'Ask your Mini Me' : 'Interview question'}</label>
        <input id="ask-input" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'ask' ? 'Ask me anything…' : 'Type an interview question…'} className={cx(FIELD, 'pr-12')} />
        <button type="submit" aria-label="Ask" disabled={busy || !q.trim()} className="press absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black disabled:opacity-30"><ArrowUp aria-hidden size={18} /></button>
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tab === 'ask'
          ? starters.map((s) => <button key={s} type="button" disabled={busy} onClick={() => void ask(s)} className="rounded-full border border-white/10 px-3 py-1 text-[13px] text-white/80 hover:border-white/25 hover:text-white">{s}</button>)
          : <button type="button" onClick={random} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[13px] text-white/80 hover:border-white/25 hover:text-white"><Shuffle aria-hidden size={13} /> Random interview question</button>}
      </div>
      <Err error={error} />
      {busy && <p className={cx('mt-4 text-[14px]', MUTED)} aria-live="polite">Thinking…</p>}
      {answer && !busy && (
        <div ref={answerRef} className="mt-5 scroll-mb-6 border-t border-white/[0.06] pt-4" aria-live="polite">
          <p className={cx('text-[12px]', FAINT)}>{answer.question}</p>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-white">{answer.answer}</p>
          {answer.basic && <p className={cx('mt-2 text-[12px]', FAINT)}>{answer.basic}</p>}
          {used.length > 0 ? (
            <details className="mt-3">
              <summary className={cx('cursor-pointer text-[13px] hover:text-white', MUTED)}>Based on {used.length} record{used.length === 1 ? '' : 's'}</summary>
              <ul className="mt-2 space-y-1">{used.map((i) => <li key={i.id}><button type="button" onClick={() => openItem(i.id)} className="text-left text-[13px] text-white/85 hover:text-white">{i.title} <span className={FAINT}>· {label[i.category]}{i.confirmed ? '' : ' · unchecked'}</span></button></li>)}</ul>
            </details>
          ) : (
            <button type="button" className={cx(BTN_QUIET, 'mt-3')} onClick={() => onAdd(answer.question)}><Plus aria-hidden size={15} /> Teach it this</button>
          )}

          {answer.mode === 'interview' && (
            <div className="mt-4">
              {!verdict ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={BTN_QUIET} onClick={() => void rate('good')}><Check aria-hidden size={15} /> Sounds like me</button>
                  <button type="button" className={BTN_QUIET} onClick={() => void rate('inaccurate')}><X aria-hidden size={15} /> Not accurate</button>
                  <button type="button" className={BTN_QUIET} onClick={() => void rate('incomplete')}><Plus aria-hidden size={15} /> Missing something</button>
                </div>
              ) : verdict === 'good' ? <p className={cx('text-[13px]', MUTED)}>Noted. Thanks.</p> : (
                <div className="space-y-3">
                  {verdict === 'inaccurate' && used.length > 0 && (
                    <div>
                      <p className={cx('text-[13px]', MUTED)}>Which record is wrong? Correct it, then approve the change.</p>
                      <ul className="mt-2 space-y-2">
                        {used.map((i) => (
                          <li key={i.id} className="rounded-2xl bg-white/[0.03] p-3">
                            <div className="flex items-center justify-between gap-2"><span className="truncate text-[14px] text-white">{i.title}</span>{fixing !== i.id && <button type="button" className="text-[13px] text-white/80 hover:text-white" onClick={() => setFixing(i.id)}>Correct this</button>}</div>
                            {fixing === i.id ? <ProposeEdit item={i} onDone={() => setFixing(null)} /> : <p className={cx('mt-1 line-clamp-2 text-[13px]', MUTED)}>{i.text}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button type="button" className={BTN_QUIET} onClick={() => onAdd(answer.question)}><Plus aria-hidden size={15} /> Add what’s missing</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
