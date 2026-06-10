# Snaploop API contract

All responses: `{ success, data, meta, error }`. Lists use cursor pagination: query `?cursor=&limit=` → `meta: { nextCursor, hasMore }`. Auth = httpOnly cookie (or `Authorization: Bearer`). All routes require auth unless marked PUBLIC/OPTIONAL.

The "author" user shape: `{ id, username, fullName, avatarUrl, isVerified }`.

## /api/auth (implemented)
- POST `/register` { email, username, password, fullName } → { user } + sets cookies
- POST `/login` { identifier, password } → { user }
- POST `/refresh` (cookie) → { user }, POST `/logout`
- POST `/forgot-password` { email }, POST `/reset-password` { token, password }
- POST `/change-password` { currentPassword, newPassword }, POST `/verify-email` { token }, POST `/deactivate` { password }

## /api/upload (implemented)
- POST `/` multipart `files[]` (≤10), `?kind=avatar` for avatars → { media: [{ url, mediaType, width, height }] }

## /api/users
- GET `/me` → full own profile incl. email, counts { postCount, followerCount, followingCount }
- PATCH `/me` { fullName?, username?, bio?, websiteUrl?, avatarUrl?, gender?, isPrivate? } → updated profile
- GET `/suggested?limit=` → [author + { followerCount, isFollowing:false }] (not followed, not blocked, popular first)
- GET `/:username` (OPTIONAL auth) → profile: author + { bio, websiteUrl, isPrivate, postCount, followerCount, followingCount, followStatus: 'none'|'pending'|'accepted', followsMe, isBlocked, isOwnProfile }. 404 if blocked either way or inactive.
- POST `/:username/follow` → { status: 'accepted'|'pending' } (pending for private targets; notification FOLLOW or FOLLOW_REQUEST)
- DELETE `/:username/follow` (unfollow or cancel request)
- DELETE `/:username/follower` (remove follower)
- POST `/:username/follow/accept` , POST `/:username/follow/decline` (incoming request on own account)
- GET `/me/follow-requests` → paginated [author]
- GET `/:username/followers`, GET `/:username/following` → paginated [author + { isFollowing, followStatus }] (403 `PRIVATE_ACCOUNT` if private and not follower)
- POST `/:username/block`, DELETE `/:username/block`; GET `/me/blocked` → [author]
- GET `/:username/posts` (OPTIONAL) → paginated posts (grid shape: id, media[0], likeCount, commentCount, mediaCount)
- GET `/:username/reels` → paginated reels (grid shape)
- GET `/:username/tagged` → paginated posts the user is tagged in
- POST `/report` { targetId, targetType, reason, description? }

## /api/posts
Post shape: { id, caption, locationName, locationLat, locationLng, createdAt, commentsOff, likeCount, commentCount, user: author, media: [{ id, mediaUrl, mediaType, width, height, thumbnailUrl, displayOrder }], tags: [{ user: author, x, y }], isLiked, isSaved }
- POST `/` { caption?, locationName?, locationLat?, locationLng?, commentsOff?, media: [{ url, mediaType, width?, height?, displayOrder }], tagUserIds?: [{ userId, x, y }] } → post (parses #hashtags → hashtag rows + MENTION_CAPTION + TAGGED_IN_POST notifications)
- GET `/:id` (OPTIONAL) → post (404 if private-not-following/blocked/archived for non-owner)
- PATCH `/:id` { caption?, locationName?, commentsOff?, isArchived? } (owner; re-sync hashtags on caption change)
- DELETE `/:id` (owner)
- POST `/:id/like`, DELETE `/:id/like` (LIKE_POST notification; counter transactional)
- GET `/:id/likes` → paginated [author + { isFollowing }]
- POST `/:id/save` { collectionId? }, DELETE `/:id/save`
- GET `/me/saved` → paginated grid posts; GET `/me/archived` → paginated grid posts
- Collections: GET `/collections`, POST `/collections` { name }, PATCH `/collections/:id` { name? }, DELETE `/collections/:id`, GET `/collections/:id/posts` → paginated grid

## /api/comments
Comment shape: { id, content, createdAt, likeCount, isPinned, user: author, replyCount, isLiked, parentId, postId, reelId }
- GET `/?targetType=post|reel&targetId=&cursor=` → paginated top-level comments (pinned first)
- GET `/:id/replies` → paginated replies (oldest first)
- POST `/` { targetType, targetId, content, parentId? } → comment (notifications: COMMENT_POST/COMMENT_REEL to owner, COMMENT_REPLY to parent author, MENTION_COMMENT to mentions; emits socket `new_comment` to room post:<id>; 403 if commentsOff)
- DELETE `/:id` (comment author or content owner)
- POST `/:id/like`, DELETE `/:id/like` (LIKE_COMMENT)
- POST `/:id/pin`, DELETE `/:id/pin` (content owner; only top-level)

## /api/feed
- GET `/home?cursor=` → paginated full posts from followed (accepted) users + own, not archived; ranked recency + engagement (e.g. order by createdAt desc but score = recency-hours − 0.1×log(likes+1) tiebreak; keep cursor on createdAt)
- GET `/explore?cursor=` → paginated grid posts from non-followed public users, engagement-ranked
- GET `/suggested-posts?cursor=` → paginated full posts from public non-followed users (feed end)

## /api/stories
Story shape: { id, mediaUrl, mediaType, durationSeconds, caption, stickerData, createdAt, expiresAt, user: author, viewCount(own only), isViewed }
- GET `/tray` → [{ user: author, latestAt, allViewed, storyCount }] for self + followed users with active stories, self first then unseen-first
- GET `/user/:username` → active stories of that user (privacy enforced) [{ ...story, isViewed }]
- POST `/` { mediaUrl, mediaType, durationSeconds?, caption?, stickerData? } → story (expiresAt = now+24h)
- DELETE `/:id` (owner)
- POST `/:id/view` (marks viewed, increments viewCount once per viewer)
- GET `/:id/views` (owner) → paginated [{ viewer: author, viewedAt, reaction }]
- POST `/:id/react` { emoji } → stores reaction on the view row + emits `story_reaction` to owner + creates DM message (type STORY_REPLY) in 1:1 conversation

## /api/highlights
- GET `/user/:username` → [{ id, title, coverUrl, storyCount }]
- GET `/:id` → { id, title, coverUrl, stories: [story] }
- POST `/` { title, storyIds: [], coverUrl? }, PATCH `/:id` { title?, coverUrl?, addStoryIds?, removeStoryIds? }, DELETE `/:id` (owner)

## /api/reels
Reel shape: { id, videoUrl, thumbnailUrl, caption, audioName, audioArtist, durationSeconds, likeCount, commentCount, viewCount, createdAt, user: author + { isFollowing }, isLiked, isSaved? (no save for reels — omit) }
- GET `/?cursor=` → paginated reels feed (public + followed-private), engagement-ranked recency
- GET `/:id` (OPTIONAL) → reel
- POST `/` { videoUrl, thumbnailUrl?, caption?, audioName?, audioArtist?, durationSeconds? } → reel
- DELETE `/:id` (owner)
- POST `/:id/like`, DELETE `/:id/like` (LIKE_REEL)
- POST `/:id/view` (increment viewCount, fire-and-forget)

## /api/search
- GET `/?q=` → { users: [author + { followerCount, mutualCount }] (≤5), hashtags: [{ name, postCount }] (≤5), places: [{ name, lat, lng, postCount }] (≤5) }
- GET `/users?q=&cursor=`, GET `/hashtags?q=&cursor=`, GET `/places?q=&cursor=`
- GET `/hashtags/:name` → { name, postCount } ; GET `/hashtags/:name/posts?cursor=` → grid posts
- GET `/places/posts?name=&cursor=` → grid posts + { name, lat, lng }
- GET `/trending-hashtags?limit=10` → [{ name, postCount }]

## /api/notifications
Notification shape: { id, type, targetId, targetType, isRead, createdAt, sender: author, preview?: { thumbnailUrl } for post/reel targets }
- GET `/?cursor=` → paginated
- GET `/unread-count` → { count }
- POST `/read` { ids?: [] } (omit ids = mark all)
- GET `/preferences` → { [type]: boolean } (Redis-stored), PATCH `/preferences` { [type]: boolean } (createNotification respects prefs is NOT required — filter on list/emit is acceptable v1)

## /api/conversations
Conversation shape: { id, isGroup, groupName, groupAvatarUrl, participants: [author + { lastReadAt, isOnline }], lastMessage, unreadCount, updatedAt }
Message shape: { id, conversationId, type, content, mediaUrl, mediaType, sharedPost? (grid shape + author), sharedReel?, replyTo? { id, content, sender }, reactions: { [emoji]: [userId] }, isDeleted, createdAt, sender: author, seenBy: [userId] (participants with lastReadAt ≥ createdAt) }
- GET `/?cursor=` → paginated conversations (by updatedAt desc)
- POST `/` { participantIds: [], isGroup?, groupName? } → conversation (reuse existing 1:1 if exists)
- GET `/:id` → conversation detail
- PATCH `/:id` { groupName?, groupAvatarUrl? }; POST `/:id/participants` { userIds }; DELETE `/:id/participants/:userId` (creator removes, or self-leave)
- GET `/:id/messages?cursor=` → paginated newest-first
- POST `/:id/messages` { type?, content?, mediaUrl?, mediaType?, sharedPostId?, sharedReelId?, replyToId? } → message; bumps conversation.updatedAt; emits `new_message` to conversation room AND each participant's user room; MESSAGE notification optional (skip — unreadCount covers it)
- POST `/:id/read` (set lastReadAt=now; emit `messages_seen` { conversationId, userId, lastReadAt } to room)
- DELETE `/messages/:messageId` (sender; sets isDeleted, content nulled; emit `message_deleted`)
- POST `/messages/:messageId/reactions` { emoji } (toggle; emit `message_reaction` { messageId, conversationId, reactions })
- GET `/unread-total` → { count } (conversations with unread)

## Socket events (server-emitted)
`new_message`, `message_reaction`, `message_deleted`, `messages_seen`, `new_notification`, `story_reaction`, `user_typing`, `user_online`, `user_offline`, `new_comment`.
Client-emitted: `conversation:join/leave`, `post:join/leave`, `typing` { conversationId, isTyping }.
