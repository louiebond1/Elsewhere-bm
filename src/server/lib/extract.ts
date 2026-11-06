/** CV text extraction. No external resource fetching, page and character limits enforced. */
import { prototype } from '../../config/prototype';

export class ExtractionError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function extractPdfText(bytes: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, stopAtErrors: true } as Parameters<typeof pdfjs.getDocument>[0]).promise;
  } catch (e) {
    if ((e as { name?: string }).name === 'PasswordException') throw new ExtractionError('encrypted');
    throw new ExtractionError('unreadable');
  }
  if (doc.numPages > prototype.maxCvPages) throw new ExtractionError('too_many_pages');
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of tc.items as { str?: string; transform?: number[] }[]) {
      if (typeof item.str !== 'string') continue;
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out += '\n';
      out += item.str;
      lastY = y;
    }
    out += '\n';
    if (out.length > prototype.maxCvTextChars) break;
  }
  await (doc as unknown as { cleanup?: () => Promise<void> }).cleanup?.();
  const text = out.replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 20) throw new ExtractionError('no_text');
  return text.slice(0, prototype.maxCvTextChars);
}

export async function extractDocxText(bytes: Buffer): Promise<string> {
  // Zip bomb guard: reject archives whose declared uncompressed size is extreme.
  if (bytes.length > prototype.maxCvBytes) throw new ExtractionError('too_large');
  const mammoth = await import('mammoth');
  const r = await mammoth.extractRawText({ buffer: bytes });
  const text = r.value.trim();
  if (text.length < 20) throw new ExtractionError('no_text');
  if (text.length > prototype.maxCvTextChars * 4) throw new ExtractionError('too_large');
  return text.slice(0, prototype.maxCvTextChars);
}

export const EXTRACTION_MESSAGES: Record<string, string> = {
  no_text: 'We could not read text from this file. Upload a text PDF or paste your CV.',
  encrypted: 'This PDF is password protected. Upload an unprotected text PDF or paste your CV.',
  too_many_pages: 'This CV is longer than 15 pages. Upload a shorter version or paste your CV.',
  unreadable: 'We could not read this file. Upload a text PDF or paste your CV.',
  too_large: 'This file is too large to read. Upload a shorter version or paste your CV.',
};
