import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CursorPayload, cursorWhere, paginate } from '../utils/cursor';

// ───────────────────────── Shared shapes ─────────────────────────

const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

// Full post shape (mirrors the posts domain): author, media ordered by
// displayOrder, people tags, denormalized counters. isLiked/isSaved are
// attached per viewer afterwards.
const postInclude = {
  user: { select: authorSelect },
  media: { orderBy: { displayOrder: 'asc' } },
  tags: { select: { x: true, y: true, user: { select: authorSelect } } },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

// Grid shape for explore: id + first media + counters.
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
    user: post.user,
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

// ───────────────────────── Viewer helpers ─────────────────────────

// Blocks are mutual invisibility: collect every user blocked by or blocking
// the viewer.
async function blockedUserIds(viewerId: string): Promise<Set<string>> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const b of blocks) ids.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
  return ids;
}

// Authors excluded from explore/suggested: self, anyone the viewer follows
// (any status — a pending request still counts as "followed"), and anyone
// in a block relationship either way.
async function excludedAuthorIds(viewerId: string): Promise<string[]> {
  const [follows, blocked] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    }),
    blockedUserIds(viewerId),
  ]);
  const ids = new Set<string>([viewerId]);
  for (const f of follows) ids.add(f.followingId);
  for (const id of blocked) ids.add(id);
  return [...ids];
}

// Batch-resolve isLiked/isSaved for a page of posts, then serialize.
async function attachViewerFlags(viewerId: string, posts: PostRow[]) {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);
  const [likes, saves] = await Promise.all([
    prisma.like.findMany({
      where: { userId: viewerId, targetType: 'POST', targetId: { in: ids } },
      select: { targetId: true },
    }),
    prisma.savedPost.findMany({
      where: { userId: viewerId, postId: { in: ids } },
      select: { postId: true },
    }),
  ]);
  const liked = new Set(likes.map((l) => l.targetId));
  const saved = new Set(saves.map((s) => s.postId));
  return posts.map((p) => serializePost(p, liked.has(p.id), saved.has(p.id)));
}

// ───────────────────────── Ranking ─────────────────────────

function ageHours(createdAt: Date, now: number): number {
  return Math.max(0, (now - createdAt.getTime()) / 3_600_000);
}

// Home: essentially newest-first, with engagement as a soft tiebreak —
// score = recency-hours − 0.1×ln(likes+1); lower score ranks first.
function homeScore(post: PostRow, now: number): number {
  return ageHours(post.createdAt, now) - 0.1 * Math.log(post.likeCount + 1);
}

// Explore: engagement weighted against age (gravity decay); higher first.
function exploreScore(post: GridRow, now: number): number {
  const engagement = post.likeCount + post.commentCount;
  return (engagement + 1) / Math.pow(ageHours(post.createdAt, now) + 2, 1.2);
}

// ───────────────────────── Feeds ─────────────────────────

// Home feed: own posts + posts from ACCEPTED-followed active users, not
// archived. Pages on (createdAt, id) so the cursor stays stable; the
// engagement tiebreak is applied within each page only.
export async function getHomeFeed(viewerId: string, cursor: CursorPayload | null, limit: number) {
  const [follows, blocked] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: viewerId, status: 'ACCEPTED' },
      select: { followingId: true },
    }),
    blockedUserIds(viewerId),
  ]);
  // Blocks normally remove follow rows, but enforce mutual invisibility anyway.
  const authorIds = [
    viewerId,
    ...follows.map((f) => f.followingId).filter((id) => !blocked.has(id)),
  ];

  const rows = await prisma.post.findMany({
    where: {
      AND: [
        { userId: { in: authorIds }, isArchived: false, user: { isActive: true } },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: postInclude,
  });

  // Compute the cursor from the createdAt-ordered page BEFORE re-ranking.
  const { items, meta } = paginate(rows, limit);
  const now = Date.now();
  const ranked = [...items].sort((a, b) => homeScore(a, now) - homeScore(b, now));
  return { items: await attachViewerFlags(viewerId, ranked), meta };
}

// Explore: grid posts from public, active, non-followed, non-blocked authors.
// Cursor pages on createdAt; engagement ranking is applied within the page.
export async function getExploreFeed(
  viewerId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  const excluded = await excludedAuthorIds(viewerId);

  const rows = await prisma.post.findMany({
    where: {
      AND: [
        {
          isArchived: false,
          userId: { notIn: excluded },
          user: { isActive: true, isPrivate: false },
        },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: gridSelect,
  });

  const { items, meta } = paginate(rows, limit);
  const now = Date.now();
  const ranked = [...items].sort((a, b) => exploreScore(b, now) - exploreScore(a, now));
  return { items: ranked.map(serializeGridPost), meta };
}

// Suggested posts (after feed exhaustion): full post shape from public,
// active, non-followed, non-blocked authors, newest first.
export async function getSuggestedPosts(
  viewerId: string,
  cursor: CursorPayload | null,
  limit: number
) {
  const excluded = await excludedAuthorIds(viewerId);

  const rows = await prisma.post.findMany({
    where: {
      AND: [
        {
          isArchived: false,
          userId: { notIn: excluded },
          user: { isActive: true, isPrivate: false },
        },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: postInclude,
  });

  const { items, meta } = paginate(rows, limit);
  return { items: await attachViewerFlags(viewerId, items), meta };
}
