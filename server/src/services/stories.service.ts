import { FollowStatus, MediaType, MessageType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { decodeCursor, encodeCursor } from '../utils/cursor';
import { emitToUser } from '../sockets/index';

const STORY_TTL_HOURS = 24;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

// Author shape plus the privacy fields the service needs for visibility
// checks; the serializer only ever exposes the public author fields.
const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
  isPrivate: true,
  isActive: true,
} satisfies Prisma.UserSelect;

type AuthorRecord = Prisma.UserGetPayload<{ select: typeof authorSelect }>;

export interface CreateStoryInput {
  mediaUrl: string;
  mediaType: MediaType;
  durationSeconds?: number;
  caption?: string;
  stickerData?: unknown;
}

interface SerializableStory {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: MediaType;
  durationSeconds: number | null;
  caption: string | null;
  stickerData: Prisma.JsonValue | null;
  viewCount: number;
  createdAt: Date;
  expiresAt: Date;
  user: AuthorRecord;
  views: { id: string }[];
}

function serializeAuthor(user: AuthorRecord) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
  };
}

// `views` must be pre-filtered to the requesting viewer's rows.
// viewCount is owner-only per the API contract.
function serializeStory(story: SerializableStory, viewerId: string) {
  return {
    id: story.id,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    durationSeconds: story.durationSeconds,
    caption: story.caption,
    stickerData: story.stickerData,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    user: serializeAuthor(story.user),
    isViewed: story.views.length > 0,
    ...(story.userId === viewerId ? { viewCount: story.viewCount } : {}),
  };
}

function parseLimit(limitStr?: string): number {
  const parsed = parseInt(limitStr ?? String(DEFAULT_LIMIT), 10);
  return Math.min(Number.isNaN(parsed) ? DEFAULT_LIMIT : Math.max(parsed, 1), MAX_LIMIT);
}

async function getBlockedUserIds(userId: string): Promise<string[]> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId));
}

// Direct access to hidden content is always a 404 (never reveal existence):
// inactive author, block in either direction, or private-not-following.
async function assertUserContentVisible(
  viewerId: string,
  author: { id: string; isPrivate: boolean; isActive: boolean },
  notFoundMessage: string
): Promise<void> {
  const notFound = () => new ApiError(404, notFoundMessage, 'NOT_FOUND');
  if (!author.isActive) throw notFound();
  if (author.id === viewerId) return;

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: author.id },
        { blockerId: author.id, blockedId: viewerId },
      ],
    },
    select: { blockerId: true },
  });
  if (block) throw notFound();

  if (author.isPrivate) {
    const follow = await prisma.follow.findFirst({
      where: { followerId: viewerId, followingId: author.id, status: FollowStatus.ACCEPTED },
      select: { id: true },
    });
    if (!follow) throw notFound();
  }
}

export async function getTray(viewerId: string) {
  const follows = await prisma.follow.findMany({
    where: { followerId: viewerId, status: FollowStatus.ACCEPTED },
    select: { followingId: true },
  });
  const authorIds = [viewerId, ...follows.map((f) => f.followingId)];
  const blockedIds = await getBlockedUserIds(viewerId);

  const stories = await prisma.story.findMany({
    where: {
      userId: { in: authorIds, ...(blockedIds.length > 0 ? { notIn: blockedIds } : {}) },
      expiresAt: { gt: new Date() },
      user: { isActive: true },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: authorSelect },
      views: { where: { viewerId }, select: { id: true } },
    },
  });

  const byAuthor = new Map<
    string,
    { user: ReturnType<typeof serializeAuthor>; latestAt: Date; allViewed: boolean; storyCount: number }
  >();
  for (const story of stories) {
    const viewed = story.views.length > 0;
    const entry = byAuthor.get(story.userId);
    if (!entry) {
      // Rows arrive createdAt desc, so the first row per author carries latestAt.
      byAuthor.set(story.userId, {
        user: serializeAuthor(story.user),
        latestAt: story.createdAt,
        allViewed: viewed,
        storyCount: 1,
      });
    } else {
      entry.storyCount += 1;
      entry.allViewed = entry.allViewed && viewed;
    }
  }

  const items = [...byAuthor.values()];
  items.sort((a, b) => {
    if (a.user.id === viewerId) return -1;
    if (b.user.id === viewerId) return 1;
    if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
    return b.latestAt.getTime() - a.latestAt.getTime();
  });
  return items;
}

export async function getUserStories(viewerId: string, username: string) {
  const author = await prisma.user.findUnique({ where: { username }, select: authorSelect });
  if (!author) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  await assertUserContentVisible(viewerId, author, 'User not found');

  const stories = await prisma.story.findMany({
    where: { userId: author.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: authorSelect },
      views: { where: { viewerId }, select: { id: true } },
    },
  });
  return stories.map((story) => serializeStory(story, viewerId));
}

export async function createStory(userId: string, input: CreateStoryInput) {
  const expiresAt = new Date(Date.now() + STORY_TTL_HOURS * 60 * 60 * 1000);

  const story = await prisma.story.create({
    data: {
      userId,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      durationSeconds: input.durationSeconds,
      caption: input.caption,
      // Arbitrary sticker/overlay JSON, stored as-is.
      stickerData:
        input.stickerData == null ? undefined : (input.stickerData as Prisma.InputJsonValue),
      expiresAt,
    },
    include: { user: { select: authorSelect } },
  });

  return serializeStory({ ...story, views: [] }, userId);
}

export async function deleteStory(userId: string, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, userId: true },
  });
  if (!story) throw new ApiError(404, 'Story not found', 'NOT_FOUND');
  if (story.userId !== userId) {
    throw new ApiError(403, 'You can only delete your own stories', 'FORBIDDEN');
  }
  // StoryView and HighlightStory rows cascade; Message.storyId is SetNull.
  await prisma.story.delete({ where: { id: storyId } });
}

export async function viewStory(viewerId: string, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { user: { select: authorSelect } },
  });
  if (!story || story.expiresAt <= new Date()) {
    throw new ApiError(404, 'Story not found', 'NOT_FOUND');
  }
  await assertUserContentVisible(viewerId, story.user, 'Story not found');

  // Owners watching their own story are never recorded as viewers.
  if (story.userId === viewerId) return { viewed: false };

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.storyView.findUnique({
        where: { storyId_viewerId: { storyId, viewerId } },
        select: { id: true },
      });
      // Idempotent: re-viewing neither duplicates the row nor the counter.
      if (existing) return;
      await tx.storyView.create({ data: { storyId, viewerId } });
      await tx.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
    });
  } catch (err) {
    // Concurrent first views race on the (storyId, viewerId) unique key.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
      throw err;
    }
  }
  return { viewed: true };
}

export async function getStoryViewers(
  ownerId: string,
  storyId: string,
  cursorStr?: string,
  limitStr?: string
) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!story || story.expiresAt <= new Date()) {
    throw new ApiError(404, 'Story not found', 'NOT_FOUND');
  }
  if (story.userId !== ownerId) {
    throw new ApiError(403, 'Only the story owner can see its viewers', 'FORBIDDEN');
  }

  const cursor = decodeCursor(cursorStr);
  const limit = parseLimit(limitStr);

  // StoryView has no createdAt, so keyset on (viewedAt DESC, id DESC); the
  // cursor's createdAt slot carries viewedAt.
  const cursorFilter: Prisma.StoryViewWhereInput = cursor
    ? {
        OR: [
          { viewedAt: { lt: new Date(cursor.createdAt) } },
          { viewedAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      }
    : {};

  const rows = await prisma.storyView.findMany({
    where: { AND: [{ storyId }, cursorFilter] },
    orderBy: [{ viewedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { viewer: { select: authorSelect } },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    items: page.map((view) => ({
      viewer: serializeAuthor(view.viewer),
      viewedAt: view.viewedAt,
      reaction: view.reaction,
    })),
    meta: {
      nextCursor: hasMore && last ? encodeCursor(last.viewedAt, last.id) : null,
      hasMore,
    },
  };
}

// A reaction is also a view: ensure the StoryView row exists (counting it once),
// store the emoji, ping the owner in realtime, and drop a STORY_REPLY DM into
// the 1:1 conversation.
export async function reactToStory(reactorId: string, storyId: string, emoji: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { user: { select: authorSelect } },
  });
  if (!story || story.expiresAt <= new Date()) {
    throw new ApiError(404, 'Story not found', 'NOT_FOUND');
  }
  await assertUserContentVisible(reactorId, story.user, 'Story not found');
  if (story.userId === reactorId) {
    throw new ApiError(400, 'You cannot react to your own story', 'CANNOT_REACT_OWN_STORY');
  }

  const reactor = await prisma.user.findUnique({ where: { id: reactorId }, select: authorSelect });
  if (!reactor) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  await prisma.$transaction(async (tx) => {
    const existing = await tx.storyView.findUnique({
      where: { storyId_viewerId: { storyId, viewerId: reactorId } },
      select: { id: true },
    });
    if (existing) {
      await tx.storyView.update({ where: { id: existing.id }, data: { reaction: emoji } });
    } else {
      await tx.storyView.create({ data: { storyId, viewerId: reactorId, reaction: emoji } });
      await tx.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
    }
  });

  emitToUser(story.userId, 'story_reaction', {
    storyId,
    emoji,
    user: serializeAuthor(reactor),
  });

  const conversation = await findOrCreateDirectConversation(reactorId, story.userId);
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: reactorId,
      type: MessageType.STORY_REPLY,
      content: emoji,
      storyId,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  const serializedMessage = {
    id: message.id,
    conversationId: message.conversationId,
    type: message.type,
    content: message.content,
    storyId: message.storyId,
    createdAt: message.createdAt,
    sender: serializeAuthor(reactor),
    reactions: null,
    isDeleted: false,
    seenBy: [] as string[],
  };
  emitToUser(story.userId, 'new_message', serializedMessage);
  emitToUser(reactorId, 'new_message', serializedMessage);

  return { storyId, emoji };
}

// The 1:1 thread between two users: non-group with exactly these two
// participants. Created lazily on the first story reply.
async function findOrCreateDirectConversation(userA: string, userB: string) {
  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId: userA } } },
        { participants: { some: { userId: userB } } },
        { participants: { every: { userId: { in: [userA, userB] } } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      isGroup: false,
      createdById: userA,
      participants: { create: [{ userId: userA }, { userId: userB }] },
    },
    select: { id: true },
  });
}
