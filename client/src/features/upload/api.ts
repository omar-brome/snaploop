import { api } from '../../services/api';
import type { MediaType, Post, UserSearchResult } from '../../types';

export interface CreatePostMedia {
  url: string;
  mediaType: MediaType;
  width?: number;
  height?: number;
  displayOrder: number;
}

export interface CreatePostBody {
  caption?: string;
  locationName?: string;
  commentsOff?: boolean;
  media: CreatePostMedia[];
  tagUserIds?: { userId: string; x: number; y: number }[];
}

/** A people-tag placed locally before publish — x/y are 0..1 on the first image. */
export interface TagDraft {
  userId: string;
  username: string;
  x: number;
  y: number;
}

export const uploadApi = {
  createPost: (body: CreatePostBody) => api.post<Post>('/posts', body),
  searchUsers: async (q: string): Promise<UserSearchResult[]> =>
    (await api.page<UserSearchResult>('/search/users', { q, limit: 8 })).data,
};
