import { api } from '../../services/api';
import type {
  Conversation,
  MediaType,
  Message,
  MessageType,
  Page,
  UserSearchResult,
} from '../../types';

// Direct-messages domain calls (docs/API.md /api/conversations + /api/search).

export interface SendMessageBody {
  type?: MessageType;
  content?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  sharedPostId?: string;
  sharedReelId?: string;
  replyToId?: string;
}

export interface CreateConversationBody {
  participantIds: string[];
  isGroup?: boolean;
  groupName?: string;
}

// Shared getNextPageParam for cursor-paginated endpoints.
export function nextPageCursor<T>(last: Page<T>): string | undefined {
  return last.meta?.hasMore && last.meta.nextCursor ? last.meta.nextCursor : undefined;
}

export const dmApi = {
  conversations: (cursor?: string) => api.page<Conversation>('/conversations', { cursor }),
  conversation: (id: string) => api.get<Conversation>(`/conversations/${id}`),
  createConversation: (body: CreateConversationBody) =>
    api.post<Conversation>('/conversations', body),
  updateGroup: (id: string, body: { groupName?: string; groupAvatarUrl?: string }) =>
    api.patch<Conversation>(`/conversations/${id}`, body),
  addParticipants: (id: string, userIds: string[]) =>
    api.post<Conversation>(`/conversations/${id}/participants`, { userIds }),
  removeParticipant: (id: string, userId: string) =>
    api.delete<unknown>(`/conversations/${id}/participants/${userId}`),
  messages: (id: string, cursor?: string) =>
    api.page<Message>(`/conversations/${id}/messages`, { cursor }),
  sendMessage: (id: string, body: SendMessageBody) =>
    api.post<Message>(`/conversations/${id}/messages`, body),
  markRead: (id: string) => api.post<{ conversationId: string; lastReadAt: string }>(`/conversations/${id}/read`),
  deleteMessage: (messageId: string) => api.delete<unknown>(`/conversations/messages/${messageId}`),
  toggleReaction: (messageId: string, emoji: string) =>
    api.post<unknown>(`/conversations/messages/${messageId}/reactions`, { emoji }),
  searchUsers: (q: string) => api.page<UserSearchResult>('/search/users', { q }),
};
