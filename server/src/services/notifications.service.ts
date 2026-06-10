import { NotificationType, NotificationTargetType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { CursorPayload, cursorWhere, paginate } from '../utils/cursor';

const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

export const ALL_NOTIFICATION_TYPES = Object.values(NotificationType);

export type NotificationPreferences = Record<NotificationType, boolean>;

const prefsKey = (userId: string) => `notifprefs:${userId}`;

// ── Preferences (Redis hash notifprefs:<userId>, '1'/'0' per type) ──────────

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const stored = await redis.hgetall(prefsKey(userId));
  const prefs = {} as NotificationPreferences;
  for (const type of ALL_NOTIFICATION_TYPES) {
    // Default: every type enabled until the user opts out.
    prefs[type] = stored[type] === undefined ? true : stored[type] === '1';
  }
  return prefs;
}

export async function updatePreferences(
  userId: string,
  updates: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const fields: Record<string, string> = {};
  for (const type of ALL_NOTIFICATION_TYPES) {
    const value = updates[type];
    if (typeof value === 'boolean') fields[type] = value ? '1' : '0';
  }
  if (Object.keys(fields).length > 0) {
    await redis.hset(prefsKey(userId), fields);
  }
  return getPreferences(userId);
}

// ── Visibility helpers ───────────────────────────────────────────────────────

// Users hidden from the recipient: anyone blocked in either direction.
async function hiddenSenderIds(userId: string): Promise<string[]> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const b of blocks) ids.add(b.blockerId === userId ? b.blockedId : b.blockerId);
  return [...ids];
}

async function visibleWhere(userId: string): Promise<Prisma.NotificationWhereInput> {
  const [prefs, blockedIds] = await Promise.all([getPreferences(userId), hiddenSenderIds(userId)]);
  const enabledTypes = ALL_NOTIFICATION_TYPES.filter((t) => prefs[t]);
  return {
    recipientId: userId,
    type: { in: enabledTypes },
    ...(blockedIds.length > 0 ? { senderId: { notIn: blockedIds } } : {}),
    sender: { isActive: true },
  };
}

// ── Preview thumbnails (batch-fetched to avoid N+1) ─────────────────────────

async function fetchPostThumbnails(postIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (postIds.length === 0) return map;
  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    select: {
      id: true,
      media: {
        orderBy: { displayOrder: 'asc' },
        take: 1,
        select: { thumbnailUrl: true, mediaUrl: true },
      },
    },
  });
  for (const post of posts) {
    const first = post.media[0];
    const thumb = first?.thumbnailUrl ?? first?.mediaUrl;
    if (thumb) map.set(post.id, thumb);
  }
  return map;
}

async function fetchReelThumbnails(reelIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (reelIds.length === 0) return map;
  const reels = await prisma.reel.findMany({
    where: { id: { in: reelIds } },
    select: { id: true, thumbnailUrl: true },
  });
  for (const reel of reels) {
    if (reel.thumbnailUrl) map.set(reel.id, reel.thumbnailUrl);
  }
  return map;
}

// ── List ─────────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: NotificationType;
  targetId: string | null;
  targetType: NotificationTargetType | null;
  isRead: boolean;
  createdAt: Date;
  sender: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
  preview?: { thumbnailUrl: string };
}

export async function listNotifications(
  userId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  const baseWhere = await visibleWhere(userId);

  const rows = await prisma.notification.findMany({
    where: { AND: [baseWhere, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { sender: { select: authorSelect } },
  });

  const { items, meta } = paginate(rows, limit);

  const postIds = [
    ...new Set(
      items
        .filter((n) => n.targetType === NotificationTargetType.POST && n.targetId)
        .map((n) => n.targetId as string)
    ),
  ];
  const reelIds = [
    ...new Set(
      items
        .filter((n) => n.targetType === NotificationTargetType.REEL && n.targetId)
        .map((n) => n.targetId as string)
    ),
  ];

  const [postThumbs, reelThumbs] = await Promise.all([
    fetchPostThumbnails(postIds),
    fetchReelThumbnails(reelIds),
  ]);

  const shaped: NotificationItem[] = items.map((n) => {
    let thumbnailUrl: string | undefined;
    if (n.targetId && n.targetType === NotificationTargetType.POST) {
      thumbnailUrl = postThumbs.get(n.targetId);
    } else if (n.targetId && n.targetType === NotificationTargetType.REEL) {
      thumbnailUrl = reelThumbs.get(n.targetId);
    }
    return {
      id: n.id,
      type: n.type,
      targetId: n.targetId,
      targetType: n.targetType,
      isRead: n.isRead,
      createdAt: n.createdAt,
      sender: n.sender,
      ...(thumbnailUrl ? { preview: { thumbnailUrl } } : {}),
    };
  });

  return { items: shaped, meta };
}

// ── Unread count (same visibility filters as the list so the badge matches) ──

export async function getUnreadCount(userId: string): Promise<number> {
  const baseWhere = await visibleWhere(userId);
  return prisma.notification.count({ where: { ...baseWhere, isRead: false } });
}

// ── Mark read ────────────────────────────────────────────────────────────────

// ids omitted = mark all; ids: [] = no-op (marks exactly those zero ids).
export async function markRead(userId: string, ids?: string[]): Promise<number> {
  const where: Prisma.NotificationWhereInput =
    ids === undefined
      ? { recipientId: userId, isRead: false }
      : { recipientId: userId, isRead: false, id: { in: ids } };
  const result = await prisma.notification.updateMany({ where, data: { isRead: true } });
  return result.count;
}
