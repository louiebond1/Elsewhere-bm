/** Display formatting shared by server and client components. Amounts arrive as strings of integers. */
export function credits(units: string | number | bigint): string {
  const u = BigInt(units);
  const neg = u < 0n;
  const a = neg ? -u : u;
  const whole = a / 10000n;
  const frac = (a % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}
export function gbp(pence: string | number | bigint): string {
  const p = BigInt(pence);
  const neg = p < 0n;
  const a = neg ? -p : p;
  const pounds = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rem = a % 100n;
  return `${neg ? '-' : ''}£${pounds}${rem ? '.' + rem.toString().padStart(2, '0') : ''}`;
}
export const creditsLabel = (units: string | number | bigint) => {
  const c = credits(units);
  return `${c} ${c === '1' ? 'credit' : 'credits'}`;
};
export function date(d: string | Date | null | undefined): string {
  if (!d) return '';
  const x = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00Z' : d) : d;
  return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
}
export function relative(d: string | Date, now = new Date()): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const mins = Math.round((now.getTime() - x.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return date(x);
}
export const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const REGION: Record<string, string> = { london: 'London', hertfordshire: 'Hertfordshire', manchester: 'Manchester', remote_uk: 'Remote, UK' };

/** Plain names for credit history entries. */
export const TX_LABEL: Record<string, string> = {
  grant: 'Credits added', simulated_purchase: 'Credits bought (demo)', deposit_debit: 'Deposit paid', hire_balance_debit: 'Hire paid',
  second_hire_debit: 'Another hire paid', outside_hire_debit: 'Outside hire paid', reversal: 'Correction',
};
export const txLabel = (t: string) => TX_LABEL[t] ?? label(t);
