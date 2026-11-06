import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { files, screenings, candidates } from '../db/schema';
import { AppError, conflict, invalid, notFound } from '../lib/errors';
import { prototype } from '../../config/prototype';
import { requireUser, type Ctx } from './context';
import { candidateIdOf } from './candidates';
import { enqueue } from './jobs';
import { storage } from './storage';
import { logActivity } from './audit';

const PDF_SIG = Buffer.from('%PDF-');
const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function sniffCv(name: string, declaredMime: string, bytes: Buffer): { mime: string; kind: 'pdf' | 'docx' } {
  const ext = name.toLowerCase().split('.').pop();
  if (bytes.length > prototype.maxCvBytes) throw new AppError('FILE_TOO_LARGE', 400, 'CVs can be up to 5 MB.');
  if (bytes.length < 8) throw invalid('This file is empty.');
  if (ext === 'pdf') {
    if (!bytes.subarray(0, 5).equals(PDF_SIG)) throw invalid('This file does not look like a PDF.');
    if (declaredMime && !['application/pdf', 'application/octet-stream'].includes(declaredMime)) throw invalid('This file type does not match its name.');
    if (bytes.includes(Buffer.from('/Encrypt'))) throw new AppError('ENCRYPTED_PDF', 400, 'This PDF is password protected. Upload an unprotected text PDF or paste your CV.');
    return { mime: 'application/pdf', kind: 'pdf' };
  }
  if (ext === 'docx') {
    if (!bytes.subarray(0, 4).equals(ZIP_SIG)) throw invalid('This file does not look like a Word document.');
    if (declaredMime && !['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream', 'application/zip'].includes(declaredMime)) throw invalid('This file type does not match its name.');
    if (bytes.includes(Buffer.from('vbaProject.bin'))) throw invalid('Macro-enabled documents are not accepted.');
    return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'docx' };
  }
  throw invalid('Upload a PDF or DOCX file.');
}

export async function uploadCv(ctx: Ctx, input: { filename: string; mime: string; bytes: Buffer; objectKey?: string }) {
  const a = requireUser(ctx.actor);
  const id = candidateIdOf(ctx);
  const { mime } = sniffCv(input.filename, input.mime, input.bytes);
  const key = input.objectKey ?? `datasets/${ctx.datasetId}/candidates/${id}/cv/${randomUUID()}`;
  await storage().put(key, input.bytes, mime);
  const [f] = await ctx.tx.insert(files).values({ datasetId: ctx.datasetId, candidateId: id, purpose: 'cv', objectKey: key, originalFilename: input.filename.slice(0, 200), mimeType: mime, bytes: BigInt(input.bytes.length), sha256: createHash('sha256').update(input.bytes).digest('hex'), uploadState: 'processing', uploadedByUserId: a.userId }).returning();
  const job = await enqueue(ctx, 'extract_cv', f.id, `extract_cv:${f.id}`);
  await logActivity(ctx, { subjectType: 'file', subjectId: f.id, action: 'cv.uploaded' });
  return { file: f, jobId: job.id };
}

export async function pasteCvText(ctx: Ctx, text: string) {
  const a = requireUser(ctx.actor);
  const id = candidateIdOf(ctx);
  const t = text.trim();
  if (!t) throw invalid('Paste your CV text.');
  if (t.length > prototype.maxCvTextChars) throw invalid(`Pasted text can be up to ${prototype.maxCvTextChars} characters.`);
  const key = `datasets/${ctx.datasetId}/candidates/${id}/cv/${randomUUID()}`;
  const bytes = Buffer.from(t, 'utf8');
  await storage().put(key, bytes, 'text/plain');
  const [f] = await ctx.tx.insert(files).values({ datasetId: ctx.datasetId, candidateId: id, purpose: 'cv', objectKey: key, originalFilename: 'pasted-cv.txt', mimeType: 'text/plain', bytes: BigInt(bytes.length), sha256: createHash('sha256').update(bytes).digest('hex'), uploadState: 'ready', extractedTextPrivate: t, uploadedByUserId: a.userId }).returning();
  return f;
}

export async function confirmCvText(ctx: Ctx, fileId: string) {
  const id = candidateIdOf(ctx);
  const [f] = await ctx.tx.select().from(files).where(and(eq(files.id, fileId), eq(files.candidateId, id)));
  if (!f || f.uploadState !== 'ready') throw notFound();
  await ctx.tx.update(files).set({ textConfirmedAt: ctx.now, updatedAt: new Date() }).where(eq(files.id, fileId));
}

export async function deleteCv(ctx: Ctx, fileId: string) {
  const id = candidateIdOf(ctx);
  const [f] = await ctx.tx.select().from(files).where(and(eq(files.id, fileId), eq(files.candidateId, id), eq(files.purpose, 'cv')));
  if (!f) throw notFound();
  await storage().delete(f.objectKey);
  await ctx.tx.update(files).set({ uploadState: 'deleted', extractedTextPrivate: null, deletedAt: new Date(), updatedAt: new Date() }).where(eq(files.id, fileId));
}

export async function latestCv(ctx: Ctx, candidateId: string) {
  const [f] = await ctx.tx.select().from(files).where(and(eq(files.candidateId, candidateId), eq(files.purpose, 'cv'))).orderBy(desc(files.createdAt)).limit(1);
  return f && f.uploadState !== 'deleted' ? f : null;
}

/** Authenticated download proxy. CVs: owner or consultant. Recordings: consultants only. Clients never. */
export async function fileForDownload(ctx: Ctx, fileId: string) {
  const a = requireUser(ctx.actor);
  const [f] = await ctx.tx.select().from(files).where(and(eq(files.id, fileId), eq(files.datasetId, ctx.datasetId)));
  if (!f || f.uploadState === 'deleted' || f.uploadState === 'deleting') throw notFound();
  if (a.userType === 'client') throw notFound();
  if (f.purpose === 'screening_recording' && a.userType !== 'consultant') throw notFound();
  if (f.purpose === 'cv' && a.userType === 'candidate' && f.candidateId !== a.candidateId) throw notFound();
  if (f.candidateId) {
    const [c] = await ctx.tx.select({ s: candidates.status }).from(candidates).where(eq(candidates.id, f.candidateId));
    if (!c || c.s === 'deleting' || c.s === 'deleted') throw notFound();
  }
  const bytes = await storage().get(f.objectKey);
  if (!bytes) throw notFound();
  return { bytes, mime: f.mimeType, filename: f.purpose === 'cv' ? (f.originalFilename.endsWith('.txt') ? 'cv.txt' : f.mimeType === 'application/pdf' ? 'cv.pdf' : 'cv.docx') : f.mimeType === 'audio/wav' ? 'recording.wav' : 'recording.mp3' };
}

export async function uploadRecording(ctx: Ctx, screeningId: string, input: { filename: string; mime: string; bytes: Buffer; objectKey?: string }) {
  const a = requireUser(ctx.actor, 'consultant');
  const [s] = await ctx.tx.select().from(screenings).where(and(eq(screenings.id, screeningId), eq(screenings.datasetId, ctx.datasetId)));
  if (!s) throw notFound();
  if (!s.recordingConsentAt) throw conflict('RECORDING_CONSENT_REQUIRED', 'Record the candidate’s recording consent before uploading.');
  if (input.bytes.length > prototype.maxRecordingBytes) throw new AppError('FILE_TOO_LARGE', 400, 'Recordings can be up to 25 MB.');
  const ext = input.filename.toLowerCase().split('.').pop();
  const isWav = ext === 'wav' && input.bytes.subarray(0, 4).toString('latin1') === 'RIFF' && input.bytes.subarray(8, 12).toString('latin1') === 'WAVE';
  const isMp3 = ext === 'mp3' && (input.bytes.subarray(0, 3).toString('latin1') === 'ID3' || (input.bytes[0] === 0xff && (input.bytes[1] & 0xe0) === 0xe0));
  if (!isWav && !isMp3) throw invalid('Upload an MP3 or WAV recording.');
  const key = input.objectKey ?? `datasets/${ctx.datasetId}/screenings/${screeningId}/recording/${randomUUID()}`;
  const mime = isWav ? 'audio/wav' : 'audio/mpeg';
  await storage().put(key, input.bytes, mime);
  const [f] = await ctx.tx.insert(files).values({ datasetId: ctx.datasetId, screeningId, purpose: 'screening_recording', objectKey: key, originalFilename: input.filename.slice(0, 200), mimeType: mime, bytes: BigInt(input.bytes.length), sha256: createHash('sha256').update(input.bytes).digest('hex'), uploadState: 'ready', uploadedByUserId: a.userId }).returning();
  await logActivity(ctx, { subjectType: 'screening', subjectId: screeningId, action: 'recording.uploaded' });
  return f;
}
