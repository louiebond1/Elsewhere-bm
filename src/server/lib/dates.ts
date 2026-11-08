/** Calendar-date helpers. Business dates are ISO yyyy-mm-dd in Europe/London. */
const TZ = 'Europe/London';

export function londonDateOf(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Whole calendar days from a to b (b - a). Dates are calendar dates, so DST is irrelevant. */
export function daysBetween(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86400000);
}

export function addDays(date: string, days: number): string {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Add calendar months, clamping to month end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const y = +date.slice(0, 4);
  const m = +date.slice(5, 7) - 1 + months;
  const d = +date.slice(8, 10);
  const ty = y + Math.floor(m / 12);
  const tm = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Replacement window: departure within N calendar days of start, inclusive. */
export function withinReplacementWindow(startDate: string, leftDate: string, windowDays: number): boolean {
  const d = daysBetween(startDate, leftDate);
  return d >= 0 && d <= windowDays;
}

/** Outside-hire window: offer date within N calendar months of the accepted date, inclusive. */
export function withinOutsideHireWindow(acceptedDate: string, offerDate: string, months: number): boolean {
  if (offerDate < acceptedDate) return false;
  return offerDate <= addMonths(acceptedDate, months);
}

/** Default contract term for the consultant form: starts on the business date and runs one year (inclusive). */
export function defaultContractTerm(businessDate: string): { startDate: string; endDate: string } {
  return { startDate: businessDate, endDate: addDays(addMonths(businessDate, 12), -1) };
}
