import {
  FollowStatus,
  LikeTargetType,
  NotificationTargetType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { cursorWhere, decodeCursor, paginate } from '../utils/cursor';
import { extractMentions } from '../utils/parse';
import { createNotification, notifyMentions } from './notification.service';

const MAX_REEL_DURATION_SECONDS = 90;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

// Author shape plus the privacy fields the service needs for visibility
// checks; the serializer only ever exposes the public author fields.
const reelAuthorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
  isPrivate: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const reelInclude = { user: { select: reelAuthorSelect } } satisfies Prisma.ReelInclude;

type ReelRecord = Prisma.ReelGetPayload<{ include: typeof reelInclude }>;

export interface CreateReelInput {
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  audioName?: string;
  audioArtist?: string;
  durationSeconds?: number;
}

function serializeReel(reel: ReelRecord, viewer: { isFollowing: boolean; isLiked: boolean }) {
  return {
    id: reel.id,
    videoUrl: reel.videoUrl,
    thumbnailUrl: reel.thumbnailUrl,
    caption: reel.caption,
    audioName: reel.audioName,
    audioArtist: reel.audioArtist,
    durationSeconds: reel.durationSeconds,
    likeCount: reel.likeCount,
    commentCount: reel.commentCount,
    viewCount: reel.viewCount,
    createdAt: reel.createdAt,
    user: {
      id: reel.user.id,
      username: reel.user.username,
      fullName: reel.user.fullName,
      avatarUrl: reel.user.avatarUrl,
      isVerified: reel.user.isVerified,
      isFollowing: viewer.isFollowing,
    },
    isLiked: viewer.isLiked,
  };
}

// Lower score = better: fresh reels rank first, engagement pulls a reel up.
function engagementScore(reel: {
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  viewCount: number;
}): number {
  const ageHours = (Date.now() - reel.createdAt.getTime()) / 36e5;
  const engagement = reel.likeCount + 2 * reel.commentCount + 0.05 * reel.viewCount;
  return ageHours - 0.1 * Math.log(engagement + 1);
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

async function getLikedReelIds(viewerId: string, reelIds: string[]): Promise<Set<string>> {
  if (reelIds.length === 0) return new Set();
  const likes = await prisma.like.findMany({
    where: { userId: viewerId, targetType: LikeTargetType.REEL, targetId: { in: reelIds } },
    select: { targetId: true },
  });
  return new Set(likes.map((l) => l.targetId));
}

// Direct access to hidden content is always a 404 (never reveal existence):
// inactive author, block in either direction, or private-not-following.
async function assertReelVisible(reel: ReelRecord, viewerId: string | null): Promise<void> {
  const notFound = () => new ApiError(404, 'Reel not found', 'NOT_FOUND');
  if (!reel.user.isActive) throw notFound();
  if (viewerId === reel.userId) return;

  if (viewerId) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: reel.userId },
          { blockerId: reel.userId, blockedId: viewerId },
        ],
      },
    });
    if (block) throw notFound();
  }

  if (reel.user.isPrivate) {
    if (!viewerId) throw notFound();
    const follow = await prisma.follow.findFirst({
      where: { followerId: viewerId, followingId: reel.userId, status: FollowStatus.ACCEPTED },
      select: { id: true },
    });
    if (!follow) throw notFound();
  }
}

export async function getReelsFeed(viewerId: string, cursorStr?: string, limitStr?: string) {
  const cursor = decodeCursor(cursorStr);
  const parsed = parseInt(limitStr ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Number.isNaN(parsed) ? DEFAULT_LIMIT : Math.max(parsed, 1), MAX_LIMIT);

  const [blockedIds, followingIds] = await Promise.all([
    getBlockedUserIds(viewerId),
    getAcceptedFollowingIds(viewerId),
  ]);

  const baseWhere: Prisma.ReelWhereInput = {
    user: {
      isActive: true,
      ...(blockedIds.length > 0 ? { id: { notIn: blockedIds } } : {}),
      OR: [{ isPrivate: false }, { id: { in: [...followingIds, viewerId] } }],
    },
  };

  const rows = await prisma.reel.findMany({
    where: { AND: [baseWhere, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: reelInclude,
  });

  // Cursor stays on (createdAt, id); engagement re-ranks within the page only,
  // so pagination remains stable.
  const { items, meta } = paginate(rows, limit);
  const likedSet = await getLikedReelIds(
    viewerId,
    items.map((r) => r.id)
  );
  const followingSet = new Set(followingIds);

  const ranked = [...items].sort((a, b) => engagementScore(a) - engagementScore(b));
  return {
    items: ranked.map((reel) =>
      serializeReel(reel, {
        isFollowing: followingSet.has(reel.userId),
        isLiked: likedSet.has(reel.id),
      })
    ),
    meta,
  };
}

export async function getReelById(reelId: string, viewerId: string | null) {
  const reel = await prisma.reel.findUnique({ where: { id: reelId }, include: reelInclude });
  if (!reel) throw new ApiError(404, 'Reel not found', 'NOT_FOUND');
  await assertReelVisible(reel, viewerId);

  let isFollowing = false;
  let isLiked = false;
  if (viewerId) {
    const [follow, like] = await Promise.all([
      viewerId === reel.userId
        ? Promise.resolve(null)
        : prisma.follow.findFirst({
            where: {
              followerId: viewerId,
              followingId: reel.userId,
              status: FollowStatus.ACCEPTED,
            },
            select: { id: true },
          }),
      prisma.like.findUnique({
        where: {
          userId_targetId_targetType: {
            userId: viewerId,
            targetId: reel.id,
            targetType: LikeTargetType.REEL,
          },
        },
        select: { id: true },
      }),
    ]);
    isFollowing = follow !== null;
    isLiked = like !== null;
  }

  return serializeReel(reel, { isFollowing, isLiked });
}

export async function createReel(userId: string, input: CreateReelInput) {
  if (input.durationSeconds != null && input.durationSeconds > MAX_REEL_DURATION_SECONDS) {
    throw new ApiError(400, 'Reel duration must be 90 seconds or less', 'REEL_TOO_LONG');
  }

  const reel = await prisma.reel.create({
    data: {
      userId,
      videoUrl: input.videoUrl,
      thumbnailUrl: input.thumbnailUrl,
      caption: input.caption,
      audioName: input.audioName,
      audioArtist: input.audioArtist,
      durationSeconds: input.durationSeconds,
    },
    include: reelInclude,
  });

  // Reels get no hashtag rows (post_hashtags is posts-only), but caption
  // @mentions still notify.
  const mentions = extractMentions(reel.caption);
  if (mentions.length > 0) {
    await notifyMentions({
      usernames: mentions,
      senderId: userId,
      type: NotificationType.MENTION_CAPTION,
      targetId: reel.id,
      targetType: NotificationTargetType.REEL,
    });
  }

  return serializeReel(reel, { isFollowing: false, isLiked: false });
}

export async function deleteReel(userId: string, reelId: string) {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    select: { id: true, userId: true },
  });
  if (!reel) throw new ApiError(404, 'Reel not found', 'NOT_FOUND');
  if (reel.userId !== userId) {
    throw new ApiError(403, 'You can only delete your own reels', 'FORBIDDEN');
  }

  await prisma.$transaction(async (tx) => {
    // Likes are polymorphic (no FK cascade): remove rows pointing at the reel
    // and at its comments before the comments cascade away.
    const comments = await tx.comment.findMany({ where: { reelId }, select: { id: true } });
    const commentIds = comments.map((c) => c.id);
    const likeFilters: Prisma.LikeWhereInput[] = [
      { targetType: LikeTargetType.REEL, targetId: reelId },
    ];
    if (commentIds.length > 0) {
      likeFilters.push({ targetType: LikeTargetType.COMMENT, targetId: { in: commentIds } });
    }
    await tx.like.deleteMany({ where: { OR: likeFilters } });
    await tx.notification.deleteMany({
      where: { targetId: reelId, targetType: NotificationTargetType.REEL },
    });
    await tx.reel.delete({ where: { id: reelId } });
  });
}

export async function likeReel(userId: string, reelId: string) {
  const reel = await prisma.reel.findUnique({ where: { id: reelId }, include: reelInclude });
  if (!reel) throw new ApiError(404, 'Reel not found', 'NOT_FOUND');
  await assertReelVisible(reel, userId);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.like.findUnique({
      where: {
        userId_targetId_targetType: {
          userId,
          targetId: reelId,
          targetType: LikeTargetType.REEL,
        },
      },
      select: { id: true },
    });
    // Idempotent: liking twice neither duplicates the row nor the counter.
    if (existing) return { likeCount: reel.likeCount, created: false };

    await tx.like.create({
      data: { userId, targetId: reelId, targetType: LikeTargetType.REEL },
    });
    const updated = await tx.reel.update({
      where: { id: reelId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { likeCount: updated.likeCount, created: true };
  });

  if (result.created) {
    await createNotification({
      recipientId: reel.userId,
      senderId: userId,
      type: NotificationType.LIKE_REEL,
      targetId: reelId,
      targetType: NotificationTargetType.REEL,
    });
  }

  return { isLiked: true, likeCount: result.likeCount };
}

export async function unlikeReel(userId: string, reelId: string) {
  // No visibility check: a user must always be able to withdraw their like,
  // even after losing access to the reel.
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    select: { id: true, likeCount: true },
  });
  if (!reel) throw new ApiError(404, 'Reel not found', 'NOT_FOUND');

  const likeCount = await prisma.$transaction(async (tx) => {
    const deleted = await tx.like.deleteMany({
      where: { userId, targetId: reelId, targetType: LikeTargetType.REEL },
    });
    if (deleted.count === 0) return reel.likeCount;
    const updated = await tx.reel.update({
      where: { id: reelId },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    return Math.max(updated.likeCount, 0);
  });

  return { isLiked: false, likeCount };
}

export async function incrementView(viewerId: string, reelId: string) {
  const reel = await prisma.reel.findUnique({ where: { id: reelId }, include: reelInclude });
  if (!reel) throw new ApiError(404, 'Reel not found', 'NOT_FOUND');
  await assertReelVisible(reel, viewerId);

  // Fire-and-forget semantics: no per-viewer dedup, just bump the counter.
  const updated = await prisma.reel.update({
    where: { id: reelId },
    data: { viewCount: { increment: 1 } },
    select: { viewCount: true },
  });
  return { viewCount: updated.viewCount };
}
