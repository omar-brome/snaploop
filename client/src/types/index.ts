// Shared API types — mirror docs/API.md shapes (camelCase JSON from the server).

export interface Author {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

export type FollowStatus = 'none' | 'pending' | 'accepted';

export interface CurrentUser extends Author {
  email: string;
  bio: string | null;
  websiteUrl: string | null;
  gender?: string | null;
  isPrivate: boolean;
  createdAt: string;
  postCount?: number;
  followerCount?: number;
  followingCount?: number;
}

export interface Profile extends Author {
  bio: string | null;
  websiteUrl: string | null;
  isPrivate: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  followStatus: FollowStatus;
  followsMe: boolean;
  isBlocked: boolean;
  isOwnProfile: boolean;
}

export type MediaType = 'IMAGE' | 'VIDEO';

export interface PostMedia {
  id: string;
  mediaUrl: string;
  mediaType: MediaType;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  displayOrder: number;
}

export interface PostTag {
  user: Author;
  x: number;
  y: number;
}

export interface Post {
  id: string;
  caption: string | null;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  createdAt: string;
  commentsOff: boolean;
  likeCount: number;
  commentCount: number;
  user: Author;
  media: PostMedia[];
  tags: PostTag[];
  isLiked: boolean;
  isSaved: boolean;
  isArchived?: boolean;
}

// Compact shape used in profile/explore/hashtag grids.
export interface GridPost {
  id: string;
  likeCount: number;
  commentCount: number;
  mediaCount: number;
  media: PostMedia[];
}

export interface Story {
  id: string;
  mediaUrl: string;
  mediaType: MediaType;
  durationSeconds: number | null;
  caption: string | null;
  stickerData: unknown;
  createdAt: string;
  expiresAt: string;
  user: Author;
  viewCount?: number;
  isViewed: boolean;
}

export interface StoryTrayItem {
  user: Author;
  latestAt: string;
  allViewed: boolean;
  storyCount: number;
}

export interface Highlight {
  id: string;
  title: string;
  coverUrl: string | null;
  storyCount: number;
  stories?: Story[];
}

export interface Reel {
  id: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  audioName: string | null;
  audioArtist: string | null;
  durationSeconds: number | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  user: Author & { isFollowing?: boolean };
  isLiked: boolean;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isPinned: boolean;
  user: Author;
  replyCount: number;
  isLiked: boolean;
  parentId: string | null;
  postId: string | null;
  reelId: string | null;
}

export type NotificationType =
  | 'FOLLOW'
  | 'FOLLOW_REQUEST'
  | 'FOLLOW_ACCEPTED'
  | 'LIKE_POST'
  | 'LIKE_REEL'
  | 'LIKE_COMMENT'
  | 'COMMENT_POST'
  | 'COMMENT_REEL'
  | 'COMMENT_REPLY'
  | 'MENTION_COMMENT'
  | 'MENTION_CAPTION'
  | 'TAGGED_IN_POST'
  | 'MESSAGE';

export interface Notification {
  id: string;
  type: NotificationType;
  targetId: string | null;
  targetType: 'POST' | 'REEL' | 'COMMENT' | 'USER' | 'STORY' | 'CONVERSATION' | null;
  isRead: boolean;
  createdAt: string;
  sender: Author;
  preview?: { thumbnailUrl: string | null };
}

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'SHARED_POST' | 'SHARED_REEL' | 'STORY_REPLY';

export interface Message {
  id: string;
  conversationId: string;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  mediaType: MediaType | null;
  sharedPost?: (GridPost & { user: Author }) | null;
  sharedReel?: { id: string; thumbnailUrl: string | null; user: Author } | null;
  replyTo?: { id: string; content: string | null; sender: Author } | null;
  reactions: Record<string, string[]> | null;
  isDeleted: boolean;
  createdAt: string;
  sender: Author;
  seenBy: string[];
}

export interface Participant extends Author {
  lastReadAt: string | null;
  isOnline: boolean;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatarUrl: string | null;
  participants: Participant[];
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;
}

export interface HashtagResult {
  name: string;
  postCount: number;
}

export interface PlaceResult {
  name: string;
  lat: number | null;
  lng: number | null;
  postCount: number;
}

export interface UserSearchResult extends Author {
  followerCount: number;
  mutualCount?: number;
}

export interface Collection {
  id: string;
  name: string;
  coverUrl: string | null;
  isPrivate: boolean;
  createdAt: string;
}

// Envelope every endpoint returns.
export interface ApiMeta {
  nextCursor?: string | null;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta: ApiMeta | null;
  error: { message: string; code: string | null } | null;
}

export interface Page<T> {
  data: T[];
  meta: ApiMeta | null;
}
