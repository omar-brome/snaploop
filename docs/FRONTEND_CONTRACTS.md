# Frontend feature contracts

Read docs/CONVENTIONS.md (frontend section) and docs/API.md first. Types come from `client/src/types/index.ts`. Never edit shared files (components/, hooks/, services/, stores/, types/, App.tsx, AppShell.tsx, main.tsx, index.css, tailwind.config.js) — import them.

Each feature owns `client/src/features/<feature>/**` plus the page files listed below (overwrite the placeholder pages). Domain API calls: create `client/src/features/<feature>/api.ts` using `api`/`api.page` from `services/api.ts`.

Cross-feature imports are allowed ONLY through the exact exports listed here. If you IMPORT one of these, code against the contract even if the file doesn't exist yet (another agent is writing it).

## features/stories (owner: stories agent)
- Pages owned: none (tray/viewer are embedded components)
- `features/stories/StoryTray.tsx` → `export function StoryTray()` — self-fetching tray (GET /stories/tray), gradient ring for unseen (Avatar ring prop), opens the viewer on click. Skeleton: `StoryTraySkeleton` from components/ui/Skeleton.
- `features/stories/StoryViewer.tsx` → `export function StoryViewer({ username, onClose }: { username: string; onClose: () => void })` — fullscreen overlay viewer for that user's active stories: progress bars (5s images / durationSeconds video), tap left/right zones, swipe-down dismiss, view marking (POST /stories/:id/view), reply input ("Send message" → POST /conversations + message), quick emoji reactions (POST /stories/:id/react), own-story viewers sheet (GET /stories/:id/views), caption + stickerData text overlays rendering.
- `features/stories/StoryComposer.tsx` → `export function StoryComposer({ onDone }: { onDone: () => void })` — file pick, preview, text overlay tool (drag/color/size, stored in stickerData JSON), upload via services/upload.ts then POST /stories.
- `features/stories/HighlightsRow.tsx` → `export function HighlightsRow({ username, isOwnProfile }: { username: string; isOwnProfile: boolean })` — GET /highlights/user/:username, circles row, click opens highlight viewer (reuses viewer internals); owners can create (POST /highlights from own stories) and delete.

## features/comments (owner: feed agent)
- `features/comments/CommentSection.tsx` → `export function CommentSection({ targetType, targetId, ownerId, commentsOff }: { targetType: 'post' | 'reel'; targetId: string; ownerId: string; commentsOff?: boolean })` — list (pinned first), nested replies expand, like, reply (prefills @username), delete own (hover/long-press), pin (owner), @mention autocomplete (GET /search/users?q=), emoji picker button (simple emoji grid popover), live `new_comment` socket on `post:join` room, sticky input. Used by PostDetailPage and ReelDetailPage.
- `features/comments/CommentSheet.tsx` → `export function CommentSheet({ open, onClose, targetType, targetId, ownerId, commentsOff }: same + { open: boolean; onClose: () => void })` — Modal variant='sheet' wrapper around CommentSection.

## features/feed (owner: feed agent)
- Pages owned: `pages/FeedPage.tsx`, `pages/PostDetailPage.tsx`
- FeedPage: renders `<StoryTray />` (import from features/stories), infinite home feed (GET /feed/home) with `PostSkeleton`, pull-to-refresh on touch, suggested-posts section when feed exhausts (GET /feed/suggested-posts) + suggested users row (GET /users/suggested).
- `features/feed/PostCard.tsx` → `export function PostCard({ post }: { post: Post })` — header (avatar/username/location/time/options menu), media carousel (swipe + arrows + dot indicators, multi-media), double-tap big-heart animation (`animate-heart-pop`), like (`useLikePost`, `animate-like-bounce`), comment (opens CommentSheet or navigates to /p/:id on desktop), share menu (copy link via clipboard + "Send to..." DM picker: GET /conversations then POST message with sharedPostId), save with collection popover (`useSavePost`, GET/POST /posts/collections), caption with RichText + "more" expand past 3 lines, "View all X comments", inline like count; own-post options (edit caption, archive, delete with ConfirmDialog, toggle comments, copy link), other-post options (report POST /users/report, unfollow).
- PostDetailPage: two-column on desktop (media | comments), single column mobile; full CommentSection; likes list modal (GET /posts/:id/likes).

## features/reels (owner: reels agent)
- Pages owned: `pages/ReelsPage.tsx`, `pages/ReelDetailPage.tsx`
- ReelsPage: vertical snap-scroll full-screen feed (GET /reels), IntersectionObserver autoplay/pause, loop, mute toggle, right action rail (like via POST/DELETE /reels/:id/like optimistic, comment → CommentSheet from features/comments, share → copy link/DM), follow button overlay when not following (POST /users/:username/follow), audio marquee (`animate-marquee`), caption expand, view tracking (POST /reels/:id/view once per reel per session).
- ReelDetailPage: video + CommentSection.
- `features/reels/ReelComposer.tsx` → `export function ReelComposer({ onDone }: { onDone: () => void })` — video pick (≤90s validated via metadata), thumbnail scrub (canvas frame capture) + custom thumbnail upload, caption, audio name fields, upload then POST /reels.

## features/explore (owner: explore agent)
- Pages owned: `pages/ExplorePage.tsx`, `pages/SearchPage.tsx`, `pages/HashtagPage.tsx`, `pages/PlacePage.tsx`
- ExplorePage: masonry-ish grid (GET /feed/explore, GridSkeleton), trending hashtag chip row (GET /search/trending-hashtags), tiles link /p/:id.
- SearchPage: debounced (300ms) unified search (GET /search?q=), tabs All/Users/Tags/Places (per-type endpoints for pagination), user rows (avatar/username/fullName/followerCount/mutualCount), recent searches in localStorage (clearable, click-through), empty states.
- HashtagPage: header (#name + postCount), grid GET /search/hashtags/:name/posts.
- PlacePage: header (name + lat/lng static map placeholder pin), grid GET /search/places/posts?name=.
- `features/explore/PostGrid.tsx` → `export function PostGrid({ posts, onEndReached, emptyState }: { posts: GridPost[]; onEndReached?: () => void; emptyState?: ReactNode })` — 3-col grid, hover overlay with like+comment counts, multi-media indicator icon, links to /p/:id. ALSO USED BY profile agent.

## features/profile (owner: profile agent)
- Pages owned: `pages/ProfilePage.tsx`, `pages/EditProfilePage.tsx`, `pages/SettingsPage.tsx`
- ProfilePage: header (avatar — wrap with story ring + click opens `<StoryViewer username>` when stories exist via GET /stories/tray match or try/catch; counts clickable → followers/following modals with follow buttons + search; bio RichText; website link), follow/unfollow/requested/follow-back states (`useFollow`), message button (POST /conversations → navigate /messages/:id), block/unblock + report menu, share profile (copy link), `<HighlightsRow>` import, tabs: Posts / Reels / Tagged (+ Saved with collections only when own profile; GET /posts/me/saved, collections UI) using `<PostGrid>` from features/explore; private account lock state; follow requests banner on own profile (GET /users/me/follow-requests, accept/decline).
- EditProfilePage: avatar upload with circular crop (canvas), fields (name/username/bio/website/gender), private toggle with confirm, react-hook-form + zod, PATCH /users/me (update authStore on success).
- SettingsPage: change password form, dark-mode toggle, notification preferences (GET/PATCH /notifications/preferences, one switch per type), blocked accounts list (GET /users/me/blocked + unblock), deactivate account (password confirm + ConfirmDialog → POST /auth/deactivate → logout()).

## features/dm (owner: dm agent)
- Pages owned: `pages/MessagesPage.tsx` (handles both /messages and /messages/:conversationId — list pane + thread pane, responsive master/detail)
- Inbox: GET /conversations infinite, unread badges, online dots (user_online/user_offline socket), conversation search filter, new-conversation modal (user search GET /search/users, multi-select → group with name).
- Thread: GET /conversations/:id/messages infinite (newest at bottom, load older upward), bubbles with reactions (hover/long-press emoji picker → POST /conversations/messages/:id/reactions), reply-to (quoted preview), shared post/reel preview cards (link through), story-reply rendering, unsend (DELETE /conversations/messages/:id), seen receipts ("Seen" 1:1 / "Seen by N" groups from seenBy), typing indicator (emit `typing`, render `user_typing`), image/video attach via services/upload, group manage sheet (rename, avatar, add/remove members, leave).
- Socket: join room on open (`conversation:join`/`leave`), `new_message` (append + invalidate inbox), `message_reaction`, `message_deleted`, `messages_seen`. Mark read on focus/open (POST /conversations/:id/read).

## features/notifications (owner: notifications agent)
- Pages owned: `pages/NotificationsPage.tsx`
- Infinite list (GET /notifications), sender avatar + action text per type + target thumbnail (preview.thumbnailUrl) + timeAgo, follow-request rows with Accept/Decline (POST /users/:username/follow/accept|decline), follow rows with Follow-back button, client-side grouping of consecutive same-type/same-target likes ("A and N others liked your post"), tap navigation (post → /p/:id, reel → /reels/:id, user → /:username, comment → /p/:postId — comment targetId is the comment; for v1 navigate to the post detail if targetType POST/REEL else profile), "Mark all as read" (POST /notifications/read on mount too), live prepend on `new_notification` socket, browser push permission prompt button (Notification API; show local notification on socket event when granted), empty state.

## features/upload (owner: upload agent)
- Pages owned: `pages/CreatePage.tsx`
- Tabs: Post / Story / Reel. Story tab renders `<StoryComposer onDone>` (import features/stories), Reel tab `<ReelComposer onDone>` (import features/reels).
- Post flow (own code, features/upload/): multi-select 1–10 files with previews + drag/arrow reorder; filter step: 12 CSS filter classes (.filter-clarendon etc. from index.css) with live thumbnail strip + brightness/contrast/saturation sliders (inline CSS filter) — applied by canvas re-render on submit (or stored as no-op if Normal+defaults); crop step with aspect presets (Original/1:1/4:5/16:9, canvas crop); details step: caption textarea (2200 max, emoji-friendly) with #/@ as-you-type, location name input (lat/lng optional skip), tag-people overlay (click image → user search popover → place {userId,x,y}), comments-off toggle; client compress via services/upload compressImage; uploadFiles with progress bar; POST /posts; draft autosave to localStorage (restore prompt on return, clear on publish). Video files: skip filter/crop, show preview, optional trim UI may be simplified (start/end number inputs) — thumbnail auto from first frame via canvas.
