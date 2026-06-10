import { api } from '../../services/api';
import type { GridPost, HashtagResult, Page, PlaceResult, UserSearchResult } from '../../types';

// Explore + search domain calls. Path segments are URL-encoded here;
// query params are encoded by axios' params serializer.

export interface SearchAllResult {
  users: UserSearchResult[];
  hashtags: HashtagResult[];
  places: PlaceResult[];
}

// Shared getNextPageParam for cursor-paginated endpoints.
export function nextPageCursor<T>(last: Page<T>): string | undefined {
  return last.meta?.hasMore && last.meta.nextCursor ? last.meta.nextCursor : undefined;
}

export function fetchExplorePage(cursor?: string): Promise<Page<GridPost>> {
  return api.page<GridPost>('/feed/explore', { cursor });
}

export function fetchTrendingHashtags(): Promise<HashtagResult[]> {
  return api.get<HashtagResult[]>('/search/trending-hashtags', { params: { limit: 10 } });
}

export function searchAll(q: string): Promise<SearchAllResult> {
  return api.get<SearchAllResult>('/search', { params: { q } });
}

export function searchUsers(q: string, cursor?: string): Promise<Page<UserSearchResult>> {
  return api.page<UserSearchResult>('/search/users', { q, cursor });
}

export function searchHashtags(q: string, cursor?: string): Promise<Page<HashtagResult>> {
  return api.page<HashtagResult>('/search/hashtags', { q, cursor });
}

export function searchPlaces(q: string, cursor?: string): Promise<Page<PlaceResult>> {
  return api.page<PlaceResult>('/search/places', { q, cursor });
}

export function fetchHashtag(name: string): Promise<HashtagResult> {
  return api.get<HashtagResult>(`/search/hashtags/${encodeURIComponent(name)}`);
}

export function fetchHashtagPosts(name: string, cursor?: string): Promise<Page<GridPost>> {
  return api.page<GridPost>(`/search/hashtags/${encodeURIComponent(name)}/posts`, { cursor });
}

// meta of the first page carries { name, lat, lng } for the place header.
export function fetchPlacePosts(name: string, cursor?: string): Promise<Page<GridPost>> {
  return api.page<GridPost>('/search/places/posts', { name, cursor });
}
