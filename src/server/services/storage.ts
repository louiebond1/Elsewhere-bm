import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { localObjects } from '../db/schema';

export interface Storage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/** Local and test driver: private bytes stored in PostgreSQL. Never served directly. */
const databaseStorage: Storage = {
  async put(key, bytes, contentType) {
    await db().insert(localObjects).values({ objectKey: key, bytes: bytes.toString('base64'), contentType }).onConflictDoUpdate({ target: localObjects.objectKey, set: { bytes: bytes.toString('base64'), contentType } });
  },
  async get(key) {
    const [r] = await db().select().from(localObjects).where(eq(localObjects.objectKey, key));
    return r ? Buffer.from(r.bytes, 'base64') : null;
  },
  async delete(key) {
    await db().delete(localObjects).where(eq(localObjects.objectKey, key));
  },
};

let s3: S3Client | null = null;
function s3Client() {
  if (!s3) s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
  return s3;
}
const s3Storage: Storage = {
  async put(key, bytes, contentType) {
    await s3Client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: bytes, ContentType: contentType }));
  },
  async get(key) {
    try {
      const r = await s3Client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      return r.Body ? Buffer.from(await r.Body.transformToByteArray()) : null;
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  },
  async delete(key) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  },
};

export const storage = (): Storage => (process.env.STORAGE_DRIVER === 'database' ? databaseStorage : s3Storage);
