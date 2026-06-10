import axios from 'axios';
import { http } from '../../services/api';
import type {
  ApiEnvelope,
  Author,
  Conversation,
  CurrentUser,
  FollowStatus,
  GridPost,
  Page,
  Profile,
  StoryTrayItem,
} from '../../types';

// Profile-domain API. Unlike the generic helpers in services/api these keep
// the server's machine-readable error code (PRIVATE_ACCOUNT, USER_NOT_FOUND,
// USERNAME_TAKEN…) so callers can branch on it.

export class ProfileApiError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(message: string, code: string | null, status: number | null) {
    super(message);
    this.name = 'ProfileApiError';
    this.code = code;
    this.status = status;
  }
}

export function errorCode(err: unknown): string | null {
  return err instanceof ProfileApiError ? err.code : null;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function toProfileError(err: unknown): ProfileApiError {
  if (axios.isAxiosError(err)) {
    const envelope = err.response?.data as ApiEnvelope<unknown> | undefined;
    return new ProfileApiError(
      envelope?.error?.message ?? err.message,
      envelope?.error?.code ?? null,
      err.response?.status ?? null
    );
  }
  return new ProfileApiError(
    err instanceof Error ? err.message : 'Something went wrong',
    null,
    null
  );
}

async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  try {
    return (await promise).data.data;
  } catch (err) {
    throw toProfileError(err);
  }
}

async function unwrapPage<T>(promise: Promise<{ data: ApiEnvelope<T[]> }>): Promise<Page<T>> {
  try {
    const res = await promise;
    return { data: res.data.data, meta: res.data.meta };
  } catch (err) {
    throw toProfileError(err);
  }
}

export function nextPageCursor<T>(last: Page<T>): string | undefined {
  return last.meta?.hasMore && last.meta.nextCursor ? last.meta.nextCursor : undefined;
}

const enc = encodeURIComponent;

// ---- Shapes specific to this domain ----

/** GET /users/:username/reels grid shape. */
export interface ReelGridItem {
  id: string;
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
}

/** Rows of GET /users/:username/followers|following. */
export type FollowListUser = Author & { isFollowing: boolean; followStatus: FollowStatus };

/** Server collection shape (coverUrl falls back to the latest saved post). */
export interface ProfileCollection {
  id: string;
  name: string;
  coverUrl: string | null;
  postCount: number;
  createdAt: string;
}

export type NotificationPreferences = Record<string, boolean>;

export interface UpdateMeInput {
  fullName?: string;
  username?: string;
  bio?: string | null;
  websiteUrl?: string | null;
  avatarUrl?: string | null;
  gender?: string | null;
  isPrivate?: boolean;
}

// ---- Calls ----

export const profileApi = {
  profile: (username: string) => unwrap<Profile>(http.get(`/users/${enc(username)}`)),

  posts: (username: string, cursor?: string) =>
    unwrapPage<GridPost>(http.get(`/users/${enc(username)}/posts`, { params: { cursor } })),
  reels: (username: string, cursor?: string) =>
    unwrapPage<ReelGridItem>(http.get(`/users/${enc(username)}/reels`, { params: { cursor } })),
  tagged: (username: string, cursor?: string) =>
    unwrapPage<GridPost>(http.get(`/users/${enc(username)}/tagged`, { params: { cursor } })),

  followers: (username: string, cursor?: string) =>
    unwrapPage<FollowListUser>(
      http.get(`/users/${enc(username)}/followers`, { params: { cursor } })
    ),
  following: (username: string, cursor?: string) =>
    unwrapPage<FollowListUser>(
      http.get(`/users/${enc(username)}/following`, { params: { cursor } })
    ),

  followRequests: (cursor?: string) =>
    unwrapPage<Author>(http.get('/users/me/follow-requests', { params: { cursor } })),
  acceptFollowRequest: (username: string) =>
    unwrap<unknown>(http.post(`/users/${enc(username)}/follow/accept`)),
  declineFollowRequest: (username: string) =>
    unwrap<unknown>(http.post(`/users/${enc(username)}/follow/decline`)),

  block: (username: string) => unwrap<unknown>(http.post(`/users/${enc(username)}/block`)),
  unblock: (username: string) => unwrap<unknown>(http.delete(`/users/${enc(username)}/block`)),
  blockedUsers: (cursor?: string) =>
    unwrapPage<Author>(http.get('/users/me/blocked', { params: { cursor } })),

  reportUser: (targetId: string, reason: string) =>
    unwrap<unknown>(http.post('/users/report', { targetId, targetType: 'USER', reason })),

  /** Reuses an existing 1:1 conversation when one exists. */
  startConversation: (participantId: string) =>
    unwrap<Conversation>(http.post('/conversations', { participantIds: [participantId] })),

  /** Same key/shape as the StoryTray cache, so the data is shared. */
  storyTray: () => unwrap<StoryTrayItem[]>(http.get('/stories/tray')),

  updateMe: (input: UpdateMeInput) => unwrap<CurrentUser>(http.patch('/users/me', input)),

  saved: (cursor?: string) =>
    unwrapPage<GridPost>(http.get('/posts/me/saved', { params: { cursor } })),
  collections: (cursor?: string) =>
    unwrapPage<ProfileCollection>(http.get('/posts/collections', { params: { cursor } })),
  createCollection: (name: string) =>
    unwrap<ProfileCollection>(http.post('/posts/collections', { name })),
  renameCollection: (id: string, name: string) =>
    unwrap<ProfileCollection>(http.patch(`/posts/collections/${enc(id)}`, { name })),
  deleteCollection: (id: string) => unwrap<unknown>(http.delete(`/posts/collections/${enc(id)}`)),
  collectionPosts: (id: string, cursor?: string) =>
    unwrapPage<GridPost>(http.get(`/posts/collections/${enc(id)}/posts`, { params: { cursor } })),

  notificationPreferences: () =>
    unwrap<NotificationPreferences>(http.get('/notifications/preferences')),
  updateNotificationPreferences: (updates: NotificationPreferences) =>
    unwrap<NotificationPreferences>(http.patch('/notifications/preferences', updates)),

  deactivateAccount: (password: string) =>
    unwrap<unknown>(http.post('/auth/deactivate', { password })),
};
