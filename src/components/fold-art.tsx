import type { Palette } from '@/lib/codename';

const COLOURS: Record<Palette, { bg: [string, string]; a: [string, string, string]; b: [string, string, string]; light: string }> = {
  forest: { bg: ['#F7F4EC', '#EFEADF'], a: ['#E9E4D3', '#CFC7AE', '#B9B095'], b: ['#3E7D5C', '#215C40', '#123B28'], light: '#F3EFE4' },
  clay: { bg: ['#FBF7F1', '#F4ECE2'], a: ['#F3DEC9', '#E9B48E', '#D98C5F'], b: ['#EFA77A', '#DD7442', '#B9512A'], light: '#F7E6D8' },
  olive: { bg: ['#F7F6EE', '#ECEBDD'], a: ['#DCE0BF', '#B9C08A', '#97A266'], b: ['#A9B47E', '#86955A', '#64733F'], light: '#EEF0DC' },
  sand: { bg: ['#FBF8F2', '#F3EEE4'], a: ['#C9D0A6', '#A7B377', '#7F8F55'], b: ['#F2C3A6', '#E3875C', '#C9673E'], light: '#F6E3D5' },
};

/** Soft folded-paper artwork. Pure SVG and decorative; each id prefix must be unique on the page. */
export function FoldArt({ className, palette = 'sand', variant = 0, id = 'fa', bare = false }: { className?: string; palette?: Palette; variant?: number; id?: string; bare?: boolean }) {
  const c = COLOURS[palette];
  const shapes = [
    <g key="0"><path d="M70 190 C150 120 200 40 250 30 C290 22 300 70 280 110 C250 150 190 175 70 190 Z" fill={`url(#${id}-a)`} /><path d="M230 200 C300 150 340 60 400 10 L400 200 Z" fill={`url(#${id}-b)`} /><path d="M200 190 C280 165 340 150 400 165 L400 200 L190 200 Z" fill={c.light} opacity=".75" /></g>,
    <g key="1"><path d="M0 200 C80 150 140 60 230 40 C300 25 360 60 400 40 L400 200 Z" fill={`url(#${id}-a)`} /><path d="M150 200 C230 130 300 120 400 90 L400 200 Z" fill={`url(#${id}-b)`} /><path d="M120 200 C210 175 300 165 400 175 L400 200 Z" fill={c.light} opacity=".6" /></g>,
    <g key="2"><path d="M190 0 C230 80 300 120 400 120 L400 0 Z" fill={`url(#${id}-b)`} /><path d="M0 120 C90 90 170 120 240 200 L0 200 Z" fill={`url(#${id}-a)`} /><path d="M120 200 C200 130 300 150 400 110 L400 200 Z" fill={`url(#${id}-b)`} opacity=".85" /></g>,
  ];
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c.bg[0]} /><stop offset="1" stopColor={c.bg[1]} /></linearGradient>
        <linearGradient id={`${id}-a`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={c.a[0]} /><stop offset=".55" stopColor={c.a[1]} /><stop offset="1" stopColor={c.a[2]} /></linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor={c.b[0]} /><stop offset=".5" stopColor={c.b[1]} /><stop offset="1" stopColor={c.b[2]} /></linearGradient>
      </defs>
      {!bare && <rect width="400" height="200" fill={`url(#${id}-bg)`} />}
      {shapes[variant % shapes.length]}
    </svg>
  );
}
