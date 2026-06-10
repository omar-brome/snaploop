import { api } from '../../services/api';
import type { Comment, UserSearchResult } from '../../types';

export type CommentTargetType = 'post' | 'reel';

export interface CreateCommentBody {
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  parentId?: string;
}

export const commentsApi = {
  list: (targetType: CommentTargetType, targetId: string, cursor?: string) =>
    api.page<Comment>('/comments', { targetType, targetId, cursor }),
  replies: (commentId: string, cursor?: string) =>
    api.page<Comment>(`/comments/${commentId}/replies`, { cursor }),
  create: (body: CreateCommentBody) => api.post<Comment>('/comments', body),
  remove: (id: string) => api.delete<unknown>(`/comments/${id}`),
  like: (id: string) => api.post<unknown>(`/comments/${id}/like`),
  unlike: (id: string) => api.delete<unknown>(`/comments/${id}/like`),
  pin: (id: string) => api.post<unknown>(`/comments/${id}/pin`),
  unpin: (id: string) => api.delete<unknown>(`/comments/${id}/pin`),
  // Mention autocomplete (first page is plenty for a popover).
  searchUsers: (q: string) => api.page<UserSearchResult>('/search/users', { q }),
};
