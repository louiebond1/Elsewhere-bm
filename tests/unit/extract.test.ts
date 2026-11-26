import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfText } from '../../src/server/lib/extract';

describe('PDF text extraction on Node', () => {
  it('reads text from a PDF without rendering it', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Kept the monthly close to four working days.', { x: 50, y: 790, size: 11, font });
    const bytes = Buffer.from(await doc.save());
    const text = await extractPdfText(bytes);
    expect(text).toContain('monthly close');
  });
});
