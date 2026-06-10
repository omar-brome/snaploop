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
import { extractMentions } from '../utils/parse';
import { createNotification, notifyMentions } from './notification.service';
import { emitToPost } from '../sockets/index';

// ───────────────────────── Shapes ─────────────────────────

const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

const commentInclude = {
  user: { select: authorSelect },
  _count: { select: { replies: true } },
} satisfies Prisma.CommentInclude;

type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

export interface CommentShape {
  id: string;
  content: string;
  createdAt: Date;
  likeCount: number;
  isPinned: boolean;
  user: { id: string; username: string; fullName: string; avatarUrl: string | null; isVerified: boolean };
  replyCount: number;
  isLiked: boolean;
  parentId: string | null;
  postId: string | null;
  reelId: string | null;
}

function toComment(row: CommentRow, isLiked: boolean): CommentShape {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    likeCount: row.likeCount,
    isPinned: row.isPinned,
    user: row.user,
    replyCount: row._count.replies,
    isLiked,
    parentId: row.parentId,
    postId: row.postId,
    reelId: row.reelId,
  };
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

async function canViewOwnerContent(
  viewerId: string,
  owner: { id: string; isPrivate: boolean; isActive: boolean }
): Promise<boolean> {
  if (!owner.isActive) return false;
  if (owner.id === viewerId) return true;
  if (await isBlockedEitherWay(viewerId, owner.id)) return false;
  if (owner.isPrivate) {
    const follow = await prisma.follow.findFirst({
      where: { followerId: viewerId, followingId: owner.id, status: FollowStatus.ACCEPTED },
    });
    return follow !== null;
  }
  return true;
}

interface TargetRef {
  targetType: 'post' | 'reel';
  id: string;
  ownerId: string;
  commentsOff: boolean;
}

async function getVisibleTarget(
  viewerId: string,
  targetType: 'post' | 'reel',
  targetId: string
): Promise<TargetRef> {
  if (targetType === 'post') {
    const post = await prisma.post.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        userId: true,
        isArchived: true,
        commentsOff: true,
        user: { select: { id: true, isPrivate: true, isActive: true } },
      },
    });
    if (
      !post ||
      (post.isArchived && post.userId !== viewerId) ||
      !(await canViewOwnerContent(viewerId, post.user))
    ) {
      throw new ApiError(404, 'Post not found', 'NOT_FOUND');
    }
    return { targetType: 'post', id: post.id, ownerId: post.userId, commentsOff: post.commentsOff };
  }

  const reel = await prisma.reel.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, isPrivate: true, isActive: true } },
    },
  });
  if (!reel || !(await canViewOwnerContent(viewerId, reel.user))) {
    throw new ApiError(404, 'Reel not found', 'NOT_FOUND');
  }
  return { targetType: 'reel', id: reel.id, ownerId: reel.userId, commentsOff: false };
}

const commentTargetInclude = {
  user: { select: { id: true, isActive: true } },
  post: {
    select: {
      id: true,
      userId: true,
      isArchived: true,
      user: { select: { id: true, isPrivate: true, isActive: true } },
    },
  },
  reel: {
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, isPrivate: true, isActive: true } },
    },
  },
} satisfies Prisma.CommentInclude;

type CommentWithTarget = Prisma.CommentGetPayload<{ include: typeof commentTargetInclude }>;

// Resolves a comment and enforces every visibility rule (author active, no
// mutual block, target post/reel visible). 404 on any failure so blocked
// users cannot probe for existence.
async function getVisibleComment(
  viewerId: string,
  commentId: string
): Promise<{ comment: CommentWithTarget; contentOwnerId: string }> {
  const notFound = () => new ApiError(404, 'Comment not found', 'NOT_FOUND');
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: commentTargetInclude,
  });
  if (!comment || !comment.user.isActive) throw notFound();
  if (await isBlockedEitherWay(viewerId, comment.userId)) throw notFound();

  const owner = comment.post?.user ?? comment.reel?.user;
  if (!owner) throw notFound();
  if (comment.post?.isArchived && comment.post.userId !== viewerId) throw notFound();
  if (!(await canViewOwnerContent(viewerId, owner))) throw notFound();

  const contentOwnerId = comment.post?.userId ?? comment.reel?.userId;
  if (!contentOwnerId) throw notFound();
  return { comment, contentOwnerId };
}

// Users invisible to the viewer (block in either direction) — their comments
// are filtered out of every list.
async function getExcludedUserIds(viewerId: string): Promise<string[]> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const b of blocks) ids.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
  return [...ids];
}

async function getLikedSet(viewerId: string, commentIds: string[]): Promise<Set<string>> {
  if (commentIds.length === 0) return new Set();
  const likes = await prisma.like.findMany({
    where: {
      userId: viewerId,
      targetType: LikeTargetType.COMMENT,
      targetId: { in: commentIds },
    },
    select: { targetId: true },
  });
  return new Set(likes.map((l) => l.targetId));
}

// Ascending keyset (replies are listed oldest-first); mirror of cursorWhere.
function cursorWhereAsc(cursor: CursorPayload | null): Prisma.CommentWhereInput {
  if (!cursor) return {};
  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: cursor.id } }],
  };
}

async function shapeWithLikes(viewerId: string, rows: CommentRow[]): Promise<CommentShape[]> {
  const likedSet = await getLikedSet(
    viewerId,
    rows.map((r) => r.id)
  );
  return rows.map((r) => toComment(r, likedSet.has(r.id)));
}

// ───────────────────────── Lists ─────────────────────────

export async function listComments(
  viewerId: string,
  opts: {
    targetType: 'post' | 'reel';
    targetId: string;
    cursor: CursorPayload | null;
    limit: number;
  }
) {
  const target = await getVisibleTarget(viewerId, opts.targetType, opts.targetId);
  const excluded = await getExcludedUserIds(viewerId);

  const baseWhere: Prisma.CommentWhereInput = {
    parentId: null,
    user: { isActive: true },
    ...(excluded.length > 0 ? { userId: { notIn: excluded } } : {}),
    ...(target.targetType === 'post' ? { postId: target.id } : { reelId: target.id }),
  };

  // Pinned comments ride on the first page only (they are few), keeping the
  // keyset cursor stable on the unpinned newest-first stream.
  let pinned: CommentRow[] = [];
  if (!opts.cursor) {
    pinned = await prisma.comment.findMany({
      where: { ...baseWhere, isPinned: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: commentInclude,
    });
  }

  const rows = await prisma.comment.findMany({
    where: { AND: [{ ...baseWhere, isPinned: false }, cursorWhere(opts.cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    include: commentInclude,
  });
  const { items, meta } = paginate(rows, opts.limit);

  return { items: await shapeWithLikes(viewerId, [...pinned, ...items]), meta };
}

export async function listReplies(
  viewerId: string,
  commentId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  const { comment } = await getVisibleComment(viewerId, commentId);
  const excluded = await getExcludedUserIds(viewerId);

  const rows = await prisma.comment.findMany({
    where: {
      AND: [
        {
          parentId: comment.id,
          user: { isActive: true },
          ...(excluded.length > 0 ? { userId: { notIn: excluded } } : {}),
        },
        cursorWhereAsc(cursor),
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    include: commentInclude,
  });
  const { items, meta } = paginate(rows, limit);

  return { items: await shapeWithLikes(viewerId, items), meta };
}

// ───────────────────────── Create ─────────────────────────

export async function createComment(
  viewerId: string,
  input: { targetType: 'post' | 'reel'; targetId: string; content: string; parentId?: string }
): Promise<CommentShape> {
  const target = await getVisibleTarget(viewerId, input.targetType, input.targetId);
  if (target.commentsOff) {
    throw new ApiError(403, 'Comments are turned off for this post', 'COMMENTS_OFF');
  }

  // Validate the reply target; one-level nesting means a reply to a reply
  // attaches to the top-level parent, but the notification still goes to the
  // author of the comment actually replied to.
  let parent: { id: string; userId: string; parentId: string | null } | null = null;
  if (input.parentId) {
    const parentRow = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: {
        id: true,
        userId: true,
        parentId: true,
        postId: true,
        reelId: true,
        user: { select: { isActive: true } },
      },
    });
    const belongsToTarget =
      parentRow !== null &&
      (target.targetType === 'post' ? parentRow.postId === target.id : parentRow.reelId === target.id);
    if (
      !parentRow ||
      !belongsToTarget ||
      !parentRow.user.isActive ||
      (await isBlockedEitherWay(viewerId, parentRow.userId))
    ) {
      throw new ApiError(404, 'Parent comment not found', 'NOT_FOUND');
    }
    parent = parentRow;
  }
  const effectiveParentId = parent ? (parent.parentId ?? parent.id) : null;

  const row = await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        content: input.content,
        userId: viewerId,
        postId: target.targetType === 'post' ? target.id : null,
        reelId: target.targetType === 'reel' ? target.id : null,
        parentId: effectiveParentId,
      },
      include: commentInclude,
    });
    if (target.targetType === 'post') {
      await tx.post.update({
        where: { id: target.id },
        data: { commentCount: { increment: 1 } },
      });
    } else {
      await tx.reel.update({
        where: { id: target.id },
        data: { commentCount: { increment: 1 } },
      });
    }
    return comment;
  });

  // Notifications (createNotification drops self-notifications).
  if (parent) {
    await createNotification({
      recipientId: parent.userId,
      senderId: viewerId,
      type: NotificationType.COMMENT_REPLY,
      targetId: row.id,
      targetType: NotificationTargetType.COMMENT,
    });
  }
  if (!parent || parent.userId !== target.ownerId) {
    await createNotification({
      recipientId: target.ownerId,
      senderId: viewerId,
      type:
        target.targetType === 'post' ? NotificationType.COMMENT_POST : NotificationType.COMMENT_REEL,
      targetId: target.id,
      targetType:
        target.targetType === 'post' ? NotificationTargetType.POST : NotificationTargetType.REEL,
    });
  }
  await notifyMentions({
    usernames: extractMentions(input.content),
    senderId: viewerId,
    type: NotificationType.MENTION_COMMENT,
    targetId: row.id,
    targetType: NotificationTargetType.COMMENT,
  });

  const shaped = toComment(row, false);
  // Live comments for clients viewing the content detail page (room post:<id>;
  // reel detail pages join the same room keyed by the reel id).
  emitToPost(target.id, 'new_comment', shaped);
  return shaped;
}

// ───────────────────────── Delete ─────────────────────────

export async function deleteComment(viewerId: string, commentId: string) {
  const { comment, contentOwnerId } = await getVisibleComment(viewerId, commentId);
  if (comment.userId !== viewerId && contentOwnerId !== viewerId) {
    throw new ApiError(403, 'Not allowed to delete this comment', 'FORBIDDEN');
  }

  await prisma.$transaction(async (tx) => {
    // Top-level deletions take their replies with them (DB cascade), so the
    // denormalized count must drop by 1 + replies.
    const replyIds = comment.parentId
      ? []
      : (
          await tx.comment.findMany({ where: { parentId: comment.id }, select: { id: true } })
        ).map((r) => r.id);
    const removed = 1 + replyIds.length;

    await tx.like.deleteMany({
      where: { targetType: LikeTargetType.COMMENT, targetId: { in: [comment.id, ...replyIds] } },
    });
    await tx.comment.delete({ where: { id: comment.id } });

    if (comment.postId) {
      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: removed } },
      });
    } else if (comment.reelId) {
      await tx.reel.update({
        where: { id: comment.reelId },
        data: { commentCount: { decrement: removed } },
      });
    }
  });

  return { deleted: true };
}

// ───────────────────────── Like / unlike ─────────────────────────

export async function likeComment(viewerId: string, commentId: string) {
  const { comment } = await getVisibleComment(viewerId, commentId);

  const existing = await prisma.like.findUnique({
    where: {
      userId_targetId_targetType: {
        userId: viewerId,
        targetId: comment.id,
        targetType: LikeTargetType.COMMENT,
      },
    },
  });
  if (existing) {
    return { id: comment.id, likeCount: comment.likeCount, isLiked: true };
  }

  const [, updated] = await prisma.$transaction([
    prisma.like.create({
      data: { userId: viewerId, targetId: comment.id, targetType: LikeTargetType.COMMENT },
    }),
    prisma.comment.update({
      where: { id: comment.id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    }),
  ]);

  await createNotification({
    recipientId: comment.userId,
    senderId: viewerId,
    type: NotificationType.LIKE_COMMENT,
    targetId: comment.id,
    targetType: NotificationTargetType.COMMENT,
  });

  return { id: comment.id, likeCount: updated.likeCount, isLiked: true };
}

export async function unlikeComment(viewerId: string, commentId: string) {
  const { comment } = await getVisibleComment(viewerId, commentId);

  const likeCount = await prisma.$transaction(async (tx) => {
    const deleted = await tx.like.deleteMany({
      where: { userId: viewerId, targetId: comment.id, targetType: LikeTargetType.COMMENT },
    });
    if (deleted.count === 0) return comment.likeCount;
    const updated = await tx.comment.update({
      where: { id: comment.id },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    return updated.likeCount;
  });

  return { id: comment.id, likeCount, isLiked: false };
}

// ───────────────────────── Pin / unpin ─────────────────────────

export async function setPinned(
  viewerId: string,
  commentId: string,
  pinned: boolean
): Promise<CommentShape> {
  const { comment, contentOwnerId } = await getVisibleComment(viewerId, commentId);
  if (contentOwnerId !== viewerId) {
    throw new ApiError(403, 'Only the content owner can pin comments', 'FORBIDDEN');
  }
  if (comment.parentId) {
    throw new ApiError(400, 'Only top-level comments can be pinned', 'TOP_LEVEL_ONLY');
  }

  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { isPinned: pinned },
    include: commentInclude,
  });
  const likedSet = await getLikedSet(viewerId, [comment.id]);
  return toComment(updated, likedSet.has(comment.id));
}
