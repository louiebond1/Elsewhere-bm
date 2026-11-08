'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommand, ErrorText, Field } from './client';
import { buttonClass } from './ui';
import { credits, gbp } from '@/lib/format';

const SCALE = 10000n;

/** Demo banner shown on every checkout screen. */
export function DemoOnlyBanner() {
  return (
    <div role="note" className="mb-4 rounded-lg border-2 border-warning bg-warning-tint p-3 text-[15px] font-semibold">
      Demo only: no money charged. This is a simulated checkout. There is no payment provider, no card is taken and nothing is billed.
    </div>
  );
}

/** Chooses a whole number of credits and opens a checkout. Opening changes nothing in the ledger. */
export function BuyCreditsForm({ ratePence, postedUnits, heldUnits, spendableUnits, max, initialCredits }: { ratePence: number; postedUnits: string; heldUnits: string; spendableUnits: string; max: number; initialCredits: number }) {
  const router = useRouter();
  const { run, busy, error } = useCommand<{ id: string }>();
  const [qty, setQty] = useState(String(initialCredits));
  const n = Number(qty);
  const valid = Number.isInteger(n) && n >= 1 && n <= max;
  const units = valid ? BigInt(n) * SCALE : 0n;
  const total = valid ? BigInt(n) * BigInt(ratePence) : 0n;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const d = await run('credits/checkout', { credits: n }, { refresh: false });
    if (d?.id) router.push(`/client/credits/checkout/${d.id}`);
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Credits to buy" hint={`Whole credits, 1 to ${max}.`} error={qty !== '' && !valid ? `Enter a whole number from 1 to ${max}.` : null}>
        <input id="checkout-credits" name="credits" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.trim())} className="h-11 w-32 rounded-lg border border-line bg-surface px-3" aria-describedby="checkout-summary" />
      </Field>
      <dl id="checkout-summary" className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[15px]">
        <dt>Price per credit (your contract rate)</dt><dd className="text-right">{gbp(ratePence)}</dd>
        <dt>Total shown</dt><dd className="text-right font-semibold">{valid ? gbp(total) : '—'}</dd>
        <dt>Balance now</dt><dd className="text-right">{credits(postedUnits)}</dd>
        <dt>Reserved for pending introductions</dt><dd className="text-right">{credits(heldUnits)}</dd>
        <dt>Spendable now</dt><dd className="text-right">{credits(spendableUnits)}</dd>
        <dt>Spendable after a simulated success</dt><dd className="text-right">{valid ? credits(BigInt(spendableUnits) + units) : '—'}</dd>
      </dl>
      <p className="text-[13px] text-muted">VAT treatment to be agreed. Continuing opens a checkout; nothing is added or charged until you choose an outcome on the next screen.</p>
      <ErrorText error={error} />
      <button type="submit" className={buttonClass('primary')} disabled={busy || !valid}>{busy ? 'Opening…' : 'Continue to demo checkout'}</button>
    </form>
  );
}

/** Three explicit demo outcomes. Each is one server command with its own retry-safe key. */
export function CheckoutOutcomes({ id }: { id: string }) {
  const router = useRouter();
  const ok = useCommand();
  const no = useCommand();
  const cancel = useCommand();
  const busy = ok.busy || no.busy || cancel.busy;
  const go = async (c: ReturnType<typeof useCommand>, action: 'succeed' | 'decline' | 'cancel') => {
    const d = await c.run(`credits/checkout/${id}/${action}`, {}, { refresh: false });
    if (d) router.refresh();
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass('primary')} disabled={busy} onClick={() => go(ok, 'succeed')}>{ok.busy ? 'Simulating…' : 'Simulate success'}</button>
        <button type="button" className={buttonClass('secondary')} disabled={busy} onClick={() => go(no, 'decline')}>{no.busy ? 'Simulating…' : 'Simulate decline'}</button>
        <button type="button" className={buttonClass('ghost')} disabled={busy} onClick={() => go(cancel, 'cancel')}>Cancel</button>
      </div>
      <ErrorText error={ok.error ?? no.error ?? cancel.error} />
    </div>
  );
}
