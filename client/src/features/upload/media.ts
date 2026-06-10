// Local media-item model for the post composer: picked files plus their
// probed dimensions and per-media edit state. Object URLs live for the
// session only — callers revoke them when items are removed/unmounted.

import type { MediaType } from '../../types';
import { defaultEdit, type MediaEdit } from './canvas';

export const MAX_FILES = 10;

export interface MediaItem {
  id: string;
  file: File;
  /** Session object URL for previews. */
  url: string;
  mediaType: MediaType;
  width: number;
  height: number;
  /** Seconds — videos only. */
  duration: number | null;
  edit: MediaEdit;
}

let seq = 0;
const nextId = () => `media-${Date.now()}-${++seq}`;

function probeImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

function probeVideo(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
    video.onerror = () => reject(new Error('Could not read that video'));
    video.src = url;
  });
}

/** Validate + probe a picked file into a MediaItem (throws with a user-facing message). */
export async function toMediaItem(file: File): Promise<MediaItem> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith('image/')) {
      const { width, height } = await probeImage(url);
      return { id: nextId(), file, url, mediaType: 'IMAGE', width, height, duration: null, edit: defaultEdit() };
    }
    if (file.type.startsWith('video/')) {
      const { width, height, duration } = await probeVideo(url);
      return { id: nextId(), file, url, mediaType: 'VIDEO', width, height, duration, edit: defaultEdit() };
    }
    throw new Error(`"${file.name}" is not an image or a video`);
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err instanceof Error ? err : new Error('Could not read that file');
  }
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Immutable list reorder (no-op on out-of-range indices). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
