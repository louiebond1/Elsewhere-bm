/** A calm, misty hillside at golden hour, drawn in SVG. A stand-in until a real photo is chosen. */
export function Landscape({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 360" preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <defs>
        <linearGradient id="ls-sky" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stopColor="#3E5B47" /><stop offset=".55" stopColor="#7E8B6A" /><stop offset=".85" stopColor="#D7A877" /><stop offset="1" stopColor="#E9BE8C" /></linearGradient>
        <radialGradient id="ls-sun" cx=".86" cy=".28" r=".35"><stop offset="0" stopColor="#F6D7A6" stopOpacity=".9" /><stop offset="1" stopColor="#F6D7A6" stopOpacity="0" /></radialGradient>
        <linearGradient id="ls-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#DCE3D2" stopOpacity="0" /><stop offset="1" stopColor="#DCE3D2" stopOpacity=".55" /></linearGradient>
        <linearGradient id="ls-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0F2A1E" stopOpacity=".78" /><stop offset=".55" stopColor="#0F2A1E" stopOpacity=".35" /><stop offset="1" stopColor="#0F2A1E" stopOpacity=".05" /></linearGradient>
      </defs>
      <rect width="1440" height="360" fill="url(#ls-sky)" />
      <rect width="1440" height="360" fill="url(#ls-sun)" />
      <path d="M0 210 C180 150 320 170 470 140 C640 105 760 160 930 120 C1090 85 1250 120 1440 95 L1440 360 L0 360 Z" fill="#6E8466" opacity=".75" />
      <rect y="120" width="1440" height="140" fill="url(#ls-mist)" />
      <path d="M0 250 C200 205 380 230 560 195 C760 155 900 220 1100 180 C1260 150 1360 175 1440 160 L1440 360 L0 360 Z" fill="#4B6A50" />
      <rect y="170" width="1440" height="120" fill="url(#ls-mist)" opacity=".7" />
      <path d="M0 300 C220 255 420 290 640 260 C860 230 1040 280 1240 245 C1340 228 1400 238 1440 232 L1440 360 L0 360 Z" fill="#2F4F3A" />
      <path d="M0 340 C260 305 520 330 780 310 C1040 290 1240 320 1440 300 L1440 360 L0 360 Z" fill="#1E3A2A" />
      <rect width="1440" height="360" fill="url(#ls-shade)" />
    </svg>
  );
}
