'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, Menu, X, Repeat, Home, User, Users, Star, Search, ClipboardList, Briefcase, CreditCard, GraduationCap, LifeBuoy, FileText, Shield, MessageSquare, Inbox } from 'lucide-react';

const ICONS: Record<string, typeof Home> = { home: Home, clients: User, candidates: User, hires: Star, ops: Search, demo: ClipboardList, roles: Briefcase, credits: CreditCard, training: GraduationCap, support: LifeBuoy, profile: User, intros: Inbox, checkins: MessageSquare, cv: FileText, privacy: Shield, users: Users };
import { api, useCsrf, Dialog } from './client';
import { relative } from '../lib/format';
import { cx } from './ui';

type N = { id: string; title: string; ref: string; refId: string; readAt: string | null; createdAt: string };

export function NotificationBell({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const csrf = useCsrf();
  const router = useRouter();
  const load = async () => { const r = await api<N[]>('notifications'); if (r.ok) setItems(r.data); };
  useEffect(() => {
    let alive = true;
    api<N[]>('notifications').then((r) => { if (alive && r.ok) setItems(r.data); });
    return () => { alive = false; };
  }, []);
  const unread = items.filter((i) => !i.readAt).length;
  const hrefFor = (n: N) => {
    if (n.ref === 'role') return `${base}/roles/${n.refId}`;
    if (n.ref === 'introduction') return base === '/candidate' ? '/candidate/introductions' : `${base}/introductions/${n.refId}/prep`;
    if (n.ref === 'screening') return base === '/consultant' ? `/consultant/screenings/${n.refId}` : `${base}/home`;
    if (n.ref === 'hire') return `${base}/hires`;
    if (n.ref === 'replacement') return base === '/consultant' ? `/consultant/replacements/${n.refId}` : `${base}/hires`;
    if (n.ref === 'candidate') return base === '/consultant' ? `/consultant/candidates/${n.refId}` : '/candidate/profile';
    if (n.ref === 'client') return base === '/consultant' ? `/consultant/clients/${n.refId}` : `${base}/home`;
    return `${base}/home`;
  };
  return (
    <>
      <button type="button" className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-page" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => { setOpen(true); load(); }}>
        <Bell size={20} aria-hidden />
        {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger" />}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Notifications">
        {items.length === 0 ? <p className="text-muted">No notifications yet.</p> : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className="py-2">
                <button type="button" className="w-full text-left" onClick={async () => { await api(`notifications/${n.id}/read`, { body: {}, csrf }); setOpen(false); router.push(hrefFor(n)); }}>
                  <span className={cx('block text-[15px]', !n.readAt && 'font-semibold')}>{n.title}</span>
                  <span className="text-[13px] text-muted">{relative(n.createdAt)}{!n.readAt ? ' · Unread' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-11 rounded-lg px-3 text-link" onClick={async () => { await api('notifications/read-all', { body: {}, csrf }); load(); }}>Mark all read</button>
          <button type="button" className="h-11 rounded-lg border border-line px-4" onClick={() => setOpen(false)}>Close</button>
        </div>
      </Dialog>
    </>
  );
}

/** Sign-out and persona switching clear all client-side state by doing a full navigation. */
export function SignOut() {
  const csrf = useCsrf();
  return (
    <button type="button" className="inline-flex h-11 items-center rounded-lg px-3 text-[15px] hover:bg-page" onClick={async () => { await api('auth/logout', { body: {}, csrf }); try { sessionStorage.clear(); } catch {} window.location.replace('/login'); }}>
      Sign out
    </button>
  );
}

export function SwitchPersona() {
  return (
    <a href="/demo/personas" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white underline-offset-2 hover:underline">
      <Repeat size={14} aria-hidden /> Switch demo account
    </a>
  );
}

export type NavItem = { href: string; label: string; icon: string };

export function NavLinks({ items, onNavigate, dark }: { items: NavItem[]; onNavigate?: () => void; dark?: boolean }) {
  const path = usePathname();
  return (
    <ul className={dark ? '' : 'space-y-1'}>
      {items.map((i) => {
        const active = path === i.href || path.startsWith(i.href + '/');
        const Icon = ICONS[i.icon] ?? Home;
        return (
          <li key={i.href}>
            <Link href={i.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
              className={dark
                ? cx('flex h-[60px] items-center gap-3 border-l-[3px] px-5 text-[16px] no-underline', active ? 'border-accent bg-sidebar-hover text-white' : 'border-transparent text-white/85 hover:bg-sidebar-hover hover:text-white')
                : cx('flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] no-underline', active ? 'bg-info-tint font-semibold text-ink' : 'text-ink hover:bg-page')}>
              <Icon size={20} strokeWidth={1.6} aria-hidden />{i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const main = items.slice(0, 3);
  const rest = items.slice(3);
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface md:hidden">
        {main.map((i) => {
          const active = path === i.href || path.startsWith(i.href + '/');
          return <Link key={i.href} href={i.href} className={cx('flex h-14 items-center justify-center px-1 text-center text-[13px] no-underline', active ? 'font-semibold text-primary' : 'text-muted')}>{i.label}</Link>;
        })}
        <button type="button" className="flex h-14 items-center justify-center gap-1 text-[13px] text-muted" onClick={() => setMore(true)} aria-label="More pages"><Menu size={16} aria-hidden /> More</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><span className="font-semibold">More</span><button type="button" aria-label="Close" className="h-11 w-11" onClick={() => setMore(false)}><X size={18} aria-hidden /></button></div>
            <NavLinks items={rest} onNavigate={() => setMore(false)} />
          </div>
        </div>
      )}
    </>
  );
}
