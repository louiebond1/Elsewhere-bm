'use client';
import { ClampText } from './clamp-text';
import { ActionButton } from './client';

type Criterion = { id: string; label: string; description: string; importance: string; weight: number };
export function RubricReview({ roleId, rowVersion, approved, criteria }: { roleId: string; rowVersion: number; approved: boolean; criteria: Criterion[] }) {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  return <section className="my-5 rounded-3xl border border-line bg-surface p-5" aria-label="Job checklist">
    <h2 className="text-[22px] font-semibold">Your job checklist</h2>
    <p className="mt-2 text-[14px] text-muted">Check what matters before we assess people. Edit the brief to change a requirement or its importance.</p>
    <ul className="mt-4 divide-y divide-line">{criteria.map((c) => <li key={c.id} className="py-3">
      <div className="flex justify-between gap-3"><span className="font-medium">{c.label}</span><span>{total ? Math.round(c.weight / total * 100) : 0}%</span></div>
      <p className="text-[13px] text-muted">{c.importance === 'essential' ? 'Essential' : 'Desirable'}</p>
      <ClampText text={c.description} lines={3} className="mt-1 text-[14px]" />
    </li>)}</ul>
    <details className="my-3 text-[14px]"><summary className="cursor-pointer">How we award points</summary><p className="mt-2">Related experience: 25. Some evidence: 50. Clear evidence: 75. Strong evidence meeting this requirement fully: 100. Points are weighted by importance. Missing information earns no points yet and is shown separately. An explicit unmet essential is flagged for review. Fuller profiles can earn more points.</p></details>
    {approved ? <p className="text-[14px] text-primary">Checklist approved.</p> : <ActionButton path={`roles/${roleId}/approve-rubric`} body={{ expectedRowVersion: rowVersion }} label="These requirements are right" disabledReason={criteria.length < 3 ? 'Add at least 3 requirements first.' : undefined} />}
  </section>;
}
