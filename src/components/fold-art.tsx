/** Soft folded-paper artwork for hero cards. Pure SVG, decorative only. */
export function FoldArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <defs>
        <linearGradient id="fa-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FBF8F2" /><stop offset="1" stopColor="#F3EEE4" /></linearGradient>
        <linearGradient id="fa-olive" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#C9D0A6" /><stop offset=".55" stopColor="#A7B377" /><stop offset="1" stopColor="#7F8F55" /></linearGradient>
        <linearGradient id="fa-olive-in" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E3E6CB" /><stop offset="1" stopColor="#A9B47E" /></linearGradient>
        <linearGradient id="fa-clay" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#F2C3A6" /><stop offset=".5" stopColor="#E3875C" /><stop offset="1" stopColor="#C9673E" /></linearGradient>
        <linearGradient id="fa-clay-in" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#B4532E" /><stop offset="1" stopColor="#E59A72" /></linearGradient>
        <linearGradient id="fa-fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stopColor="#FFFFFF" stopOpacity="0" /><stop offset="1" stopColor="#FFFFFF" stopOpacity=".95" /></linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#fa-bg)" />
      <path d="M70 190 C150 120 200 40 250 30 C290 22 300 70 280 110 C250 150 190 175 70 190 Z" fill="url(#fa-olive)" />
      <path d="M250 30 C300 22 330 60 300 110 C285 135 268 120 280 110 C300 70 290 22 250 30 Z" fill="url(#fa-olive-in)" opacity=".9" />
      <path d="M230 200 C300 150 340 60 400 10 L400 200 Z" fill="url(#fa-clay)" />
      <path d="M260 175 C320 150 360 120 400 110 L400 200 L240 200 Z" fill="url(#fa-clay-in)" opacity=".85" />
      <path d="M200 190 C280 165 340 150 400 165 L400 200 L190 200 Z" fill="#F6E3D5" opacity=".7" />
      <rect width="400" height="200" fill="url(#fa-fade)" />
    </svg>
  );
}
