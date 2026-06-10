/* Seed script: 20 users, 100 posts, comments, likes, follows, stories, reels,
 * conversations and notifications. Idempotent-ish: wipes all rows first.
 *
 *   npm run seed   (or: npx prisma db seed)
 *
 * Every account's password is "password123". Log in as "demo".
 */
import { PrismaClient, FollowStatus, LikeTargetType, MediaType, NotificationType, NotificationTargetType, MessageType } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
faker.seed(42);

const img = (seed: string, w = 1080, h = 1080) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const avatar = (i: number) => `https://i.pravatar.cc/320?img=${(i % 70) + 1}`;
const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
];

const HASHTAG_POOL = [
  'travel', 'foodie', 'sunset', 'photography', 'fitness', 'art', 'nature', 'coffee',
  'style', 'music', 'beach', 'city', 'friends', 'weekend', 'love', 'instagood',
];

const PLACES = [
  { name: 'Beirut, Lebanon', lat: 33.8938, lng: 35.5018 },
  { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
  { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'New York, USA', lat: 40.7128, lng: -74.006 },
  { name: 'Santorini, Greece', lat: 36.3932, lng: 25.4615 },
  { name: 'Dubai, UAE', lat: 25.2048, lng: 55.2708 },
];

const pick = <T,>(arr: T[]): T => arr[faker.number.int({ min: 0, max: arr.length - 1 })];
const sample = <T,>(arr: T[], n: number): T[] => faker.helpers.arrayElements(arr, n);
const daysAgo = (max: number) => faker.date.recent({ days: max });

function caption(): string {
  const text = faker.lorem.sentence({ min: 4, max: 14 });
  const tags = sample(HASHTAG_POOL, faker.number.int({ min: 0, max: 3 }))
    .map((t) => `#${t}`)
    .join(' ');
  return `${text} ${tags}`.trim();
}

async function main() {
  console.log('Clearing existing data...');
  // Order matters only loosely thanks to cascades — users cascade to almost everything.
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.report.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hashtag.deleteMany();

  console.log('Creating users...');
  const passwordHash = await bcrypt.hash('password123', 10);
  const usernames = [
    'demo', 'maya.k', 'alexshots', 'wanderlust_sam', 'chefnadia', 'urban.lens',
    'fit_with_omar', 'lina.art', 'thecoffeeguy', 'skyline_jess', 'noah.codes',
    'salma_styles', 'mike.outdoors', 'tania_reads', 'dancewithyara', 'petelovesdogs',
    'sara.bakes', 'jadtravels', 'emily.paints', 'karim_music',
  ];
  const users = [] as { id: string; username: string; isPrivate: boolean }[];
  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    const isPrivate = i === 13 || i === 16; // tania_reads + sara.bakes are private
    const user = await prisma.user.create({
      data: {
        username,
        email: i === 0 ? 'demo@snaploop.local' : faker.internet.email({ firstName: username.replace(/[._]/g, '') }).toLowerCase(),
        passwordHash,
        fullName: i === 0 ? 'Demo User' : faker.person.fullName(),
        bio: faker.helpers.maybe(() => faker.person.bio(), { probability: 0.85 }) ?? null,
        avatarUrl: avatar(i),
        websiteUrl: faker.helpers.maybe(() => faker.internet.url(), { probability: 0.3 }) ?? null,
        isPrivate,
        isVerified: i === 2 || i === 4 || i === 9, // a few blue ticks
        emailVerifiedAt: new Date(),
        createdAt: faker.date.past({ years: 2 }),
      },
    });
    users.push({ id: user.id, username, isPrivate });
  }
  const demo = users[0];

  console.log('Creating follow graph...');
  const followPairs = new Set<string>();
  const follows: { followerId: string; followingId: string; status: FollowStatus }[] = [];
  for (const follower of users) {
    for (const following of sample(users.filter((u) => u.id !== follower.id), faker.number.int({ min: 5, max: 12 }))) {
      const key = `${follower.id}:${following.id}`;
      if (followPairs.has(key)) continue;
      followPairs.add(key);
      // Most private-account follows are accepted; a few stay pending.
      const status =
        following.isPrivate && faker.number.int({ min: 0, max: 3 }) === 0
          ? FollowStatus.PENDING
          : FollowStatus.ACCEPTED;
      follows.push({ followerId: follower.id, followingId: following.id, status });
    }
  }
  // Demo follows half the network and has a healthy follower base.
  for (const other of users.slice(1, 12)) {
    const key = `${demo.id}:${other.id}`;
    if (!followPairs.has(key)) {
      followPairs.add(key);
      follows.push({ followerId: demo.id, followingId: other.id, status: other.isPrivate ? FollowStatus.PENDING : FollowStatus.ACCEPTED });
    }
  }
  await prisma.follow.createMany({ data: follows, skipDuplicates: true });

  console.log('Creating hashtags...');
  const hashtagMap = new Map<string, string>();
  for (const name of HASHTAG_POOL) {
    const tag = await prisma.hashtag.create({ data: { name } });
    hashtagMap.set(name, tag.id);
  }

  console.log('Creating 100 posts...');
  const postIds: { id: string; userId: string; createdAt: Date }[] = [];
  for (let i = 0; i < 100; i++) {
    const author = users[i % users.length];
    const createdAt = daysAgo(60);
    const cap = caption();
    const place = faker.helpers.maybe(() => pick(PLACES), { probability: 0.4 });
    const mediaCount = faker.number.int({ min: 1, max: 4 });
    const post = await prisma.post.create({
      data: {
        userId: author.id,
        caption: cap,
        locationName: place?.name ?? null,
        locationLat: place?.lat ?? null,
        locationLng: place?.lng ?? null,
        createdAt,
        media: {
          create: Array.from({ length: mediaCount }).map((_, m) => ({
            mediaUrl: img(`post${i}-${m}`),
            mediaType: MediaType.IMAGE,
            width: 1080,
            height: 1080,
            displayOrder: m,
          })),
        },
      },
    });
    postIds.push({ id: post.id, userId: author.id, createdAt });

    // Hashtag joins from the caption
    const tagNames = [...cap.matchAll(/#(\w+)/g)].map((m) => m[1]);
    for (const name of tagNames) {
      const hashtagId = hashtagMap.get(name);
      if (hashtagId) {
        await prisma.postHashtag.create({ data: { postId: post.id, hashtagId } }).catch(() => undefined);
      }
    }
  }
  // Sync hashtag postCounts
  for (const [name, id] of hashtagMap) {
    const count = await prisma.postHashtag.count({ where: { hashtagId: id } });
    await prisma.hashtag.update({ where: { id }, data: { postCount: count } });
    void name;
  }

  console.log('Tagging people in posts...');
  for (const post of sample(postIds, 25)) {
    const taggable = sample(users.filter((u) => u.id !== post.userId), faker.number.int({ min: 1, max: 2 }));
    for (const tagged of taggable) {
      await prisma.postTag
        .create({
          data: {
            postId: post.id,
            userId: tagged.id,
            x: faker.number.float({ min: 0.2, max: 0.8 }),
            y: faker.number.float({ min: 0.2, max: 0.8 }),
          },
        })
        .catch(() => undefined);
    }
  }

  console.log('Creating likes...');
  const likeRows: { userId: string; targetId: string; targetType: LikeTargetType; createdAt: Date }[] = [];
  for (const post of postIds) {
    for (const liker of sample(users, faker.number.int({ min: 0, max: 14 }))) {
      likeRows.push({ userId: liker.id, targetId: post.id, targetType: LikeTargetType.POST, createdAt: faker.date.between({ from: post.createdAt, to: new Date() }) });
    }
  }
  await prisma.like.createMany({ data: likeRows, skipDuplicates: true });

  console.log('Creating comments + replies...');
  const COMMENT_POOL = [
    'This is amazing! 🔥', 'Love it 😍', 'Where is this?', 'Incredible shot!',
    'Goals!', 'Stunning 🤩', 'No way!!', 'Take me with you next time',
    'The colors here are unreal', 'Saving this for inspiration', 'So good 👏', 'Wow!',
  ];
  let commentCount = 0;
  for (const post of postIds) {
    const n = faker.number.int({ min: 0, max: 6 });
    for (let c = 0; c < n; c++) {
      const commenter = pick(users);
      const comment = await prisma.comment.create({
        data: {
          postId: post.id,
          userId: commenter.id,
          content: pick(COMMENT_POOL),
          createdAt: faker.date.between({ from: post.createdAt, to: new Date() }),
        },
      });
      commentCount++;
      if (faker.number.int({ min: 0, max: 2 }) === 0) {
        await prisma.comment.create({
          data: {
            postId: post.id,
            userId: pick(users).id,
            parentId: comment.id,
            content: `@${commenter.username} ${pick(['agreed!', 'haha yes', 'so true', '💯'])}`,
            createdAt: faker.date.between({ from: comment.createdAt, to: new Date() }),
          },
        });
        commentCount++;
      }
    }
  }

  console.log('Syncing denormalized counters...');
  for (const post of postIds) {
    const [likes, comments] = await Promise.all([
      prisma.like.count({ where: { targetId: post.id, targetType: LikeTargetType.POST } }),
      prisma.comment.count({ where: { postId: post.id } }),
    ]);
    await prisma.post.update({ where: { id: post.id }, data: { likeCount: likes, commentCount: comments, viewCount: faker.number.int({ min: 50, max: 5000 }) } });
  }

  console.log('Creating reels...');
  const reelIds: { id: string; userId: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const author = users[(i * 3 + 1) % users.length];
    const reel = await prisma.reel.create({
      data: {
        userId: author.id,
        videoUrl: pick(SAMPLE_VIDEOS),
        thumbnailUrl: img(`reel${i}`, 720, 1280),
        caption: caption(),
        audioName: pick(['Original audio', 'Summer Vibes', 'Night Drive', 'Lo-fi Beats', 'Golden Hour']),
        audioArtist: pick(['', faker.person.firstName(), faker.music.genre()]) || null,
        durationSeconds: faker.number.int({ min: 10, max: 60 }),
        viewCount: faker.number.int({ min: 200, max: 20000 }),
        createdAt: daysAgo(30),
      },
    });
    reelIds.push({ id: reel.id, userId: author.id });
    const reelLikes = sample(users, faker.number.int({ min: 2, max: 15 })).map((u) => ({
      userId: u.id,
      targetId: reel.id,
      targetType: LikeTargetType.REEL,
    }));
    await prisma.like.createMany({ data: reelLikes, skipDuplicates: true });
    const likes = await prisma.like.count({ where: { targetId: reel.id, targetType: LikeTargetType.REEL } });
    await prisma.reel.update({ where: { id: reel.id }, data: { likeCount: likes } });
  }

  console.log('Creating stories...');
  const now = Date.now();
  const storyIds: { id: string; userId: string }[] = [];
  for (const author of sample(users, 10)) {
    const n = faker.number.int({ min: 1, max: 3 });
    for (let s = 0; s < n; s++) {
      const createdAt = new Date(now - faker.number.int({ min: 1, max: 20 }) * 3600_000);
      const story = await prisma.story.create({
        data: {
          userId: author.id,
          mediaUrl: img(`story-${author.username}-${s}`, 1080, 1920),
          mediaType: MediaType.IMAGE,
          caption: faker.helpers.maybe(() => faker.lorem.words({ min: 1, max: 5 }), { probability: 0.5 }) ?? null,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 24 * 3600_000),
        },
      });
      storyIds.push({ id: story.id, userId: author.id });
      // Some views from other users
      const viewers = sample(users.filter((u) => u.id !== author.id), faker.number.int({ min: 0, max: 8 }));
      for (const viewer of viewers) {
        await prisma.storyView.create({ data: { storyId: story.id, viewerId: viewer.id } }).catch(() => undefined);
      }
      await prisma.story.update({ where: { id: story.id }, data: { viewCount: viewers.length } });
    }
  }

  console.log('Creating highlights...');
  for (const author of sample(users.slice(1), 4)) {
    const own = storyIds.filter((s) => s.userId === author.id);
    if (own.length === 0) continue;
    await prisma.highlight.create({
      data: {
        userId: author.id,
        title: pick(['Travel', 'Food', 'Friends', '2026', 'Vibes']),
        coverUrl: img(`highlight-${author.username}`),
        stories: { create: own.map((s) => ({ storyId: s.id })) },
      },
    });
  }

  console.log('Creating collections + saved posts for demo...');
  const inspo = await prisma.collection.create({ data: { userId: demo.id, name: 'Inspiration' } });
  for (const post of sample(postIds.filter((p) => p.userId !== demo.id), 8)) {
    await prisma.savedPost
      .create({ data: { userId: demo.id, postId: post.id, collectionId: faker.datatype.boolean() ? inspo.id : null } })
      .catch(() => undefined);
  }

  console.log('Creating conversations + messages...');
  const MESSAGE_POOL = [
    'hey! how are you?', 'did you see that post 😂', 'we should catch up soon',
    'on my way!', 'thoughts on this?', 'lol', 'amazing right??', 'send me the pics',
    'sounds good 👍', 'haha exactly', 'let me check and get back to you', 'miss you!',
  ];
  for (const other of sample(users.slice(1), 5)) {
    const convo = await prisma.conversation.create({
      data: {
        createdById: demo.id,
        participants: { create: [{ userId: demo.id }, { userId: other.id }] },
      },
    });
    const n = faker.number.int({ min: 3, max: 12 });
    let last = new Date(now - 5 * 24 * 3600_000);
    for (let m = 0; m < n; m++) {
      last = new Date(last.getTime() + faker.number.int({ min: 5, max: 600 }) * 60_000);
      await prisma.message.create({
        data: {
          conversationId: convo.id,
          senderId: faker.datatype.boolean() ? demo.id : other.id,
          type: MessageType.TEXT,
          content: pick(MESSAGE_POOL),
          createdAt: last,
        },
      });
    }
    await prisma.conversation.update({ where: { id: convo.id }, data: { updatedAt: last } });
    // Demo has read up to a random point; the other user read everything.
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: convo.id, userId: other.id },
      data: { lastReadAt: last },
    });
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: convo.id, userId: demo.id },
      data: { lastReadAt: faker.datatype.boolean() ? last : new Date(last.getTime() - 3600_000) },
    });
  }
  // One group chat
  const groupMembers = sample(users.slice(1), 3);
  const group = await prisma.conversation.create({
    data: {
      isGroup: true,
      groupName: 'Weekend plans 🎉',
      createdById: demo.id,
      participants: { create: [{ userId: demo.id }, ...groupMembers.map((u) => ({ userId: u.id }))] },
    },
  });
  let gLast = new Date(now - 2 * 24 * 3600_000);
  for (let m = 0; m < 10; m++) {
    gLast = new Date(gLast.getTime() + faker.number.int({ min: 2, max: 240 }) * 60_000);
    await prisma.message.create({
      data: {
        conversationId: group.id,
        senderId: pick([demo, ...groupMembers]).id,
        type: MessageType.TEXT,
        content: pick(MESSAGE_POOL),
        createdAt: gLast,
      },
    });
  }
  await prisma.conversation.update({ where: { id: group.id }, data: { updatedAt: gLast } });

  console.log('Creating notifications for demo...');
  const demoPosts = postIds.filter((p) => p.userId === demo.id);
  for (const post of demoPosts.slice(0, 5)) {
    const senders = sample(users.slice(1), faker.number.int({ min: 1, max: 4 }));
    for (const sender of senders) {
      await prisma.notification.create({
        data: {
          recipientId: demo.id,
          senderId: sender.id,
          type: NotificationType.LIKE_POST,
          targetId: post.id,
          targetType: NotificationTargetType.POST,
          isRead: faker.datatype.boolean(),
          createdAt: daysAgo(7),
        },
      });
    }
  }
  for (const sender of sample(users.slice(1), 6)) {
    await prisma.notification.create({
      data: {
        recipientId: demo.id,
        senderId: sender.id,
        type: NotificationType.FOLLOW,
        targetId: sender.id,
        targetType: NotificationTargetType.USER,
        isRead: false,
        createdAt: daysAgo(3),
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    posts: await prisma.post.count(),
    comments: commentCount,
    likes: await prisma.like.count(),
    follows: await prisma.follow.count(),
    stories: await prisma.story.count(),
    reels: await prisma.reel.count(),
    messages: await prisma.message.count(),
  };
  console.log('Seed complete:', counts);
  console.log('\nLogin with: demo / password123 (any seeded username works too)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
