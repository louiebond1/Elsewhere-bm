import Link from 'next/link';
import { ArrowRight, HandHelping } from 'lucide-react';
import { pageViewer } from '@/server/page-auth';
import { rolesForClient, bestPeople } from '@/server/views/client';
import { buttonClass, cx } from '@/components/ui';
import { FoldArt } from '@/components/fold-art';
import { codename, paletteFor, variantFor } from '@/lib/codename';
import { fitLabel } from '@/components/role';

/** Home for a hiring manager: who are you hiring next, your hires, and the people worth a look. */
export default async function ClientHome() {
  const { viewer, ctx } = await pageViewer('client');
  const id = viewer.actor.clientId!;
  const roles = await rolesForClient(ctx, id);
  const first = (viewer.displayName ?? '').split(' ')[0] || 'there';
  const current = roles.filter((r) => r.status !== 'closed');

  // For each live job: how many best people are ready, and its top people.
  const live = await Promise.all(current.filter((r) => r.status === 'open').map(async (r) => ({ role: r, people: (await bestPeople(ctx, r.id, 10)).best })));
  const readyFor = new Map(live.map((l) => [l.role.id, l.people.length]));
  const picks: { roleId: string; roleTitle: string; ref: string; name: string; line: string; fit: string }[] = [];
  for (let i = 0; picks.length < 3 && i < 3; i++) for (const l of live) {
    const p = l.people[i];
    if (p && picks.length < 3) picks.push({ roleId: l.role.id, roleTitle: l.role.title, ref: p.dto.roleScopedReference, name: p.dto.identity ? p.dto.identity.fullName : codename(p.dto.roleScopedReference), line: p.dto.safeHeadline, fit: fitLabel(p.sim.fitScore).text });
  }

  return (
    <div className="relative">
      <FoldArt id="hero" palette="sand" variant={1} bare className="pointer-events-none absolute -right-10 -top-28 hidden h-[520px] w-[820px] [mask-image:radial-gradient(ellipse_75%_85%_at_85%_25%,black_45%,transparent_100%)] lg:block" />
      <section className="relative max-w-[640px] pt-4 lg:pt-10">
        <h1 className="text-[48px] leading-[1.02] lg:text-[76px]">Hi {first}</h1>
        <p className="mt-2 text-[20px] text-muted lg:text-[26px]">Who are you hiring next?</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/client/roles/new" className={cx(buttonClass('primary'), 'min-h-14 rounded-full! px-9 text-[18px] no-underline')}>Start a new hire</Link>
          <Link href="/client/roles/new?ai=1" className={cx(buttonClass('secondary'), 'min-h-14 gap-3 rounded-full! border-primary px-8 text-[18px] text-primary no-underline')}><HandHelping aria-hidden size={24} strokeWidth={1.7} /> Let my AI do this</Link>
        </div>
      </section>

      <section aria-labelledby="your-hiring" className="relative mt-12 lg:mt-16">
        <h2 id="your-hiring" className="text-[30px] lg:text-[36px]">Your hiring</h2>
        {current.length === 0 ? <p className="mt-4 rounded-[28px] border border-dashed border-line bg-surface/70 px-6 py-10 text-center text-[17px] text-muted">Nothing yet. Press “Start a new hire” to begin.</p> : (
          <ul className="mt-5 grid gap-5 md:grid-cols-2">
            {current.map((r, i) => {
              const ready = readyFor.get(r.id) ?? 0;
              const line = r.status === 'draft' ? 'Continue brief' : ready ? `${ready} ${ready === 1 ? 'person' : 'people'} ready` : r.next;
              return (
                <li key={r.id}>
                  <Link href={`/client/roles/${r.id}`} className="group relative flex min-h-[200px] overflow-hidden rounded-[28px] bg-surface no-underline shadow-[0_18px_44px_-26px_rgba(30,40,30,.45)] transition-transform duration-300 hover:-translate-y-1">
                    <FoldArt id={`role-${r.id}`} palette={i % 2 ? 'clay' : 'forest'} variant={i % 3} className="absolute inset-y-0 right-0 h-full w-[48%] [mask-image:linear-gradient(to_left,black_70%,transparent)] sm:w-[62%]" />
                    <span className="relative z-10 flex max-w-[72%] flex-col justify-between p-7 sm:max-w-[60%]">
                      <span className="font-display text-[30px] font-extrabold leading-[1.05] tracking-tight text-ink lg:text-[34px]">{r.title}</span>
                      <span className="mt-6 inline-flex items-center gap-2 text-[17px] text-ink/80">{line} <ArrowRight aria-hidden size={20} className="transition-transform group-hover:translate-x-1" /></span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {picks.length > 0 && (
        <section aria-labelledby="closer-look" className="relative mt-12">
          <h2 id="closer-look" className="text-[30px] lg:text-[36px]">People worth a closer look</h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {picks.map((p) => (
              <li key={p.roleId + p.ref}>
                <Link href={`/client/roles/${p.roleId}/candidates/${p.ref}`} className="group flex items-center gap-4 rounded-[24px] bg-surface p-3 no-underline shadow-[0_12px_32px_-24px_rgba(30,40,30,.5)] transition-transform duration-300 hover:-translate-y-1">
                  <FoldArt id={`p-${p.ref}`} palette={paletteFor(p.ref)} variant={variantFor(p.ref)} className="h-[104px] w-[104px] shrink-0 rounded-[18px]" />
                  <span className="min-w-0">
                    <span className="block font-display text-[22px] font-extrabold tracking-tight text-ink">{p.name}</span>
                    <span className="mt-1 line-clamp-2 block text-[15px] text-muted">{p.line}</span>
                    <span className="mt-1.5 block text-[13px] font-semibold text-primary">{p.fit} · {p.roleTitle}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <nav aria-label="More" className="relative mt-12 flex flex-wrap gap-2 text-[15px]">
        {[['/client/hires', 'People you’ve hired'], ['/client/support', 'Ask for help'], ['/client/onboarding', 'Hiring training']].map(([href, label]) => <Link key={href} href={href} className="rounded-full border border-line bg-surface px-4 py-2 text-ink no-underline hover:bg-page">{label}</Link>)}
      </nav>
    </div>
  );
}
