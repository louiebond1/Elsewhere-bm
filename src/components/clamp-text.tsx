'use client';
import { useEffect, useRef, useState } from 'react';
import { cx } from './ui';

/** A long answer, shown as its first few lines; "Read full answer" opens the rest. Short ones show no button. */
export function ClampText({ text, lines = 3, className }: { text: string; lines?: 2 | 3 | 4; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => { const el = ref.current; if (el) setLong(el.scrollHeight > el.clientHeight + 2); }, [text]);
  const clamp = lines === 2 ? 'line-clamp-2' : lines === 4 ? 'line-clamp-4' : 'line-clamp-3';
  return (
    <div>
      <p ref={ref} className={cx(className, !open && clamp)}>{text}</p>
      {(long || open) && <button type="button" className="mt-1 text-[14px] font-semibold text-primary underline underline-offset-2" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read full answer'}</button>}
    </div>
  );
}
