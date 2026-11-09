import Image from 'next/image';

/**
 * The hills photo across the top of the page, behind the content, fading into the page colour, so
 * cards float over it. Sits behind everything (the app frame isolates its stacking).
 */
export function PhotoBackdrop({ height = 520 }: { height?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 w-screen -translate-x-1/2 overflow-hidden" style={{ height }}>
      <Image src="/images/mini-me-hills.webp" alt="" fill priority sizes="100vw" className="object-cover object-[70%_40%]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(10_30_20/0.78)_0%,rgb(10_30_20/0.5)_45%,rgb(10_30_20/0.12)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[60%] bg-[linear-gradient(180deg,rgb(246_247_243/0)_0%,rgb(246_247_243/0.85)_50%,#F6F7F3_85%)]" />
    </div>
  );
}
