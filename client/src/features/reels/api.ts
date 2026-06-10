import { api } from '../../services/api';
import type { Conversation, FollowStatus, Reel } from '../../types';

export interface CreateReelBody {
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  audioName?: string;
  audioArtist?: string;
  durationSeconds?: number;
}

export const reelsApi = {
  feed: (cursor?: string) => api.page<Reel>('/reels', { cursor, limit: 6 }),
  get: (id: string) => api.get<Reel>(`/reels/${id}`),
  like: (id: string) => api.post<unknown>(`/reels/${id}/like`),
  unlike: (id: string) => api.delete<unknown>(`/reels/${id}/like`),
  view: (id: string) => api.post<unknown>(`/reels/${id}/view`),
  create: (body: CreateReelBody) => api.post<Reel>('/reels', body),
  follow: (username: string) =>
    api.post<{ status: FollowStatus }>(`/users/${encodeURIComponent(username)}/follow`),
  report: (targetId: string, reason: string, description?: string) =>
    api.post<unknown>('/users/report', { targetId, targetType: 'REEL', reason, description }),
  conversations: (cursor?: string) => api.page<Conversation>('/conversations', { cursor, limit: 20 }),
  shareReel: (conversationId: string, reelId: string) =>
    api.post<unknown>(`/conversations/${conversationId}/messages`, {
      type: 'SHARED_REEL',
      sharedReelId: reelId,
    }),
};

// One view ping per reel per browser session.
const viewedThisSession = new Set<string>();

export function trackView(reelId: string): void {
  if (viewedThisSession.has(reelId)) return;
  viewedThisSession.add(reelId);
  reelsApi.view(reelId).catch(() => {
    // Allow a retry on the next visibility if the ping failed.
    viewedThisSession.delete(reelId);
  });
}

export function reelLink(reelId: string): string {
  return `${window.location.origin}/reels/${reelId}`;
}
