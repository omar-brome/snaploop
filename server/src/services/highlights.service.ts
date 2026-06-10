import { FollowStatus, MediaType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';

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

export interface CreateHighlightInput {
  title: string;
  storyIds: string[];
  coverUrl?: string;
}

export interface UpdateHighlightInput {
  title?: string;
  coverUrl?: string;
  addStoryIds?: string[];
  removeStoryIds?: string[];
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

// Same story shape as /api/stories; viewCount is owner-only. Highlights are
// the one place expired stories remain visible.
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

// Same privacy rules as stories: owner, public author, or accepted follower;
// blocked-either-way or inactive author -> 404 (never reveal existence).
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

async function assertOwnStories(userId: string, storyIds: string[]): Promise<void> {
  if (storyIds.length === 0) return;
  const count = await prisma.story.count({ where: { id: { in: storyIds }, userId } });
  if (count !== storyIds.length) {
    throw new ApiError(400, 'You can only add your own stories to a highlight', 'INVALID_STORY_IDS');
  }
}

export async function getUserHighlights(viewerId: string, username: string) {
  const author = await prisma.user.findUnique({ where: { username }, select: authorSelect });
  if (!author) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  await assertUserContentVisible(viewerId, author, 'User not found');

  const highlights = await prisma.highlight.findMany({
    where: { userId: author.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { stories: true } },
      // Earliest-added story supplies the cover fallback.
      stories: {
        orderBy: { addedAt: 'asc' },
        take: 1,
        select: { story: { select: { mediaUrl: true } } },
      },
    },
  });

  return highlights.map((highlight) => ({
    id: highlight.id,
    title: highlight.title,
    coverUrl: highlight.coverUrl ?? highlight.stories[0]?.story.mediaUrl ?? null,
    storyCount: highlight._count.stories,
  }));
}

export async function getHighlightById(viewerId: string, highlightId: string) {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    include: {
      user: { select: authorSelect },
      stories: {
        // Chronological playback order, expired stories included.
        orderBy: { story: { createdAt: 'asc' } },
        include: {
          story: {
            include: {
              user: { select: authorSelect },
              views: { where: { viewerId }, select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!highlight) throw new ApiError(404, 'Highlight not found', 'NOT_FOUND');
  await assertUserContentVisible(viewerId, highlight.user, 'Highlight not found');

  const stories = highlight.stories.map((hs) => serializeStory(hs.story, viewerId));
  return {
    id: highlight.id,
    title: highlight.title,
    coverUrl: highlight.coverUrl ?? stories[0]?.mediaUrl ?? null,
    stories,
  };
}

export async function createHighlight(userId: string, input: CreateHighlightInput) {
  const storyIds = [...new Set(input.storyIds)];
  await assertOwnStories(userId, storyIds);

  const highlight = await prisma.highlight.create({
    data: {
      userId,
      title: input.title,
      coverUrl: input.coverUrl,
      stories: { create: storyIds.map((storyId) => ({ storyId })) },
    },
    select: { id: true },
  });

  return getHighlightById(userId, highlight.id);
}

export async function updateHighlight(
  userId: string,
  highlightId: string,
  input: UpdateHighlightInput
) {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: { id: true, userId: true },
  });
  if (!highlight) throw new ApiError(404, 'Highlight not found', 'NOT_FOUND');
  if (highlight.userId !== userId) {
    throw new ApiError(403, 'You can only edit your own highlights', 'FORBIDDEN');
  }

  const addStoryIds = [...new Set(input.addStoryIds ?? [])];
  await assertOwnStories(userId, addStoryIds);

  await prisma.$transaction(async (tx) => {
    if (input.title !== undefined || input.coverUrl !== undefined) {
      await tx.highlight.update({
        where: { id: highlightId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
        },
      });
    }
    if (addStoryIds.length > 0) {
      await tx.highlightStory.createMany({
        data: addStoryIds.map((storyId) => ({ highlightId, storyId })),
        skipDuplicates: true,
      });
    }
    if (input.removeStoryIds && input.removeStoryIds.length > 0) {
      await tx.highlightStory.deleteMany({
        where: { highlightId, storyId: { in: input.removeStoryIds } },
      });
    }
  });

  return getHighlightById(userId, highlightId);
}

export async function deleteHighlight(userId: string, highlightId: string) {
  const highlight = await prisma.highlight.findUnique({
    where: { id: highlightId },
    select: { id: true, userId: true },
  });
  if (!highlight) throw new ApiError(404, 'Highlight not found', 'NOT_FOUND');
  if (highlight.userId !== userId) {
    throw new ApiError(403, 'You can only delete your own highlights', 'FORBIDDEN');
  }
  // HighlightStory join rows cascade; the stories themselves are untouched.
  await prisma.highlight.delete({ where: { id: highlightId } });
}
