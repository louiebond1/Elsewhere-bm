import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-3xl bg-surface p-5 shadow-[0_8px_24px_rgb(18_37_29/0.06)] md:p-6', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          {title && <h3>{title}</h3>}
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
    'press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[17px] font-semibold tracking-[-0.01em] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
    variant === 'primary' && 'min-h-14 bg-primary text-white hover:bg-primary-hover active:bg-primary-pressed',
    variant === 'secondary' && 'border border-control bg-transparent text-ink hover:bg-surface',
    variant === 'danger' && 'bg-danger text-white hover:opacity-90',
    variant === 'ghost' && 'text-link hover:bg-page',
    full && 'w-full',
  );

export function LinkButton({ href, children, variant = 'primary', className }: { href: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; className?: string }) {
  return <Link href={href} className={cx(buttonClass(variant), 'no-underline', className)}>{children}</Link>;
}

/**
 * The page header. With a title it is a photo banner (the brand look on every screen): big white
 * title, short subtitle, and the page's buttons on the right. Without a title, just the back link.
 */
export function PageHeader({ title, subtitle, actions, back, plain }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; plain?: boolean }) {
  const backLink = back && <Link href={back.href} className="mb-4 inline-flex items-center gap-2 text-[16px] text-ink no-underline"><span aria-hidden className="text-[20px] leading-none">&larr;</span> {back.label}</Link>;
  if (!title) return <div className="mb-6">{backLink}</div>;
  if (plain) return (
    <div className="mb-6">
      {backLink}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h1>{title}</h1>{subtitle && <div className="mt-2 text-[16px] text-muted">{subtitle}</div>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
  return (
    <div className="mb-8">
      {backLink}
      <header className="relative overflow-hidden rounded-[32px] bg-[#1E3A2A] shadow-[0_16px_40px_-20px_rgb(18_37_29/0.5)]">
        <Image src="/images/mini-me-hills.webp" alt="" fill sizes="(max-width: 1320px) 100vw, 1320px" className="object-cover object-right" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgb(10_30_20/0.82)_0%,rgb(10_30_20/0.6)_50%,rgb(10_30_20/0.25)_100%)]" />
        <div className="relative flex min-h-[176px] flex-col justify-end gap-5 p-7 text-white lg:min-h-[208px] lg:flex-row lg:items-end lg:justify-between lg:p-10">
          <div className="min-w-0">
            <h1 className="text-white">{title}</h1>
            {subtitle && <div className="mt-2 max-w-[60ch] text-[16px] text-white/85 lg:text-[17px] [&_a]:text-white [&_a]:underline">{subtitle}</div>}
          </div>
          {actions && <div className="shelf -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [&_.press]:shrink-0 [&_.press]:whitespace-nowrap [&_.press]:border-transparent [&_.press]:bg-white [&_.press]:text-ink [&_.press:hover]:bg-white/90 lg:flex-wrap lg:justify-end">{actions}</div>}
        </div>
      </header>
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-[15px] text-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="text-[14px] text-muted">{label}</div>
      <div className="mt-1 font-display text-[28px] font-extrabold tracking-tight">{value}</div>
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
        <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined} className={cx('whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px] no-underline', t.key === current ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink')}>
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
