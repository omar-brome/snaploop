# Snaploop — Backend conventions (read before writing any feature module)

## Layout & ownership
Each backend domain owns exactly three files (replace the placeholder route file):
- `server/src/routes/<domain>.routes.ts` — Router with zod validation; default export
- `server/src/controllers/<domain>.controller.ts` — thin: pull req data, call service, send response
- `server/src/services/<domain>.service.ts` — Prisma queries + business rules

Never edit `app.ts`, `index.ts`, other domains' files, middleware, `sockets/index.ts`, or `prisma/schema.prisma`. Routers are already mounted in app.ts:
auth `/api/auth`, users `/api/users`, posts `/api/posts`, comments `/api/comments`, feed `/api/feed`, stories `/api/stories`, reels `/api/reels`, search `/api/search`, notifications `/api/notifications`, conversations `/api/conversations`, highlights `/api/highlights`, upload `/api/upload`.

## Response envelope
Use `ok(res, data, meta?)`, `created(res, data)` from `src/utils/response.ts`. Errors: `throw new ApiError(status, message, code)` from `src/middleware/error.ts`. Never `res.json` directly.

## Routes
- Wrap every async handler in `asyncHandler` from `src/middleware/error.ts`.
- Auth: `requireAuth` / `optionalAuth` from `src/middleware/auth.ts`; user is `req.user!.id`.
- Validation: `validate({ body?, query?, params? })` from `src/middleware/validate.ts` with zod schemas defined in the routes file.

## Pagination (cursor-based, mandatory for all lists)
Use `decodeCursor`, `cursorWhere`, `paginate` from `src/utils/cursor.ts`:
```ts
const cursor = decodeCursor(req.query.cursor as string | undefined);
const limit = Math.min(parseInt((req.query.limit as string) ?? '12', 10), 50);
const rows = await prisma.post.findMany({
  where: { AND: [baseWhere, cursorWhere(cursor)] },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit + 1,
  include: {...},
});
const { items, meta } = paginate(rows, limit);
return ok(res, items, meta);
```

## Media
Files are uploaded separately via POST `/api/upload` which returns `{ media: [{ url, mediaType, width, height }] }`. Feature endpoints accept media URLs in JSON — never use multer in feature routes.

## Notifications
Use `createNotification` / `notifyMentions` from `src/services/notification.service.ts` (it persists + emits `new_notification` over the socket; skips self-notifications). Types are the Prisma enums `NotificationType` / `NotificationTargetType`.

## Realtime
From `src/sockets/index.ts`: `emitToUser(userId, event, payload)`, `emitToConversation(conversationId, event, payload)`, `emitToPost(postId, event, payload)`, `isUserOnline(userId)`. Socket rooms (`user:<id>`, `conversation:<id>`, `post:<id>`), presence, and typing events already exist — do not re-implement.

## Mentions/hashtags
`extractHashtags`, `extractMentions` from `src/utils/parse.ts`.

## Privacy & blocking rules (enforce in services)
- Private accounts: content (posts/stories/reels/follower lists) visible only to accepted followers and the owner. Profiles themselves are public but show the "private" flag.
- Blocks are mutual invisibility: if either user blocked the other, hide content and return 404 for direct access. Helper pattern: check `prisma.userBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } })`.
- Soft-deleted users (`isActive: false`): exclude their content everywhere.
- Expired stories (`expiresAt < now`): exclude from all queries.

## Denormalized counters
`likeCount`/`commentCount`/`postCount` etc. are updated transactionally with the action (`prisma.$transaction` or `update({ data: { likeCount: { increment: 1 } } })`). Never recount on read.

## User shape returned to clients
Always select this minimal author shape on related users:
`{ id, username, fullName, avatarUrl, isVerified }` (+ `isPrivate` where relevant). Never return `passwordHash` or `email` for other users.

## Style
TypeScript strict. Prisma client from `src/lib/prisma.ts` (named export `prisma`), Redis from `src/lib/redis.ts`. Comments only for non-obvious rules. cuid string IDs. All DB columns are snake_case via @map — use the camelCase Prisma field names in code.

---

# Frontend conventions

## Layout & ownership
Each frontend feature owns `client/src/features/<feature>/` (components + hooks + local logic) and its page files under `client/src/pages/`. Shared pieces live in `client/src/components`, `client/src/hooks`, `client/src/stores`, `client/src/services`, `client/src/types`, `client/src/utils` — read them, never modify them.

## Server state
React Query only (no fetch in components). Keys: `['feed']`, `['post', id]`, `['profile', username]`, `['stories']`, `['notifications']`, `['conversations']`, `['messages', conversationId]`, `['search', q]`, `['reels']`, `['explore']`, `['comments', targetType, targetId]`.
API calls go through `client/src/services/api.ts` axios instance (`api`) — it unwraps the `{ success, data, meta, error }` envelope and handles 401 refresh. Helpers in `client/src/services/` per domain.

## Infinite lists
`useInfiniteQuery` with `getNextPageParam: (last) => last.meta?.hasMore ? last.meta.nextCursor : undefined`, passing `cursor` as query param.

## Optimistic updates
Likes/follows/saves: `onMutate` cache patch + rollback `onError` (see `useLikePost` in `client/src/hooks/useLike.ts` once present as reference).

## Realtime
`client/src/services/socket.ts` exposes `getSocket()` (singleton, connects after login). Listen/cleanup inside `useEffect`.

## UI
Tailwind, dark mode via `dark:` classes (class strategy on `<html>`). Shared UI kit in `client/src/components/ui/` (Button, Avatar, Modal, Spinner, Skeleton, Toast...). Icons: lucide-react. Animations: framer-motion. Time: `timeAgo` util. Forms: react-hook-form + zod resolver.

## Types
Shared API types in `client/src/types/index.ts` mirror the server JSON (camelCase).
