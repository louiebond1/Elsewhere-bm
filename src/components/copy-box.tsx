'use client';
import { useState } from 'react';
import { buttonClass, cx } from './ui';

/** A line of text with one big Copy button, for addresses and starter messages. */
export function CopyBox({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-page p-3 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 break-all text-[15px]" aria-label={label}>{text}</code>
      <button type="button" className={cx(buttonClass(copied ? 'secondary' : 'primary'), 'shrink-0')} onClick={copy} aria-live="polite">{copied ? 'Copied ✓' : 'Copy'}</button>
    </div>
  );
}
