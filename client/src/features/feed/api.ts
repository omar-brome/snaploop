import { api } from '../../services/api';
import type { Author, Collection, Conversation, FollowStatus, Post } from '../../types';

export interface SuggestedUser extends Author {
  followerCount: number;
  isFollowing: boolean;
}

export type PostLiker = Author & { isFollowing: boolean };

export type PostUpdate = Partial<
  Pick<Post, 'caption' | 'locationName' | 'commentsOff' | 'isArchived'>
>;

export const feedApi = {
  home: (cursor?: string) => api.page<Post>('/feed/home', { cursor }),
  suggestedPosts: (cursor?: string) => api.page<Post>('/feed/suggested-posts', { cursor }),
  suggestedUsers: (limit = 10) =>
    api.get<SuggestedUser[]>('/users/suggested', { params: { limit } }),

  post: (id: string) => api.get<Post>(`/posts/${id}`),
  updatePost: (id: string, body: PostUpdate) => api.patch<Post>(`/posts/${id}`, body),
  deletePost: (id: string) => api.delete<unknown>(`/posts/${id}`),
  likes: (id: string, cursor?: string) => api.page<PostLiker>(`/posts/${id}/likes`, { cursor }),

  follow: (username: string) => api.post<{ status: FollowStatus }>(`/users/${username}/follow`),
  unfollow: (username: string) => api.delete<unknown>(`/users/${username}/follow`),

  collections: () => api.get<Collection[]>('/posts/collections'),
  createCollection: (name: string) => api.post<Collection>('/posts/collections', { name }),

  conversations: (cursor?: string) => api.page<Conversation>('/conversations', { cursor }),
  shareToConversation: (conversationId: string, postId: string) =>
    api.post<unknown>(`/conversations/${conversationId}/messages`, {
      type: 'SHARED_POST',
      sharedPostId: postId,
    }),

  report: (targetId: string, reason: string) =>
    api.post<unknown>('/users/report', { targetId, targetType: 'POST', reason }),
};
