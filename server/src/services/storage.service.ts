import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { env } from '../config/env';

// Local-disk storage driver. Files are served statically at /uploads/<name>.
// A Cloudinary/S3 driver can be slotted in by implementing the same three
// functions and switching on env.storage.driver.

const UPLOAD_ROOT = path.resolve(process.cwd(), env.storage.uploadDir);

async function ensureDir() {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
}

export interface StoredImage {
  url: string;
  width: number;
  height: number;
}

// Re-encode + cap at maxDim px on the long edge. Strips EXIF as a side effect.
export async function saveImage(buffer: Buffer, maxDim = 1080): Promise<StoredImage> {
  await ensureDir();
  const name = `${randomUUID()}.webp`;
  const pipeline = sharp(buffer).rotate().resize(maxDim, maxDim, {
    fit: 'inside',
    withoutEnlargement: true,
  });
  const info = await pipeline.webp({ quality: 82 }).toFile(path.join(UPLOAD_ROOT, name));
  return { url: `/uploads/${name}`, width: info.width, height: info.height };
}

// Square avatar variant.
export async function saveAvatar(buffer: Buffer): Promise<StoredImage> {
  await ensureDir();
  const name = `${randomUUID()}.webp`;
  const info = await sharp(buffer)
    .rotate()
    .resize(320, 320, { fit: 'cover' })
    .webp({ quality: 85 })
    .toFile(path.join(UPLOAD_ROOT, name));
  return { url: `/uploads/${name}`, width: info.width, height: info.height };
}

// Videos are stored as-is (no transcoding pipeline in dev).
export async function saveVideo(buffer: Buffer, mimetype: string): Promise<{ url: string }> {
  await ensureDir();
  const ext = mimetype === 'video/webm' ? 'webm' : mimetype === 'video/quicktime' ? 'mov' : 'mp4';
  const name = `${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_ROOT, name), buffer);
  return { url: `/uploads/${name}` };
}

export async function deleteByUrl(url: string): Promise<void> {
  if (!url.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_ROOT, path.basename(url));
  await fs.unlink(file).catch(() => undefined);
}

export { UPLOAD_ROOT };
