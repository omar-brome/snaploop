import { http, apiErrorMessage } from './api';
import type { MediaType } from '../types';

export interface UploadedMedia {
  url: string;
  mediaType: MediaType;
  width: number | null;
  height: number | null;
}

// Client-side compression: draw onto a canvas capped at maxDim px before
// uploading. Videos and GIFs pass through untouched.
export async function compressImage(file: File, maxDim = 1080): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.9)
  );
}

export async function uploadFiles(
  files: (File | Blob)[],
  options?: { kind?: 'avatar'; onProgress?: (percent: number) => void }
): Promise<UploadedMedia[]> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file, file instanceof File ? file.name : 'upload.jpg');
  }
  try {
    const res = await http.post(`/upload${options?.kind ? `?kind=${options.kind}` : ''}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) options?.onProgress?.(Math.round((e.loaded / e.total) * 100));
      },
    });
    return res.data.data.media as UploadedMedia[];
  } catch (err) {
    throw new Error(apiErrorMessage(err));
  }
}
