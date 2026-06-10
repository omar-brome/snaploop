// Post-draft persistence. Files themselves can't survive a reload, so we
// keep the text fields + lightweight media descriptors and offer a
// restore/discard banner when a stale draft is found on return.

import type { MediaType } from '../../types';

export const DRAFT_KEY = 'snaploop-post-draft';

export type DraftStep = 'select' | 'edit' | 'details';

export interface DraftMediaDescriptor {
  name: string;
  mediaType: MediaType;
}

export interface PostDraft {
  caption: string;
  location: string;
  commentsOff: boolean;
  step: DraftStep;
  media: DraftMediaDescriptor[];
  savedAt: number;
}

export function loadDraft(): PostDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const d = parsed as Partial<PostDraft>;
    return {
      caption: typeof d.caption === 'string' ? d.caption : '',
      location: typeof d.location === 'string' ? d.location : '',
      commentsOff: d.commentsOff === true,
      step: d.step === 'edit' || d.step === 'details' ? d.step : 'select',
      media: Array.isArray(d.media)
        ? d.media.filter(
            (m): m is DraftMediaDescriptor =>
              typeof m === 'object' &&
              m !== null &&
              typeof (m as DraftMediaDescriptor).name === 'string' &&
              ((m as DraftMediaDescriptor).mediaType === 'IMAGE' ||
                (m as DraftMediaDescriptor).mediaType === 'VIDEO')
          )
        : [],
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: PostDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked — drafts are best-effort.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}

export function hasDraftContent(draft: PostDraft): boolean {
  return (
    draft.caption.trim().length > 0 ||
    draft.location.trim().length > 0 ||
    draft.commentsOff ||
    draft.media.length > 0
  );
}
