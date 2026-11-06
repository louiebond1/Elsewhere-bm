import Link from 'next/link';
import type { ReactNode } from 'react';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface p-4 md:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          {title && <h3 className="text-[18px] font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  neutral: 'bg-info-tint text-ink',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  primary: 'bg-primary text-white',
} as const;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium', tones[tone])}>{children}</span>;
}

export const buttonClass = (variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'primary', full = false) =>
  cx(
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55',
    variant === 'primary' && 'bg-primary text-white hover:bg-primary-hover',
    variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-page',
    variant === 'danger' && 'bg-danger text-white hover:opacity-90',
    variant === 'ghost' && 'text-link hover:bg-page',
    full && 'w-full',
  );

export function LinkButton({ href, children, variant = 'primary', className }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; className?: string }) {
  return <Link href={href} className={cx(buttonClass(variant), 'no-underline', className)}>{children}</Link>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <Link href={back.href} className="mb-2 inline-block text-[14px] no-underline">&larr; {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1>{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-[15px] text-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-[14px] text-muted">{label}</div>
      <div className="mt-1 text-[24px] font-semibold">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
    </div>
  );
}

export function KV({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="divide-y divide-line text-[15px]">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, current }: { tabs: Array<{ key: string; label: string; href: string; count?: number }>; current: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined} className={cx('whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px] no-underline', t.key === current ? 'border-primary font-semibold text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined ? <span className="ml-1.5 text-[13px] text-muted">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-lg px-4 py-3 text-[15px]', tones[tone])}>{children}</div>;
}

/** Responsive table: a table at 768px and above, labelled cards below. */
export function ResponsiveTable<T>({ rows, columns, empty, rowKey }: { rows: T[]; columns: Array<{ label: string; cell: (r: T) => ReactNode; align?: 'right' }>; empty?: ReactNode; rowKey: (r: T) => string }) {
  if (!rows.length) return <Empty>{empty ?? 'Nothing here yet.'}</Empty>;
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
        <table className="w-full text-[15px]">
          <thead className="bg-page text-left text-[13px] text-muted">
            <tr>{columns.map((c) => <th key={c.label} className={cx('px-4 py-2.5 font-medium', c.align === 'right' && 'text-right')}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => <tr key={rowKey(r)}>{columns.map((c) => <td key={c.label} className={cx('px-4 py-3 align-top', c.align === 'right' && 'text-right')}>{c.cell(r)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div key={rowKey(r)} className="rounded-xl border border-line bg-surface p-4">
            {columns.map((c) => (
              <div key={c.label} className="flex justify-between gap-3 py-1 text-[15px]">
                <span className="text-muted">{c.label}</span>
                <span className="text-right">{c.cell(r)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function Avatar({ label }: { label: string | null }) {
  const initials = label ? label.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() : null;
  return <span aria-hidden className={cx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold', initials ? 'bg-primary text-white' : 'bg-line text-muted')}>{initials ?? ''}</span>;
}
