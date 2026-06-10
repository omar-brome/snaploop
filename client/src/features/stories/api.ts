import { api } from '../../services/api';
import type {
  Author,
  Conversation,
  Highlight,
  MediaType,
  Message,
  Page,
  Story,
  StoryTrayItem,
} from '../../types';

// ---- Types ----

export interface StoryViewRow {
  viewer: Author;
  viewedAt: string;
  reaction: string | null;
}

export interface StickerText {
  text: string;
  x: number; // 0-1 fraction of width
  y: number; // 0-1 fraction of height
  color: string;
  size: number; // px
}

export interface StickerData {
  texts: StickerText[];
}

export interface CreateStoryInput {
  mediaUrl: string;
  mediaType: MediaType;
  durationSeconds?: number;
  caption?: string;
  stickerData?: StickerData;
}

// ---- Stories ----

export function fetchStoryTray(): Promise<StoryTrayItem[]> {
  return api.get<StoryTrayItem[]>('/stories/tray');
}

export function fetchUserStories(username: string): Promise<Story[]> {
  return api.get<Story[]>(`/stories/user/${encodeURIComponent(username)}`);
}

export function createStory(input: CreateStoryInput): Promise<Story> {
  return api.post<Story>('/stories', input);
}

export function deleteStory(id: string): Promise<unknown> {
  return api.delete(`/stories/${id}`);
}

export function markStoryViewed(id: string): Promise<unknown> {
  return api.post(`/stories/${id}/view`);
}

export function fetchStoryViews(id: string, cursor?: string): Promise<Page<StoryViewRow>> {
  return api.page<StoryViewRow>(`/stories/${id}/views`, cursor ? { cursor } : undefined);
}

export function reactToStory(id: string, emoji: string): Promise<unknown> {
  return api.post(`/stories/${id}/react`, { emoji });
}

/** Story reply: ensure a 1:1 conversation with the author exists, then send the message. */
export async function sendStoryMessage(authorId: string, content: string): Promise<Message> {
  const conversation = await api.post<Conversation>('/conversations', {
    participantIds: [authorId],
  });
  return api.post<Message>(`/conversations/${conversation.id}/messages`, { content });
}

// ---- Highlights ----

export function fetchUserHighlights(username: string): Promise<Highlight[]> {
  return api.get<Highlight[]>(`/highlights/user/${encodeURIComponent(username)}`);
}

export function fetchHighlight(id: string): Promise<Highlight> {
  return api.get<Highlight>(`/highlights/${id}`);
}

export function createHighlight(input: {
  title: string;
  storyIds: string[];
  coverUrl?: string;
}): Promise<Highlight> {
  return api.post<Highlight>('/highlights', input);
}

export function deleteHighlight(id: string): Promise<unknown> {
  return api.delete(`/highlights/${id}`);
}

// ---- Sticker data ----

/**
 * Defensive parse of stickerData. The server stores arbitrary JSON, so we only
 * render text overlays when the value matches the { texts: [{ text, x, y, color, size }] }
 * shape exactly — anything else renders nothing.
 */
export function parseStickerTexts(data: unknown): StickerText[] {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const texts = (value as { texts?: unknown }).texts;
  if (!Array.isArray(texts)) return [];
  return texts.filter((t): t is StickerText => {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
    const o = t as Record<string, unknown>;
    return (
      typeof o.text === 'string' &&
      typeof o.x === 'number' &&
      o.x >= 0 &&
      o.x <= 1 &&
      typeof o.y === 'number' &&
      o.y >= 0 &&
      o.y <= 1 &&
      typeof o.color === 'string' &&
      typeof o.size === 'number' &&
      o.size > 0
    );
  });
}
