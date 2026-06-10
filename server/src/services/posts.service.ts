import {
  FollowStatus,
  LikeTargetType,
  NotificationTargetType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { CursorPayload, cursorWhere, paginate } from '../utils/cursor';
import { extractHashtags, extractMentions } from '../utils/parse';
import { createNotification, notifyMentions } from './notification.service';

// ───────────────────────── Shared shapes ─────────────────────────

const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

// Author plus the privacy fields visibility checks need; the serializer only
// ever exposes the public author fields.
const postAuthorSelect = {
  ...authorSelect,
  isPrivate: true,
  isActive: true,
} satisfies Prisma.UserSelect;

// Full post shape (field-for-field compatible with feed.service).
const postInclude = {
  user: { select: postAuthorSelect },
  media: { orderBy: { displayOrder: 'asc' } },
  tags: { select: { x: true, y: true, user: { select: authorSelect } } },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

// Grid shape for saved/archived/collection lists: id + first media + counters.
const gridSelect = {
  id: true,
  createdAt: true,
  likeCount: true,
  commentCount: true,
  media: { orderBy: { displayOrder: 'asc' }, take: 1 },
  _count: { select: { media: true } },
} satisfies Prisma.PostSelect;

type GridRow = Prisma.PostGetPayload<{ select: typeof gridSelect }>;

function serializePost(post: PostRow, isLiked: boolean, isSaved: boolean) {
  return {
    id: post.id,
    caption: post.caption,
    locationName: post.locationName,
    locationLat: post.locationLat,
    locationLng: post.locationLng,
    createdAt: post.createdAt,
    commentsOff: post.commentsOff,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    user: {
      id: post.user.id,
      username: post.user.username,
      fullName: post.user.fullName,
      avatarUrl: post.user.avatarUrl,
      isVerified: post.user.isVerified,
    },
    media: post.media.map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      width: m.width,
      height: m.height,
      thumbnailUrl: m.thumbnailUrl,
      displayOrder: m.displayOrder,
    })),
    tags: post.tags.map((t) => ({ user: t.user, x: t.x, y: t.y })),
    isLiked,
    isSaved,
  };
}

function serializeGridPost(post: GridRow) {
  return {
    id: post.id,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    mediaCount: post._count.media,
    media: post.media.map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      width: m.width,
      height: m.height,
      thumbnailUrl: m.thumbnailUrl,
      displayOrder: m.displayOrder,
    })),
  };
}

// ───────────────────────── Inputs ─────────────────────────

export interface CreatePostInput {
  caption?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  commentsOff?: boolean;
  media: {
    url: string;
    mediaType: 'IMAGE' | 'VIDEO';
    width?: number;
    height?: number;
    displayOrder: number;
  }[];
  tagUserIds?: { userId: string; x: number; y: number }[];
}

export interface UpdatePostInput {
  caption?: string | null;
  locationName?: string | null;
  commentsOff?: boolean;
  isArchived?: boolean;
}

// ───────────────────────── Visibility helpers ─────────────────────────

async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return block !== null;
}

async function getBlockedUserIds(userId: string): Promise<string[]> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
}

async function getAcceptedFollowingIds(userId: string): Promise<string[]> {
  const follows = await prisma.follow.findMany({
    where: { followerId: userId, status: FollowStatus.ACCEPTED },
    select: { followingId: true },
  });
  return follows.map((f) => f.followingId);
}

// Direct access to hidden content is always a 404 (never reveal existence):
// archived (non-owner), inactive author, block either way, private-not-follower.
async function assertPostVisible(
  post: { userId: string; isArchived: boolean; user: { isPrivate: boolean; isActive: boolean } },
  viewerId: string | null
): Promise<void> {
  const notFound = () => new ApiError(404, 'Post not found', 'NOT_FOUND');
  if (!post.user.isActive) throw notFound();
  if (viewerId === post.userId) return;
  if (post.isArchived) throw notFound();
  if (viewerId && (await isBlockedEitherWay(viewerId, post.userId))) throw notFound();
  if (post.user.isPrivate) {
    if (!viewerId) throw notFound();
    const follow = await prisma.follow.findFirst({
      where: { followerId: viewerId, followingId: post.userId, status: FollowStatus.ACCEPTED },
      select: { id: true },
    });
    if (!follow) throw notFound();
  }
}

const visibilityPostSelect = {
  id: true,
  userId: true,
  isArchived: true,
  likeCount: true,
  user: { select: { isPrivate: true, isActive: true } },
} satisfies Prisma.PostSelect;

async function getVisiblePost(postId: string, viewerId: string | null) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: visibilityPostSelect,
  });
  if (!post) throw new ApiError(404, 'Post not found', 'NOT_FOUND');
  await assertPostVisible(post, viewerId);
  return post;
}

async function getOwnedPost(userId: string, postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, caption: true },
  });
  if (!post) throw new ApiError(404, 'Post not found', 'NOT_FOUND');
  if (post.userId !== userId) {
    throw new ApiError(403, 'You can only modify your own posts', 'FORBIDDEN');
  }
  return post;
}

async function viewerFlags(viewerId: string | null, postId: string) {
  if (!viewerId) return { isLiked: false, isSaved: false };
  const [like, save] = await Promise.all([
    prisma.like.findUnique({
      where: {
        userId_targetId_targetType: {
          userId: viewerId,
          targetId: postId,
          targetType: LikeTargetType.POST,
        },
      },
      select: { id: true },
    }),
    prisma.savedPost.findUnique({
      where: { userId_postId: { userId: viewerId, postId } },
      select: { id: true },
    }),
  ]);
  return { isLiked: like !== null, isSaved: save !== null };
}

// ───────────────────────── Hashtag sync ─────────────────────────

async function addHashtags(tx: Prisma.TransactionClient, postId: string, names: string[]) {
  for (const name of names) {
    // Upsert keeps the denormalized postCount in step with the join row.
    const hashtag = await tx.hashtag.upsert({
      where: { name },
      update: { postCount: { increment: 1 } },
      create: { name, postCount: 1 },
      select: { id: true },
    });
    await tx.postHashtag.create({ data: { postId, hashtagId: hashtag.id } });
  }
}

async function removeHashtags(tx: Prisma.TransactionClient, postId: string, hashtagIds: string[]) {
  if (hashtagIds.length === 0) return;
  await tx.postHashtag.deleteMany({ where: { postId, hashtagId: { in: hashtagIds } } });
  await tx.hashtag.updateMany({
    where: { id: { in: hashtagIds } },
    data: { postCount: { decrement: 1 } },
  });
}

// ───────────────────────── CRUD ─────────────────────────

export async function createPost(userId: string, input: CreatePostInput) {
  // Tagged users: dedupe by userId, keep only existing active users with no
  // block in either direction.
  const dedupedTags = new Map<string, { userId: string; x: number; y: number }>();
  for (const t of input.tagUserIds ?? []) {
    if (!dedupedTags.has(t.userId)) dedupedTags.set(t.userId, t);
  }
  let tags: { userId: string; x: number; y: number }[] = [];
  if (dedupedTags.size > 0) {
    const blocked = new Set(await getBlockedUserIds(userId));
    const taggable = await prisma.user.findMany({
      where: { id: { in: [...dedupedTags.keys()] }, isActive: true },
      select: { id: true },
    });
    tags = taggable.filter((u) => !blocked.has(u.id)).map((u) => dedupedTags.get(u.id)!);
  }

  const hashtags = extractHashtags(input.caption);

  const post = await prisma.$transaction(async (tx) => {
    const row = await tx.post.create({
      data: {
        userId,
        caption: input.caption || null,
        locationName: input.locationName || null,
        locationLat: input.locationLat ?? null,
        locationLng: input.locationLng ?? null,
        commentsOff: input.commentsOff ?? false,
        media: {
          create: input.media.map((m) => ({
            mediaUrl: m.url,
            mediaType: m.mediaType,
            width: m.width,
            height: m.height,
            displayOrder: m.displayOrder,
          })),
        },
        ...(tags.length > 0
          ? { tags: { create: tags.map((t) => ({ userId: t.userId, x: t.x, y: t.y })) } }
          : {}),
      },
      include: postInclude,
    });
    await addHashtags(tx, row.id, hashtags);
    return row;
  });

  await Promise.all(
    tags.map((t) =>
      createNotification({
        recipientId: t.userId,
        senderId: userId,
        type: NotificationType.TAGGED_IN_POST,
        targetId: post.id,
        targetType: NotificationTargetType.POST,
      })
    )
  );
  await notifyMentions({
    usernames: extractMentions(post.caption),
    senderId: userId,
    type: NotificationType.MENTION_CAPTION,
    targetId: post.id,
    targetType: NotificationTargetType.POST,
  });

  return serializePost(post, false, false);
}

export async function getPostById(postId: string, viewerId: string | null) {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: postInclude });
  if (!post) throw new ApiError(404, 'Post not found', 'NOT_FOUND');
  await assertPostVisible(post, viewerId);

  const { isLiked, isSaved } = await viewerFlags(viewerId, postId);
  return serializePost(post, isLiked, isSaved);
}

export async function updatePost(userId: string, postId: string, input: UpdatePostInput) {
  const existing = await getOwnedPost(userId, postId);

  const captionProvided = input.caption !== undefined;
  const captionChanged = captionProvided && (input.caption ?? null) !== existing.caption;

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.post.update({
      where: { id: postId },
      data: {
        ...(captionProvided ? { caption: input.caption } : {}),
        ...(input.locationName !== undefined ? { locationName: input.locationName } : {}),
        ...(input.commentsOff !== undefined ? { commentsOff: input.commentsOff } : {}),
        ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
      },
      include: postInclude,
    });

    if (captionChanged) {
      // Re-sync hashtag rows: drop stale tags (and their counts), add new ones.
      const next = new Set(extractHashtags(updated.caption));
      const current = await tx.postHashtag.findMany({
        where: { postId },
        select: { hashtagId: true, hashtag: { select: { name: true } } },
      });
      const staleIds = current.filter((c) => !next.has(c.hashtag.name)).map((c) => c.hashtagId);
      await removeHashtags(tx, postId, staleIds);
      const currentNames = new Set(current.map((c) => c.hashtag.name));
      await addHashtags(
        tx,
        postId,
        [...next].filter((n) => !currentNames.has(n))
      );
    }
    return updated;
  });

  const { isLiked, isSaved } = await viewerFlags(userId, postId);
  return serializePost(row, isLiked, isSaved);
}

export async function deletePost(userId: string, postId: string) {
  await getOwnedPost(userId, postId);

  await prisma.$transaction(async (tx) => {
    // Likes are polymorphic (no FK cascade): remove rows pointing at the post
    // and at its comments before the comments cascade away.
    const comments = await tx.comment.findMany({ where: { postId }, select: { id: true } });
    const commentIds = comments.map((c) => c.id);
    const likeFilters: Prisma.LikeWhereInput[] = [
      { targetType: LikeTargetType.POST, targetId: postId },
    ];
    if (commentIds.length > 0) {
      likeFilters.push({ targetType: LikeTargetType.COMMENT, targetId: { in: commentIds } });
    }
    await tx.like.deleteMany({ where: { OR: likeFilters } });
    await tx.notification.deleteMany({
      where: { targetId: postId, targetType: NotificationTargetType.POST },
    });

    const joined = await tx.postHashtag.findMany({ where: { postId }, select: { hashtagId: true } });
    if (joined.length > 0) {
      await tx.hashtag.updateMany({
        where: { id: { in: joined.map((j) => j.hashtagId) } },
        data: { postCount: { decrement: 1 } },
      });
    }

    // Media, tags, comments, saves and post_hashtags rows cascade at the DB.
    await tx.post.delete({ where: { id: postId } });
  });

  return { deleted: true };
}

// ───────────────────────── Like / unlike ─────────────────────────

export async function likePost(userId: string, postId: string) {
  const post = await getVisiblePost(postId, userId);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.like.findUnique({
      where: {
        userId_targetId_targetType: {
          userId,
          targetId: postId,
          targetType: LikeTargetType.POST,
        },
      },
      select: { id: true },
    });
    // Idempotent: liking twice neither duplicates the row nor the counter.
    if (existing) return { likeCount: post.likeCount, created: false };

    await tx.like.create({
      data: { userId, targetId: postId, targetType: LikeTargetType.POST },
    });
    const updated = await tx.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { likeCount: updated.likeCount, created: true };
  });

  if (result.created) {
    await createNotification({
      recipientId: post.userId,
      senderId: userId,
      type: NotificationType.LIKE_POST,
      targetId: postId,
      targetType: NotificationTargetType.POST,
    });
  }

  return { isLiked: true, likeCount: result.likeCount };
}

export async function unlikePost(userId: string, postId: string) {
  // No visibility check: a user must always be able to withdraw their like,
  // even after losing access to the post.
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, likeCount: true },
  });
  if (!post) throw new ApiError(404, 'Post not found', 'NOT_FOUND');

  const likeCount = await prisma.$transaction(async (tx) => {
    const deleted = await tx.like.deleteMany({
      where: { userId, targetId: postId, targetType: LikeTargetType.POST },
    });
    if (deleted.count === 0) return post.likeCount;
    const updated = await tx.post.update({
      where: { id: postId },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    return Math.max(updated.likeCount, 0);
  });

  return { isLiked: false, likeCount };
}

export async function listPostLikes(
  viewerId: string,
  postId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  await getVisiblePost(postId, viewerId);

  const blockedIds = await getBlockedUserIds(viewerId);
  const rows = await prisma.like.findMany({
    where: {
      AND: [
        {
          targetType: LikeTargetType.POST,
          targetId: postId,
          user: {
            isActive: true,
            ...(blockedIds.length > 0 ? { id: { notIn: blockedIds } } : {}),
          },
        },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { user: { select: authorSelect } },
  });
  const { items, meta } = paginate(rows, limit);

  const likerIds = items.map((l) => l.user.id);
  const follows =
    likerIds.length > 0
      ? await prisma.follow.findMany({
          where: {
            followerId: viewerId,
            followingId: { in: likerIds },
            status: FollowStatus.ACCEPTED,
          },
          select: { followingId: true },
        })
      : [];
  const followingSet = new Set(follows.map((f) => f.followingId));

  return {
    items: items.map((l) => ({ ...l.user, isFollowing: followingSet.has(l.user.id) })),
    meta,
  };
}

// ───────────────────────── Save / unsave ─────────────────────────

export async function savePost(userId: string, postId: string, collectionId?: string) {
  await getVisiblePost(postId, userId);

  if (collectionId) {
    const collection = await prisma.collection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!collection) throw new ApiError(404, 'Collection not found', 'NOT_FOUND');
  }

  const saved = await prisma.savedPost.upsert({
    where: { userId_postId: { userId, postId } },
    // Re-saving with a collection moves the save; without one it stays put.
    update: collectionId !== undefined ? { collectionId } : {},
    create: { userId, postId, collectionId: collectionId ?? null },
    select: { collectionId: true },
  });

  return { isSaved: true, collectionId: saved.collectionId };
}

export async function unsavePost(userId: string, postId: string) {
  await prisma.savedPost.deleteMany({ where: { userId, postId } });
  return { isSaved: false };
}

// ───────────────────────── Saved / archived lists ─────────────────────────

// Keyset pagination on (savedAt DESC, id DESC) — savedAt rides in the cursor's
// createdAt slot.
function savedCursorWhere(cursor: CursorPayload | null): Prisma.SavedPostWhereInput {
  if (!cursor) return {};
  const savedAt = new Date(cursor.createdAt);
  return {
    OR: [{ savedAt: { lt: savedAt } }, { savedAt, id: { lt: cursor.id } }],
  };
}

// Saves persist even when the post becomes invisible (archived by its owner,
// author blocked/deactivated/private-unfollowed) — hide those from the grid.
async function savedVisibilityWhere(userId: string): Promise<Prisma.SavedPostWhereInput> {
  const [blockedIds, followingIds] = await Promise.all([
    getBlockedUserIds(userId),
    getAcceptedFollowingIds(userId),
  ]);
  return {
    post: {
      AND: [
        { OR: [{ isArchived: false }, { userId }] },
        {
          user: {
            isActive: true,
            ...(blockedIds.length > 0 ? { id: { notIn: blockedIds } } : {}),
            OR: [{ isPrivate: false }, { id: { in: [...followingIds, userId] } }],
          },
        },
      ],
    },
  };
}

async function listSavedGrid(
  baseWhere: Prisma.SavedPostWhereInput,
  visibility: Prisma.SavedPostWhereInput,
  cursor: CursorPayload | null,
  limit: number
) {
  const rows = await prisma.savedPost.findMany({
    where: { AND: [baseWhere, visibility, savedCursorWhere(cursor)] },
    orderBy: [{ savedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: { id: true, savedAt: true, post: { select: gridSelect } },
  });
  const { items, meta } = paginate(
    rows.map((r) => ({ id: r.id, createdAt: r.savedAt, post: r.post })),
    limit
  );
  return { items: items.map((r) => serializeGridPost(r.post)), meta };
}

export async function listSavedPosts(userId: string, cursor: CursorPayload | null, limit: number) {
  const visibility = await savedVisibilityWhere(userId);
  return listSavedGrid({ userId }, visibility, cursor, limit);
}

export async function listArchivedPosts(
  userId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  const rows = await prisma.post.findMany({
    where: { AND: [{ userId, isArchived: true }, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: gridSelect,
  });
  const { items, meta } = paginate(rows, limit);
  return { items: items.map(serializeGridPost), meta };
}

// ───────────────────────── Collections ─────────────────────────

const collectionInclude = {
  _count: { select: { savedPosts: true } },
  savedPosts: {
    orderBy: { savedAt: 'desc' },
    take: 1,
    select: {
      post: {
        select: {
          media: {
            orderBy: { displayOrder: 'asc' },
            take: 1,
            select: { mediaUrl: true, thumbnailUrl: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CollectionInclude;

type CollectionRow = Prisma.CollectionGetPayload<{ include: typeof collectionInclude }>;

function serializeCollection(c: CollectionRow) {
  const firstMedia = c.savedPosts[0]?.post.media[0];
  return {
    id: c.id,
    name: c.name,
    // Fallback cover: the most recently saved post's first media.
    coverUrl: c.coverUrl ?? (firstMedia ? (firstMedia.thumbnailUrl ?? firstMedia.mediaUrl) : null),
    postCount: c._count.savedPosts,
    createdAt: c.createdAt,
  };
}

async function getOwnedCollection(userId: string, collectionId: string) {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, userId: true },
  });
  // Collections are private — a foreign id is indistinguishable from a missing one.
  if (!collection || collection.userId !== userId) {
    throw new ApiError(404, 'Collection not found', 'NOT_FOUND');
  }
  return collection;
}

export async function listCollections(userId: string, cursor: CursorPayload | null, limit: number) {
  const rows = await prisma.collection.findMany({
    where: { AND: [{ userId }, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: collectionInclude,
  });
  const { items, meta } = paginate(rows, limit);
  return { items: items.map(serializeCollection), meta };
}

export async function createCollection(userId: string, name: string) {
  const row = await prisma.collection.create({
    data: { userId, name },
    include: collectionInclude,
  });
  return serializeCollection(row);
}

export async function updateCollection(
  userId: string,
  collectionId: string,
  input: { name?: string }
) {
  await getOwnedCollection(userId, collectionId);
  const row = await prisma.collection.update({
    where: { id: collectionId },
    data: { ...(input.name !== undefined ? { name: input.name } : {}) },
    include: collectionInclude,
  });
  return serializeCollection(row);
}

export async function deleteCollection(userId: string, collectionId: string) {
  await getOwnedCollection(userId, collectionId);
  // SavedPost.collectionId is onDelete: SetNull — the saves survive, merely
  // uncategorized.
  await prisma.collection.delete({ where: { id: collectionId } });
  return { deleted: true };
}

export async function listCollectionPosts(
  userId: string,
  collectionId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  await getOwnedCollection(userId, collectionId);
  const visibility = await savedVisibilityWhere(userId);
  return listSavedGrid({ userId, collectionId }, visibility, cursor, limit);
}
