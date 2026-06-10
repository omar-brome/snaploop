import { MediaType, MessageType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { CursorPayload, cursorWhere, paginate } from '../utils/cursor';
import { emitToConversation, emitToUser, isUserOnline } from '../sockets/index';

// ───────────────────────── Shapes ─────────────────────────

const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

export interface AuthorShape {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

const messageInclude = {
  sender: { select: authorSelect },
  sharedPost: {
    select: {
      id: true,
      likeCount: true,
      commentCount: true,
      user: { select: authorSelect },
      media: {
        orderBy: { displayOrder: 'asc' },
        take: 1,
        select: {
          id: true,
          mediaUrl: true,
          mediaType: true,
          width: true,
          height: true,
          thumbnailUrl: true,
          displayOrder: true,
        },
      },
      _count: { select: { media: true } },
    },
  },
  sharedReel: { select: { id: true, thumbnailUrl: true, user: { select: authorSelect } } },
  replyTo: { select: { id: true, content: true, sender: { select: authorSelect } } },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const conversationInclude = {
  participants: { include: { user: { select: authorSelect } } },
  messages: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    include: messageInclude,
  },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

interface GridMediaShape {
  id: string;
  mediaUrl: string;
  mediaType: MediaType;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  displayOrder: number;
}

export interface MessageShape {
  id: string;
  conversationId: string;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  mediaType: MediaType | null;
  sharedPost: {
    id: string;
    likeCount: number;
    commentCount: number;
    mediaCount: number;
    media: GridMediaShape[];
    user: AuthorShape;
  } | null;
  sharedReel: { id: string; thumbnailUrl: string | null; user: AuthorShape } | null;
  replyTo: { id: string; content: string | null; sender: AuthorShape } | null;
  reactions: Record<string, string[]> | null;
  isDeleted: boolean;
  createdAt: Date;
  sender: AuthorShape;
  seenBy: string[];
}

export interface ConversationParticipantShape extends AuthorShape {
  lastReadAt: Date | null;
  isOnline: boolean;
}

export interface ConversationShape {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatarUrl: string | null;
  participants: ConversationParticipantShape[];
  lastMessage: MessageShape | null;
  unreadCount: number;
  updatedAt: Date;
}

type ParticipantRead = { userId: string; lastReadAt: Date | null };

function serializeMessage(row: MessageRow, participants: ParticipantRead[]): MessageShape {
  return {
    id: row.id,
    conversationId: row.conversationId,
    type: row.type,
    // Deleted messages keep their row (so threads keep order) but never leak
    // their original content.
    content: row.isDeleted ? null : row.content,
    mediaUrl: row.isDeleted ? null : row.mediaUrl,
    mediaType: row.mediaType,
    sharedPost: row.sharedPost
      ? {
          id: row.sharedPost.id,
          likeCount: row.sharedPost.likeCount,
          commentCount: row.sharedPost.commentCount,
          mediaCount: row.sharedPost._count.media,
          media: row.sharedPost.media,
          user: row.sharedPost.user,
        }
      : null,
    sharedReel: row.sharedReel,
    replyTo: row.replyTo,
    reactions: (row.reactions as Record<string, string[]> | null) ?? null,
    isDeleted: row.isDeleted,
    createdAt: row.createdAt,
    sender: row.sender,
    seenBy: participants
      .filter(
        (p) => p.userId !== row.senderId && p.lastReadAt !== null && p.lastReadAt >= row.createdAt
      )
      .map((p) => p.userId),
  };
}

function unreadWhere(
  me: string,
  conversationId: string,
  lastReadAt: Date | null
): Prisma.MessageWhereInput {
  return {
    conversationId,
    isDeleted: false,
    senderId: { not: me },
    ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
  };
}

async function serializeConversations(
  me: string,
  rows: ConversationRow[]
): Promise<ConversationShape[]> {
  // One presence lookup per distinct user across the page.
  const userIds = [...new Set(rows.flatMap((r) => r.participants.map((p) => p.userId)))];
  const onlineEntries = await Promise.all(
    userIds.map(async (id) => [id, await isUserOnline(id)] as const)
  );
  const onlineMap = new Map(onlineEntries);

  const unreadCounts = await Promise.all(
    rows.map((r) => {
      const mine = r.participants.find((p) => p.userId === me);
      return prisma.message.count({ where: unreadWhere(me, r.id, mine?.lastReadAt ?? null) });
    })
  );

  return rows.map((r, i) => ({
    id: r.id,
    isGroup: r.isGroup,
    groupName: r.groupName,
    groupAvatarUrl: r.groupAvatarUrl,
    participants: r.participants.map((p) => ({
      ...p.user,
      lastReadAt: p.lastReadAt,
      isOnline: onlineMap.get(p.userId) ?? false,
    })),
    lastMessage: r.messages[0] ? serializeMessage(r.messages[0], r.participants) : null,
    unreadCount: unreadCounts[i] ?? 0,
    updatedAt: r.updatedAt,
  }));
}

async function serializeConversation(me: string, row: ConversationRow): Promise<ConversationShape> {
  const [shaped] = await serializeConversations(me, [row]);
  return shaped as ConversationShape;
}

// ───────────────────────── updatedAt keyset pagination ─────────────────────────
// Conversations are ordered by recent activity (updatedAt), not creation time,
// so the shared createdAt cursor helpers do not apply. Same encoding scheme.

interface UpdatedAtCursor {
  updatedAt: string; // ISO timestamp
  id: string;
}

function encodeUpdatedAtCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id })).toString(
    'base64url'
  );
}

function decodeUpdatedAtCursor(cursor: string | undefined | null): UpdatedAtCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed.updatedAt === 'string' && typeof parsed.id === 'string') {
      return parsed as UpdatedAtCursor;
    }
    return null;
  } catch {
    return null;
  }
}

function updatedAtCursorWhere(cursor: UpdatedAtCursor | null): Prisma.ConversationWhereInput {
  if (!cursor) return {};
  const updatedAt = new Date(cursor.updatedAt);
  return {
    OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }],
  };
}

function paginateByUpdatedAt<T extends { id: string; updatedAt: Date }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page,
    meta: {
      nextCursor: hasMore && last ? encodeUpdatedAtCursor(last.updatedAt, last.id) : null,
      hasMore,
    },
  };
}

// ───────────────────────── Membership ─────────────────────────

async function requireParticipant(me: string, conversationId: string): Promise<ConversationRow> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });
  if (!conversation) throw new ApiError(404, 'Conversation not found', 'NOT_FOUND');
  if (!conversation.participants.some((p) => p.userId === me)) {
    throw new ApiError(403, 'You are not a participant of this conversation', 'NOT_PARTICIPANT');
  }
  return conversation;
}

async function assertNoBlocks(me: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: me, blockedId: { in: userIds } },
        { blockedId: me, blockerId: { in: userIds } },
      ],
    },
  });
  if (block) throw new ApiError(403, 'You cannot message this user', 'BLOCKED');
}

async function assertUsersExist(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true },
  });
  if (users.length !== userIds.length) {
    throw new ApiError(404, 'One or more users were not found', 'NOT_FOUND');
  }
}

// ───────────────────────── Conversations ─────────────────────────

export async function listConversations(me: string, rawCursor: string | undefined, limit: number) {
  const cursor = decodeUpdatedAtCursor(rawCursor);
  const rows = await prisma.conversation.findMany({
    where: { AND: [{ participants: { some: { userId: me } } }, updatedAtCursorWhere(cursor)] },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: conversationInclude,
  });
  const { items, meta } = paginateByUpdatedAt(rows, limit);
  return { items: await serializeConversations(me, items), meta };
}

export async function createConversation(
  me: string,
  input: { participantIds: string[]; isGroup?: boolean; groupName?: string }
): Promise<{ conversation: ConversationShape; reused: boolean }> {
  const others = [...new Set(input.participantIds)].filter((id) => id !== me);
  if (others.length === 0) {
    throw new ApiError(400, 'At least one other participant is required', 'INVALID_PARTICIPANTS');
  }

  const isGroup = input.isGroup === true;
  const groupName = input.groupName?.trim();
  if (isGroup) {
    if (!groupName) {
      throw new ApiError(400, 'groupName is required for group conversations', 'GROUP_NAME_REQUIRED');
    }
    if (others.length < 2) {
      throw new ApiError(
        400,
        'Group conversations need at least two other participants',
        'INVALID_PARTICIPANTS'
      );
    }
  } else if (others.length !== 1) {
    throw new ApiError(
      400,
      'Direct conversations have exactly one other participant',
      'INVALID_PARTICIPANTS'
    );
  }

  await assertUsersExist(others);
  await assertNoBlocks(me, others);

  if (!isGroup) {
    const other = others[0] as string;
    // Reuse the existing 1:1 thread: both users present and nobody else.
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: me } } },
          { participants: { some: { userId: other } } },
          { participants: { every: { userId: { in: [me, other] } } } },
        ],
      },
      include: conversationInclude,
    });
    if (existing) {
      return { conversation: await serializeConversation(me, existing), reused: true };
    }
  }

  const row = await prisma.conversation.create({
    data: {
      isGroup,
      groupName: isGroup ? (groupName as string) : null,
      createdById: me,
      participants: { create: [me, ...others].map((userId) => ({ userId })) },
    },
    include: conversationInclude,
  });
  return { conversation: await serializeConversation(me, row), reused: false };
}

export async function getConversation(me: string, conversationId: string): Promise<ConversationShape> {
  const row = await requireParticipant(me, conversationId);
  return serializeConversation(me, row);
}

export async function updateConversation(
  me: string,
  conversationId: string,
  input: { groupName?: string; groupAvatarUrl?: string }
): Promise<ConversationShape> {
  const row = await requireParticipant(me, conversationId);
  if (!row.isGroup) {
    throw new ApiError(400, 'Only group conversations can be updated', 'GROUPS_ONLY');
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ...(input.groupName !== undefined ? { groupName: input.groupName } : {}),
      ...(input.groupAvatarUrl !== undefined ? { groupAvatarUrl: input.groupAvatarUrl } : {}),
    },
    include: conversationInclude,
  });
  return serializeConversation(me, updated);
}

export async function addParticipants(
  me: string,
  conversationId: string,
  userIds: string[]
): Promise<ConversationShape> {
  const row = await requireParticipant(me, conversationId);
  if (!row.isGroup) {
    throw new ApiError(400, 'Participants can only be added to group conversations', 'GROUPS_ONLY');
  }

  const existing = new Set(row.participants.map((p) => p.userId));
  const toAdd = [...new Set(userIds)].filter((id) => !existing.has(id));
  if (toAdd.length === 0) return serializeConversation(me, row);

  await assertUsersExist(toAdd);
  await assertNoBlocks(me, toAdd);

  await prisma.conversationParticipant.createMany({
    data: toAdd.map((userId) => ({ conversationId, userId })),
    skipDuplicates: true,
  });
  const updated = await requireParticipant(me, conversationId);
  return serializeConversation(me, updated);
}

export async function removeParticipant(me: string, conversationId: string, userId: string) {
  const row = await requireParticipant(me, conversationId);
  if (!row.isGroup) {
    throw new ApiError(
      400,
      'Participants can only be removed from group conversations',
      'GROUPS_ONLY'
    );
  }
  if (userId !== me && row.createdById !== me) {
    throw new ApiError(
      403,
      'Only the conversation creator can remove other participants',
      'FORBIDDEN'
    );
  }
  const target = row.participants.find((p) => p.userId === userId);
  if (!target) throw new ApiError(404, 'Participant not found', 'NOT_FOUND');

  await prisma.conversationParticipant.delete({ where: { id: target.id } });
  return { removed: true };
}

// ───────────────────────── Messages ─────────────────────────

export async function listMessages(
  me: string,
  conversationId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  const conversation = await requireParticipant(me, conversationId);
  const rows = await prisma.message.findMany({
    where: { AND: [{ conversationId }, cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: messageInclude,
  });
  const { items, meta } = paginate(rows, limit);
  return { items: items.map((m) => serializeMessage(m, conversation.participants)), meta };
}

export interface SendMessageInput {
  type?: MessageType;
  content?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  sharedPostId?: string;
  sharedReelId?: string;
  replyToId?: string;
}

export async function sendMessage(
  me: string,
  conversationId: string,
  input: SendMessageInput
): Promise<MessageShape> {
  const conversation = await requireParticipant(me, conversationId);

  if (input.sharedPostId) {
    const post = await prisma.post.findUnique({
      where: { id: input.sharedPostId },
      select: { id: true },
    });
    if (!post) throw new ApiError(404, 'Shared post not found', 'NOT_FOUND');
  }
  if (input.sharedReelId) {
    const reel = await prisma.reel.findUnique({
      where: { id: input.sharedReelId },
      select: { id: true },
    });
    if (!reel) throw new ApiError(404, 'Shared reel not found', 'NOT_FOUND');
  }
  if (input.replyToId) {
    const replyTo = await prisma.message.findUnique({
      where: { id: input.replyToId },
      select: { id: true, conversationId: true },
    });
    if (!replyTo || replyTo.conversationId !== conversationId) {
      throw new ApiError(400, 'Reply target is not in this conversation', 'INVALID_REPLY');
    }
  }

  const type =
    input.type ??
    (input.sharedPostId
      ? MessageType.SHARED_POST
      : input.sharedReelId
        ? MessageType.SHARED_REEL
        : input.mediaUrl
          ? input.mediaType === MediaType.VIDEO
            ? MessageType.VIDEO
            : MessageType.IMAGE
          : MessageType.TEXT);

  // New activity moves the conversation to the top of everyone's inbox.
  const [row] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId: me,
        type,
        content: input.content ?? null,
        mediaUrl: input.mediaUrl ?? null,
        mediaType: input.mediaType ?? null,
        sharedPostId: input.sharedPostId ?? null,
        sharedReelId: input.sharedReelId ?? null,
        replyToId: input.replyToId ?? null,
      },
      include: messageInclude,
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);

  const shaped = serializeMessage(row, conversation.participants);
  emitToConversation(conversationId, 'new_message', shaped);
  for (const p of conversation.participants) emitToUser(p.userId, 'new_message', shaped);
  return shaped;
}

export async function markRead(me: string, conversationId: string) {
  await requireParticipant(me, conversationId);
  const lastReadAt = new Date();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: me } },
    data: { lastReadAt },
  });
  emitToConversation(conversationId, 'messages_seen', { conversationId, userId: me, lastReadAt });
  return { conversationId, lastReadAt };
}

export async function deleteMessage(me: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      senderId: true,
      conversationId: true,
      isDeleted: true,
      conversation: { select: { participants: { select: { userId: true } } } },
    },
  });
  if (!message) throw new ApiError(404, 'Message not found', 'NOT_FOUND');
  if (message.senderId !== me) {
    throw new ApiError(403, 'Only the sender can delete a message', 'FORBIDDEN');
  }

  if (!message.isDeleted) {
    await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null, mediaUrl: null },
    });
  }

  const payload = { messageId, conversationId: message.conversationId };
  emitToConversation(message.conversationId, 'message_deleted', payload);
  for (const p of message.conversation.participants) {
    emitToUser(p.userId, 'message_deleted', payload);
  }
  return { ...payload, isDeleted: true };
}

export async function toggleReaction(me: string, messageId: string, emoji: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      conversationId: true,
      reactions: true,
      conversation: { select: { participants: { select: { userId: true } } } },
    },
  });
  if (!message) throw new ApiError(404, 'Message not found', 'NOT_FOUND');
  if (!message.conversation.participants.some((p) => p.userId === me)) {
    throw new ApiError(403, 'You are not a participant of this conversation', 'NOT_PARTICIPANT');
  }

  const current = (message.reactions as Record<string, string[]> | null) ?? {};
  const next: Record<string, string[]> = { ...current };
  const list = next[emoji] ?? [];
  if (list.includes(me)) {
    const remaining = list.filter((id) => id !== me);
    if (remaining.length > 0) next[emoji] = remaining;
    else delete next[emoji];
  } else {
    next[emoji] = [...list, me];
  }

  const reactions = Object.keys(next).length > 0 ? next : null;
  await prisma.message.update({
    where: { id: messageId },
    data: { reactions: reactions ?? Prisma.DbNull },
  });

  const payload = { messageId, conversationId: message.conversationId, reactions };
  emitToConversation(message.conversationId, 'message_reaction', payload);
  for (const p of message.conversation.participants) {
    emitToUser(p.userId, 'message_reaction', payload);
  }
  return payload;
}

// ───────────────────────── Unread total ─────────────────────────

export async function getUnreadTotal(me: string): Promise<{ count: number }> {
  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId: me },
    select: { conversationId: true, lastReadAt: true },
  });
  // A conversation counts once no matter how many unread messages it holds —
  // an existence probe per membership is enough.
  const flags = await Promise.all(
    memberships.map((m) =>
      prisma.message.findFirst({
        where: unreadWhere(me, m.conversationId, m.lastReadAt),
        select: { id: true },
      })
    )
  );
  return { count: flags.filter((f) => f !== null).length };
}
