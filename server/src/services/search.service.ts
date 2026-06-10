import { FollowStatus, MediaType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../middleware/error';
import { cursorWhere, decodeCursor, encodeCursor, paginate } from '../utils/cursor';

// ───────────────────────── shared shapes ─────────────────────────

const authorSelect = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

// Author + accepted follower count + createdAt (needed by the cursor helpers).
const searchUserSelect = {
  ...authorSelect,
  createdAt: true,
  _count: { select: { followers: { where: { status: FollowStatus.ACCEPTED } } } },
} as const;

interface SearchUserRow {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  _count: { followers: number };
}

// Grid shape for post results (hashtag / place grids).
const gridPostSelect = {
  id: true,
  createdAt: true,
  likeCount: true,
  commentCount: true,
  media: {
    orderBy: { displayOrder: 'asc' as const },
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
} as const;

interface GridPostRow {
  id: string;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  media: {
    id: string;
    mediaUrl: string;
    mediaType: MediaType;
    width: number | null;
    height: number | null;
    thumbnailUrl: string | null;
    displayOrder: number;
  }[];
  _count: { media: number };
}

function toGridPost(post: GridPostRow) {
  return {
    id: post.id,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    mediaCount: post._count.media,
    media: post.media[0] ?? null,
  };
}

// ───────────────────────── visibility helpers ─────────────────────────

// Blocks are mutual invisibility: hide anyone the viewer blocked or was blocked by.
async function blockedUserIds(viewerId: string): Promise<string[]> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const block of blocks) {
    ids.add(block.blockerId === viewerId ? block.blockedId : block.blockerId);
  }
  return [...ids];
}

async function acceptedFollowingIds(viewerId: string): Promise<string[]> {
  const rows = await prisma.follow.findMany({
    where: { followerId: viewerId, status: FollowStatus.ACCEPTED },
    select: { followingId: true },
  });
  return rows.map((row) => row.followingId);
}

// Public-or-followed visibility for posts surfaced through search.
function visiblePostWhere(
  viewerId: string,
  blockedIds: string[],
  followedIds: string[]
): Prisma.PostWhereInput {
  return {
    isArchived: false,
    user: {
      isActive: true,
      id: { notIn: blockedIds },
      OR: [{ isPrivate: false }, { id: viewerId }, { id: { in: followedIds } }],
    },
  };
}

function userSearchWhere(term: string, blockedIds: string[]): Prisma.UserWhereInput {
  return {
    isActive: true,
    id: { notIn: blockedIds },
    OR: [
      { username: { contains: term, mode: 'insensitive' } },
      { fullName: { contains: term, mode: 'insensitive' } },
    ],
  };
}

// ───────────────────────── normalization ─────────────────────────

// Hashtag rows are stored lowercase without the leading '#'.
function normalizeHashtag(raw: string): string {
  return raw.replace(/^#/, '').trim().toLowerCase();
}

function normalizeUserTerm(raw: string): string {
  return raw.replace(/^@/, '').trim();
}

// ───────────────────────── users ─────────────────────────

// followerCount comes from the filtered _count select; mutualCount = people the
// viewer follows (accepted) who follow the target (accepted).
async function enrichUsers(viewerId: string, rows: SearchUserRow[]) {
  const mutuals = new Map<string, number>();
  if (rows.length > 0) {
    const myFollowing = await acceptedFollowingIds(viewerId);
    if (myFollowing.length > 0) {
      const groups = await prisma.follow.groupBy({
        by: ['followingId'],
        where: {
          followingId: { in: rows.map((row) => row.id) },
          followerId: { in: myFollowing },
          status: FollowStatus.ACCEPTED,
        },
        _count: { followingId: true },
      });
      for (const group of groups) mutuals.set(group.followingId, group._count.followingId);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    isVerified: row.isVerified,
    followerCount: row._count.followers,
    mutualCount: mutuals.get(row.id) ?? 0,
  }));
}

export async function searchUsers(
  viewerId: string,
  q: string,
  cursorRaw: string | undefined,
  limit: number
) {
  const term = normalizeUserTerm(q);
  if (!term) return { items: [], meta: { nextCursor: null, hasMore: false } };

  const blockedIds = await blockedUserIds(viewerId);
  const cursor = decodeCursor(cursorRaw);
  const rows = await prisma.user.findMany({
    where: { AND: [userSearchWhere(term, blockedIds), cursorWhere(cursor)] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: searchUserSelect,
  });
  const { items, meta } = paginate(rows, limit);
  return { items: await enrichUsers(viewerId, items), meta };
}

// ───────────────────────── hashtags ─────────────────────────

// Hashtags have no createdAt, so the standard cursor carries a fixed timestamp
// and the last row's id; the (postCount desc, id desc) keyset resumes from
// that row's values looked up by id.
const HASHTAG_CURSOR_DATE = new Date(0);

export async function searchHashtags(q: string, cursorRaw: string | undefined, limit: number) {
  const term = normalizeHashtag(q);
  if (!term) return { items: [], meta: { nextCursor: null, hasMore: false } };

  const cursor = decodeCursor(cursorRaw);
  let after: { id: string; postCount: number } | null = null;
  if (cursor) {
    after = await prisma.hashtag.findUnique({
      where: { id: cursor.id },
      select: { id: true, postCount: true },
    });
  }

  const rows = await prisma.hashtag.findMany({
    where: {
      name: { startsWith: term, mode: 'insensitive' },
      ...(after
        ? {
            OR: [
              { postCount: { lt: after.postCount } },
              { postCount: after.postCount, id: { lt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ postCount: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: { id: true, name: true, postCount: true },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((tag) => ({ name: tag.name, postCount: tag.postCount })),
    meta: {
      nextCursor: hasMore && last ? encodeCursor(HASHTAG_CURSOR_DATE, last.id) : null,
      hasMore,
    },
  };
}

export async function getHashtag(name: string) {
  const tag = await prisma.hashtag.findUnique({
    where: { name: normalizeHashtag(name) },
    select: { name: true, postCount: true },
  });
  if (!tag) throw new ApiError(404, 'Hashtag not found', 'HASHTAG_NOT_FOUND');
  return tag;
}

export async function getHashtagPosts(
  viewerId: string,
  name: string,
  cursorRaw: string | undefined,
  limit: number
) {
  const tag = await prisma.hashtag.findUnique({
    where: { name: normalizeHashtag(name) },
    select: { id: true },
  });
  if (!tag) throw new ApiError(404, 'Hashtag not found', 'HASHTAG_NOT_FOUND');

  const [blockedIds, followedIds] = await Promise.all([
    blockedUserIds(viewerId),
    acceptedFollowingIds(viewerId),
  ]);
  const cursor = decodeCursor(cursorRaw);
  const rows = await prisma.post.findMany({
    where: {
      AND: [
        {
          hashtags: { some: { hashtagId: tag.id } },
          ...visiblePostWhere(viewerId, blockedIds, followedIds),
        },
        cursorWhere(cursor),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: gridPostSelect,
  });
  const { items, meta } = paginate(rows, limit);
  return { items: items.map(toGridPost), meta };
}

export async function getTrendingHashtags(limit: number) {
  return prisma.hashtag.findMany({
    where: { postCount: { gt: 0 } },
    orderBy: [{ postCount: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { name: true, postCount: true },
  });
}

// ───────────────────────── places ─────────────────────────

// Places are distinct locationName groups over posts the viewer is allowed to
// see, with a lat/lng sample taken from one of those posts.
async function groupPlaces(viewerId: string, q: string, limit: number) {
  const [blockedIds, followedIds] = await Promise.all([
    blockedUserIds(viewerId),
    acceptedFollowingIds(viewerId),
  ]);
  const visibility = visiblePostWhere(viewerId, blockedIds, followedIds);

  const groups = await prisma.post.groupBy({
    by: ['locationName'],
    where: {
      ...visibility,
      locationName: { not: null, contains: q, mode: 'insensitive' },
    },
    _count: { locationName: true },
    orderBy: [{ _count: { locationName: 'desc' } }, { locationName: 'asc' }],
    take: limit,
  });

  const names = groups
    .map((group) => group.locationName)
    .filter((name): name is string => name !== null);
  if (names.length === 0) return [];

  const samples = await prisma.post.findMany({
    where: {
      ...visibility,
      locationName: { in: names },
      locationLat: { not: null },
      locationLng: { not: null },
    },
    distinct: ['locationName'],
    select: { locationName: true, locationLat: true, locationLng: true },
  });
  const sampleByName = new Map(samples.map((sample) => [sample.locationName, sample]));

  return groups
    .filter((group): group is typeof group & { locationName: string } => group.locationName !== null)
    .map((group) => {
      const sample = sampleByName.get(group.locationName);
      return {
        name: group.locationName,
        lat: sample?.locationLat ?? null,
        lng: sample?.locationLng ?? null,
        postCount: group._count.locationName,
      };
    });
}

// Places are aggregated per query — offset-free top-N, no cursor to resume.
export async function searchPlaces(viewerId: string, q: string, limit: number) {
  const items = await groupPlaces(viewerId, q, limit);
  return { items, meta: { nextCursor: null, hasMore: false } };
}

export async function getPlacePosts(
  viewerId: string,
  name: string,
  cursorRaw: string | undefined,
  limit: number
) {
  const [blockedIds, followedIds] = await Promise.all([
    blockedUserIds(viewerId),
    acceptedFollowingIds(viewerId),
  ]);
  const baseWhere: Prisma.PostWhereInput = {
    locationName: name,
    ...visiblePostWhere(viewerId, blockedIds, followedIds),
  };
  const cursor = decodeCursor(cursorRaw);

  const [rows, sample] = await Promise.all([
    prisma.post.findMany({
      where: { AND: [baseWhere, cursorWhere(cursor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: gridPostSelect,
    }),
    prisma.post.findFirst({
      where: { ...baseWhere, locationLat: { not: null }, locationLng: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { locationLat: true, locationLng: true },
    }),
  ]);

  const { items, meta } = paginate(rows, limit);
  return {
    items: items.map(toGridPost),
    meta: { ...meta, name, lat: sample?.locationLat ?? null, lng: sample?.locationLng ?? null },
  };
}

// ───────────────────────── unified ─────────────────────────

export async function unifiedSearch(viewerId: string, q: string) {
  const userTerm = normalizeUserTerm(q);
  const tagTerm = normalizeHashtag(q);
  const blockedIds = await blockedUserIds(viewerId);

  const usersPromise: Promise<SearchUserRow[]> = userTerm
    ? prisma.user.findMany({
        where: userSearchWhere(userTerm, blockedIds),
        orderBy: [{ followers: { _count: 'desc' } }, { id: 'desc' }],
        take: 5,
        select: searchUserSelect,
      })
    : Promise.resolve([]);

  const hashtagsPromise = tagTerm
    ? prisma.hashtag.findMany({
        where: { name: { startsWith: tagTerm, mode: 'insensitive' }, postCount: { gt: 0 } },
        orderBy: [{ postCount: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { name: true, postCount: true },
      })
    : Promise.resolve([]);

  const [userRows, hashtags, places] = await Promise.all([
    usersPromise,
    hashtagsPromise,
    groupPlaces(viewerId, q, 5),
  ]);

  return { users: await enrichUsers(viewerId, userRows), hashtags, places };
}
