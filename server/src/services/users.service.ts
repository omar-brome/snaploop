import {
  FollowStatus,
  NotificationTargetType,
  NotificationType,
  Prisma,
  ReportTargetType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { cursorWhere, decodeCursor, paginate } from '../utils/cursor';
import { createNotification } from './notification.service';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const DEFAULT_SUGGESTED_LIMIT = 10;

const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
} satisfies Prisma.UserSelect;

// Own-profile shape: the only place email is ever returned.
const ownProfileSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  bio: true,
  avatarUrl: true,
  websiteUrl: true,
  gender: true,
  isPrivate: true,
  isVerified: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const gridPostInclude = {
  media: { orderBy: { displayOrder: 'asc' }, take: 1 },
  _count: { select: { media: true } },
} satisfies Prisma.PostInclude;

type GridPostRecord = Prisma.PostGetPayload<{ include: typeof gridPostInclude }>;

type FollowStatusString = 'none' | 'pending' | 'accepted';

export interface UpdateProfileInput {
  fullName?: string;
  username?: string;
  bio?: string | null;
  websiteUrl?: string | null;
  avatarUrl?: string | null;
  gender?: string | null;
  isPrivate?: boolean;
}

export interface CreateReportInput {
  targetId: string;
  targetType: ReportTargetType;
  reason: string;
  description?: string;
}

function parseLimit(limitStr: string | undefined, fallback = DEFAULT_LIMIT): number {
  const parsed = parseInt(limitStr ?? String(fallback), 10);
  return Math.min(Number.isNaN(parsed) ? fallback : Math.max(parsed, 1), MAX_LIMIT);
}

function toFollowStatusString(status: FollowStatus | null | undefined): FollowStatusString {
  if (!status) return 'none';
  return status === FollowStatus.ACCEPTED ? 'accepted' : 'pending';
}

function userNotFound() {
  return new ApiError(404, 'User not found', 'USER_NOT_FOUND');
}

// Usernames are stored lowercase; routes lowercase the param before lookup.
async function findActiveUserByUsername(username: string) {
  return prisma.user.findFirst({
    where: { username, isActive: true },
    select: { ...authorSelect, bio: true, websiteUrl: true, isPrivate: true },
  });
}

async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
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

// Profile counters are computed (User has no denormalized count columns):
// archived posts and pending follows never count.
async function getUserCounts(userId: string) {
  const [postCount, followerCount, followingCount] = await Promise.all([
    prisma.post.count({ where: { userId, isArchived: false } }),
    prisma.follow.count({ where: { followingId: userId, status: FollowStatus.ACCEPTED } }),
    prisma.follow.count({ where: { followerId: userId, status: FollowStatus.ACCEPTED } }),
  ]);
  return { postCount, followerCount, followingCount };
}

// Gate for a user's content (posts/reels/tagged/follower lists):
// blocks are mutual invisibility (404, never reveal existence); private
// accounts are 403 PRIVATE_ACCOUNT unless owner or accepted follower.
async function assertContentVisible(
  target: { id: string; isPrivate: boolean },
  viewerId: string | null
): Promise<void> {
  if (viewerId === target.id) return;
  if (viewerId && (await isBlockedEitherWay(viewerId, target.id))) throw userNotFound();
  if (target.isPrivate) {
    const accepted = viewerId
      ? await prisma.follow.findFirst({
          where: { followerId: viewerId, followingId: target.id, status: FollowStatus.ACCEPTED },
          select: { id: true },
        })
      : null;
    if (!accepted) throw new ApiError(403, 'This account is private', 'PRIVATE_ACCOUNT');
  }
}

// requester -> each listed user follow status, in one query.
async function getFollowStatusMap(
  viewerId: string,
  userIds: string[]
): Promise<Map<string, FollowStatus>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.follow.findMany({
    where: { followerId: viewerId, followingId: { in: userIds } },
    select: { followingId: true, status: true },
  });
  return new Map(rows.map((r) => [r.followingId, r.status]));
}

function serializeGridPost(post: GridPostRecord) {
  return {
    id: post.id,
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

// ───────────────────────── Own profile ─────────────────────────

export async function getOwnProfile(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: ownProfileSelect,
  });
  if (!user) throw userNotFound();
  const counts = await getUserCounts(userId);
  return { ...user, ...counts };
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  const me = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, username: true },
  });
  if (!me) throw userNotFound();

  if (input.username !== undefined && input.username !== me.username) {
    const taken = await prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (taken && taken.id !== userId) {
      throw new ApiError(409, 'Username is already taken', 'USERNAME_TAKEN');
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.username !== undefined) data.username = input.username;
  if (input.bio !== undefined) data.bio = input.bio;
  if (input.websiteUrl !== undefined) data.websiteUrl = input.websiteUrl;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.gender !== undefined) data.gender = input.gender;
  if (input.isPrivate !== undefined) data.isPrivate = input.isPrivate;

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: ownProfileSelect,
    });
    const counts = await getUserCounts(userId);
    return { ...updated, ...counts };
  } catch (err) {
    // Unique-constraint race between the pre-check and the update.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError(409, 'Username is already taken', 'USERNAME_TAKEN');
    }
    throw err;
  }
}

// ───────────────────────── Discovery ─────────────────────────

export async function getSuggestedUsers(userId: string, limitStr?: string) {
  const limit = parseLimit(limitStr, DEFAULT_SUGGESTED_LIMIT);
  const [blockedIds, related] = await Promise.all([
    getBlockedUserIds(userId),
    // Exclude anyone already followed or requested (pending counts as taken).
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
  ]);
  const excludedIds = [userId, ...blockedIds, ...related.map((r) => r.followingId)];

  const users = await prisma.user.findMany({
    where: { isActive: true, id: { notIn: excludedIds } },
    orderBy: [{ followers: { _count: 'desc' } }, { createdAt: 'desc' }],
    take: limit,
    select: authorSelect,
  });

  const ids = users.map((u) => u.id);
  const countMap = new Map<string, number>();
  if (ids.length > 0) {
    const counts = await prisma.follow.groupBy({
      by: ['followingId'],
      where: { followingId: { in: ids }, status: FollowStatus.ACCEPTED },
      _count: { _all: true },
    });
    for (const c of counts) countMap.set(c.followingId, c._count._all);
  }

  return users.map((u) => ({
    ...u,
    followerCount: countMap.get(u.id) ?? 0,
    isFollowing: false,
  }));
}

// ───────────────────────── Public profile ─────────────────────────

export async function getPublicProfile(username: string, viewerId: string | null) {
  const user = await findActiveUserByUsername(username);
  if (!user) throw userNotFound();

  const isOwnProfile = viewerId === user.id;
  if (viewerId && !isOwnProfile && (await isBlockedEitherWay(viewerId, user.id))) {
    throw userNotFound();
  }

  let followStatus: FollowStatusString = 'none';
  let followsMe = false;
  if (viewerId && !isOwnProfile) {
    const [outgoing, incoming] = await Promise.all([
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
        select: { status: true },
      }),
      prisma.follow.findFirst({
        where: { followerId: user.id, followingId: viewerId, status: FollowStatus.ACCEPTED },
        select: { id: true },
      }),
    ]);
    followStatus = toFollowStatusString(outgoing?.status);
    followsMe = incoming !== null;
  }

  const counts = await getUserCounts(user.id);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    bio: user.bio,
    websiteUrl: user.websiteUrl,
    isPrivate: user.isPrivate,
    ...counts,
    followStatus,
    followsMe,
    // Blocks in either direction 404 above, so a reachable profile is never blocked.
    isBlocked: false,
    isOwnProfile,
  };
}

// ───────────────────────── Follows ─────────────────────────

export async function followUser(viewerId: string, username: string) {
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();
  if (target.id === viewerId) {
    throw new ApiError(400, 'You cannot follow yourself', 'CANNOT_FOLLOW_SELF');
  }
  if (await isBlockedEitherWay(viewerId, target.id)) throw userNotFound();

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: target.id } },
    select: { status: true },
  });
  // Idempotent: re-following neither duplicates the row nor re-notifies.
  if (existing) return { status: toFollowStatusString(existing.status) };

  const status = target.isPrivate ? FollowStatus.PENDING : FollowStatus.ACCEPTED;
  await prisma.follow.create({
    data: { followerId: viewerId, followingId: target.id, status },
  });

  await createNotification({
    recipientId: target.id,
    senderId: viewerId,
    type: status === FollowStatus.PENDING ? NotificationType.FOLLOW_REQUEST : NotificationType.FOLLOW,
    targetId: viewerId,
    targetType: NotificationTargetType.USER,
  });

  return { status: toFollowStatusString(status) };
}

export async function unfollowUser(viewerId: string, username: string) {
  // No block check: users must always be able to withdraw a follow/request.
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();

  await prisma.$transaction([
    prisma.follow.deleteMany({ where: { followerId: viewerId, followingId: target.id } }),
    // Cancelling a pending request also retracts the stale request notification.
    prisma.notification.deleteMany({
      where: { senderId: viewerId, recipientId: target.id, type: NotificationType.FOLLOW_REQUEST },
    }),
  ]);

  return { status: 'none' as const };
}

export async function removeFollower(userId: string, username: string) {
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();

  await prisma.follow.deleteMany({ where: { followerId: target.id, followingId: userId } });
  return { message: 'Follower removed' };
}

export async function acceptFollowRequest(userId: string, requesterUsername: string) {
  const requester = await findActiveUserByUsername(requesterUsername);
  if (!requester) throw userNotFound();

  const request = await prisma.follow.findFirst({
    where: { followerId: requester.id, followingId: userId, status: FollowStatus.PENDING },
    select: { id: true },
  });
  if (!request) throw new ApiError(404, 'Follow request not found', 'FOLLOW_REQUEST_NOT_FOUND');

  await prisma.follow.update({ where: { id: request.id }, data: { status: FollowStatus.ACCEPTED } });
  await createNotification({
    recipientId: requester.id,
    senderId: userId,
    type: NotificationType.FOLLOW_ACCEPTED,
    targetId: userId,
    targetType: NotificationTargetType.USER,
  });

  return { status: 'accepted' as const };
}

export async function declineFollowRequest(userId: string, requesterUsername: string) {
  const requester = await findActiveUserByUsername(requesterUsername);
  if (!requester) throw userNotFound();

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.follow.deleteMany({
      where: { followerId: requester.id, followingId: userId, status: FollowStatus.PENDING },
    });
    if (deleted.count === 0) {
      throw new ApiError(404, 'Follow request not found', 'FOLLOW_REQUEST_NOT_FOUND');
    }
    await tx.notification.deleteMany({
      where: { senderId: requester.id, recipientId: userId, type: NotificationType.FOLLOW_REQUEST },
    });
  });

  return { message: 'Follow request declined' };
}

export async function getFollowRequests(userId: string, cursorStr?: string, limitStr?: string) {
  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);

  const rows = await prisma.follow.findMany({
    where: {
      AND: [
        { followingId: userId, status: FollowStatus.PENDING, follower: { isActive: true } },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { follower: { select: authorSelect } },
  });

  const { items, meta } = paginate(rows, limit);
  return { items: items.map((r) => r.follower), meta };
}

export async function getFollowers(
  username: string,
  viewerId: string,
  cursorStr?: string,
  limitStr?: string
) {
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();
  await assertContentVisible(target, viewerId);

  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);
  const blockedIds = await getBlockedUserIds(viewerId);

  const rows = await prisma.follow.findMany({
    where: {
      AND: [
        {
          followingId: target.id,
          status: FollowStatus.ACCEPTED,
          follower: { isActive: true, id: { notIn: blockedIds } },
        },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { follower: { select: authorSelect } },
  });

  const { items, meta } = paginate(rows, limit);
  const statusMap = await getFollowStatusMap(
    viewerId,
    items.map((r) => r.follower.id)
  );
  return {
    items: items.map((r) => ({
      ...r.follower,
      isFollowing: statusMap.get(r.follower.id) === FollowStatus.ACCEPTED,
      followStatus: toFollowStatusString(statusMap.get(r.follower.id)),
    })),
    meta,
  };
}

export async function getFollowing(
  username: string,
  viewerId: string,
  cursorStr?: string,
  limitStr?: string
) {
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();
  await assertContentVisible(target, viewerId);

  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);
  const blockedIds = await getBlockedUserIds(viewerId);

  const rows = await prisma.follow.findMany({
    where: {
      AND: [
        {
          followerId: target.id,
          status: FollowStatus.ACCEPTED,
          following: { isActive: true, id: { notIn: blockedIds } },
        },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { following: { select: authorSelect } },
  });

  const { items, meta } = paginate(rows, limit);
  const statusMap = await getFollowStatusMap(
    viewerId,
    items.map((r) => r.following.id)
  );
  return {
    items: items.map((r) => ({
      ...r.following,
      isFollowing: statusMap.get(r.following.id) === FollowStatus.ACCEPTED,
      followStatus: toFollowStatusString(statusMap.get(r.following.id)),
    })),
    meta,
  };
}

// ───────────────────────── Blocks ─────────────────────────

export async function blockUser(userId: string, username: string) {
  // No block 404 here: blocking back someone who already blocked you is allowed.
  const target = await prisma.user.findFirst({
    where: { username, isActive: true },
    select: { id: true },
  });
  if (!target) throw userNotFound();
  if (target.id === userId) {
    throw new ApiError(400, 'You cannot block yourself', 'CANNOT_BLOCK_SELF');
  }

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: target.id } },
      create: { blockerId: userId, blockedId: target.id },
      update: {},
    }),
    // Blocking severs the relationship in both directions, pending included.
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: userId, followingId: target.id },
          { followerId: target.id, followingId: userId },
        ],
      },
    }),
  ]);

  return { isBlocked: true };
}

export async function unblockUser(userId: string, username: string) {
  // Allow unblocking deactivated users so stale block rows can be cleaned up.
  const target = await prisma.user.findFirst({ where: { username }, select: { id: true } });
  if (!target) throw userNotFound();

  await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: target.id } });
  return { isBlocked: false };
}

export async function getBlockedUsers(userId: string, cursorStr?: string, limitStr?: string) {
  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);

  // UserBlock has a composite PK, so keyset-paginate on (createdAt, blockedId).
  const cursorFilter: Prisma.UserBlockWhereInput = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), blockedId: { lt: cursor.id } },
        ],
      }
    : {};

  const rows = await prisma.userBlock.findMany({
    where: { AND: [{ blockerId: userId, blocked: { isActive: true } }, cursorFilter] },
    orderBy: [{ createdAt: 'desc' }, { blockedId: 'desc' }],
    take: limit + 1,
    include: { blocked: { select: authorSelect } },
  });

  const { items, meta } = paginate(
    rows.map((r) => ({ id: r.blockedId, createdAt: r.createdAt, user: r.blocked })),
    limit
  );
  return { items: items.map((r) => r.user), meta };
}

// ───────────────────────── Profile content grids ─────────────────────────

export async function getUserPosts(
  username: string,
  viewerId: string | null,
  cursorStr?: string,
  limitStr?: string
) {
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();
  await assertContentVisible(target, viewerId);

  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);

  const rows = await prisma.post.findMany({
    where: { AND: [{ userId: target.id, isArchived: false }, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: gridPostInclude,
  });

  const { items, meta } = paginate(rows, limit);
  return { items: items.map(serializeGridPost), meta };
}

export async function getUserReels(
  username: string,
  viewerId: string,
  cursorStr?: string,
  limitStr?: string
) {
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();
  await assertContentVisible(target, viewerId);

  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);

  const rows = await prisma.reel.findMany({
    where: { AND: [{ userId: target.id }, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      thumbnailUrl: true,
      likeCount: true,
      commentCount: true,
      viewCount: true,
      createdAt: true,
    },
  });

  const { items, meta } = paginate(rows, limit);
  return {
    items: items.map((reel) => ({
      id: reel.id,
      thumbnailUrl: reel.thumbnailUrl,
      likeCount: reel.likeCount,
      commentCount: reel.commentCount,
      viewCount: reel.viewCount,
    })),
    meta,
  };
}

export async function getUserTagged(
  username: string,
  viewerId: string,
  cursorStr?: string,
  limitStr?: string
) {
  const target = await findActiveUserByUsername(username);
  if (!target) throw userNotFound();
  await assertContentVisible(target, viewerId);

  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);
  const [blockedIds, followingIds] = await Promise.all([
    getBlockedUserIds(viewerId),
    getAcceptedFollowingIds(viewerId),
  ]);

  // Tagged posts come from other authors: each post must also pass the
  // author's own privacy/block rules relative to the requester.
  const baseWhere: Prisma.PostWhereInput = {
    tags: { some: { userId: target.id } },
    isArchived: false,
    user: {
      isActive: true,
      id: { notIn: blockedIds },
      OR: [{ isPrivate: false }, { id: { in: [...followingIds, viewerId] } }],
    },
  };

  const rows = await prisma.post.findMany({
    where: { AND: [baseWhere, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: gridPostInclude,
  });

  const { items, meta } = paginate(rows, limit);
  return { items: items.map(serializeGridPost), meta };
}

// ───────────────────────── Reports ─────────────────────────

export async function createReport(reporterId: string, input: CreateReportInput) {
  const report = await prisma.report.create({
    data: {
      reporterId,
      targetId: input.targetId,
      targetType: input.targetType,
      reason: input.reason,
      description: input.description,
    },
    select: {
      id: true,
      targetId: true,
      targetType: true,
      reason: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });
  return report;
}
