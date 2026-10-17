import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';

const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');

const s3 = env.STORAGE_DRIVER === 's3'
  ? new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: !!env.S3_ENDPOINT,
      credentials: env.S3_ACCESS_KEY_ID
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY! }
        : undefined,
    })
  : null;

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

/** Stores a private file and returns its key. Prescription images are medical data: never public. */
export async function putPrivateFile(folder: string, buf: Buffer, mime: string): Promise<string> {
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXT[mime] ?? 'bin'}`;
  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET!, Key: key, Body: buf, ContentType: mime, ServerSideEncryption: 'AES256',
    }));
  } else {
    const full = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
  }
  return key;
}

/**
 * Stores a public file (product photos, try-on PNGs) and returns its public URL.
 * S3/R2: set S3_PUBLIC_URL to the bucket's public domain (e.g. https://media.lensio.in).
 * Local: served by the API at /media.
 */
export async function putPublicFile(folder: string, buf: Buffer, mime: string): Promise<string> {
  const key = `public/${folder}/${randomUUID()}.${EXT[mime] ?? 'bin'}`;
  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET!, Key: key, Body: buf, ContentType: mime, CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${(env.S3_PUBLIC_URL ?? '').replace(/\/$/, '')}/${key}`;
  }
  const full = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
  return `${env.PUBLIC_BASE_URL}/media/${key.replace(/^public\//, '')}`;
}

/** Short-lived URL for viewing a private file. */
export async function signedUrl(key: string, expiresInSec = 600): Promise<string> {
  if (s3) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: key }), { expiresIn: expiresInSec });
  }
  return `${env.PUBLIC_BASE_URL}/dev-files/${key}`;
}

export const localUploadDir = LOCAL_DIR;
export const localPublicDir = path.join(LOCAL_DIR, 'public');
