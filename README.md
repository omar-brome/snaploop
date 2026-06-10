# Snaploop

A full-stack Instagram-style social platform: feed, stories, reels, direct messages, notifications, explore/search, profiles — built with React 18 + TypeScript on the front and Express + TypeScript + Prisma + PostgreSQL + Redis + Socket.io on the back.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/demo-dark.gif" />
    <img src="docs/media/demo.gif" alt="Snaploop demo — login, feed, stories, explore" width="340" />
  </picture>
</p>

<p align="center">
  🎬 Demo video: <a href="docs/media/demo.mp4">light</a> / <a href="docs/media/demo-dark.mp4">dark</a>
  &nbsp;·&nbsp; 🖼️ <a href="#screenshots">Screenshots</a>
  <br />
  <sub>The GIF above follows your GitHub theme — light and dark variants of every asset live in <code>docs/media/</code>.</sub>
</p>

## Screenshots

| Feed | Stories | Explore |
| :---: | :---: | :---: |
| ![Feed](docs/media/mobile-02-feed.png) | ![Story viewer](docs/media/mobile-03-story.png) | ![Explore](docs/media/mobile-04-explore.png) |

| Reels | Messages | Notifications |
| :---: | :---: | :---: |
| ![Reels](docs/media/mobile-05-reels.png) | ![DM thread](docs/media/mobile-07-dm-thread.png) | ![Notifications](docs/media/mobile-08-notifications.png) |

| Profile | Create | Login |
| :---: | :---: | :---: |
| ![Profile](docs/media/mobile-09-profile.png) | ![Create post](docs/media/mobile-10-create.png) | ![Login](docs/media/mobile-01-login.png) |

**Desktop**

| Home feed | Post detail |
| :---: | :---: |
| ![Desktop feed](docs/media/desktop-01-feed.png) | ![Post detail](docs/media/desktop-03-post-detail.png) |

| Messages | Profile |
| :---: | :---: |
| ![Desktop messages](docs/media/desktop-04-messages.png) | ![Desktop profile](docs/media/desktop-05-profile.png) |

<details>
<summary><b>🌙 Dark mode</b> (click to expand)</summary>

| Feed | Stories | Explore |
| :---: | :---: | :---: |
| ![Feed dark](docs/media/mobile-02-feed-dark.png) | ![Story viewer dark](docs/media/mobile-03-story-dark.png) | ![Explore dark](docs/media/mobile-04-explore-dark.png) |

| Messages | Notifications | Profile |
| :---: | :---: | :---: |
| ![DM thread dark](docs/media/mobile-07-dm-thread-dark.png) | ![Notifications dark](docs/media/mobile-08-notifications-dark.png) | ![Profile dark](docs/media/mobile-09-profile-dark.png) |

| Desktop feed | Desktop post detail |
| :---: | :---: |
| ![Desktop feed dark](docs/media/desktop-01-feed-dark.png) | ![Post detail dark](docs/media/desktop-03-post-detail-dark.png) |

| Desktop messages | Desktop profile |
| :---: | :---: |
| ![Desktop messages dark](docs/media/desktop-04-messages-dark.png) | ![Desktop profile dark](docs/media/desktop-05-profile-dark.png) |

More: [login](docs/media/mobile-01-login-dark.png) · [reels](docs/media/mobile-05-reels-dark.png) · [DM inbox](docs/media/mobile-06-dm-inbox-dark.png) · [create](docs/media/mobile-10-create-dark.png) · [desktop explore](docs/media/desktop-02-explore-dark.png)

</details>

## Features

- **Auth** — JWT access (15 min) + rotating refresh tokens (30 days) in httpOnly cookies, Redis-whitelisted; signup, login (email or username), forgot/reset password, change password, email verification (skippable in dev), account deactivation, private accounts.
- **Feed & posts** — cursor-paginated home feed, 1–10 media carousel per post, likes with double-tap + optimistic updates, saves/collections, hashtag + @mention parsing, location tags, archive, comments-off, edit/delete, report.
- **Stories** — 24h-expiring stories with viewer tracking, emoji reactions (delivered as DMs), text/sticker data, highlights, gradient-ring tray.
- **Reels** — vertical full-screen video feed, like/comment/share, view counts, ≤90s uploads.
- **Comments** — nested replies (one level), likes, pinning, @mention autocomplete, live updates over WebSocket.
- **DMs** — 1:1 and group conversations, replies, emoji reactions, unsend, seen receipts, typing indicators, online presence, shared posts/reels.
- **Notifications** — real-time over Socket.io with per-type preferences, unread badge, mark-all-read.
- **Explore & search** — masonry explore grid, unified search (users/tags/places), hashtag + location pages, trending hashtags.
- **Media** — uploads processed with Sharp (resize to 1080px, EXIF stripped, WebP), client-side canvas compression, local-disk storage served at `/uploads` (swappable driver).

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router v6, TanStack Query, Zustand, Axios, React Hook Form + Zod, Framer Motion, Lucide, socket.io-client |
| Backend | Node 20, Express 4, TypeScript, Prisma 5, Socket.io, Zod, Multer + Sharp, Nodemailer, bcryptjs, express-rate-limit |
| Data | PostgreSQL 16, Redis 7 (sessions, presence, notification prefs, pub/sub) |
| Dev | Docker Compose, tsx, ESLint + Prettier |

## Getting started

Prerequisites: Node 20+, Docker Desktop.

```bash
# 1. Start PostgreSQL + Redis (host ports 5433/6380 to avoid clashing with local installs)
docker compose up -d

# 2. Server
cd server
cp .env.example .env          # defaults work out of the box
npm install
npx prisma migrate dev        # create schema
npm run seed                  # 20 users, 100 posts, comments, follows, stories, reels, DMs
npm run dev                   # API on http://localhost:4000

# 3. Client (new terminal)
cd client
npm install
npm run dev                   # app on http://localhost:5173
```

Log in with **demo / password123** (every seeded account uses the same password).

## Project layout

```
client/src
  components/   shared UI kit (Button, Avatar, Modal, skeletons, toasts...)
  features/     feature modules (feed, stories, reels, dm, ...)
  hooks/        shared hooks (optimistic like/follow, ...)
  pages/        route-level components
  services/     axios instance, socket singleton, API helpers
  stores/       Zustand stores (auth, ui/theme)
server/src
  routes/       Express routers (zod-validated)
  controllers/  thin request handlers
  services/     business logic + Prisma queries
  middleware/   auth, validation, errors, rate limits, upload
  sockets/      Socket.io auth, rooms, presence, typing
  jobs/         story expiry cleanup
server/prisma   schema (22 tables), migrations, seed
docs/           API contract + code conventions
```

## API

All endpoints return `{ success, data, meta, error }` and lists use cursor pagination (`?cursor=` → `meta.nextCursor` / `meta.hasMore`). The full endpoint contract lives in [docs/API.md](docs/API.md); conventions in [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

Realtime events: `new_message`, `message_reaction`, `message_deleted`, `messages_seen`, `new_notification`, `story_reaction`, `user_typing`, `user_online`, `user_offline`, `new_comment`.

## Notes

- `bcryptjs` replaces native `bcrypt` so installs need no compiler toolchain (same algorithm).
- Multer 2.x is used (1.x has known CVEs).
- Story expiry is enforced in every query and physically cleaned up hourly by a job that spares stories saved to highlights.
- Rate limits are relaxed automatically in development.
