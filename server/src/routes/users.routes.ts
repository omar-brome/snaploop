import { Router } from 'express';
import { z } from 'zod';
import { ReportTargetType } from '@prisma/client';
import * as controller from '../controllers/users.controller';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth } from '../middleware/auth';

const router = Router();

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

const suggestedQuery = z.object({
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

// Usernames are stored lowercase, so lookups are case-insensitive.
const usernameParams = z.object({
  username: z
    .string()
    .min(1)
    .max(30)
    .transform((v) => v.toLowerCase()),
});

const updateMeBody = z.object({
  fullName: z.string().min(1).max(100).optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(
      /^[a-zA-Z0-9._]+$/,
      'Username may only contain letters, numbers, dots and underscores'
    )
    .transform((v) => v.toLowerCase())
    .optional(),
  bio: z.string().max(500).nullable().optional(),
  websiteUrl: z.string().max(255).nullable().optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
  gender: z.string().max(30).nullable().optional(),
  isPrivate: z.boolean().optional(),
});

const reportBody = z.object({
  targetId: z.string().min(1),
  targetType: z.nativeEnum(ReportTargetType),
  reason: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});

// Fixed paths MUST be registered before /:username so the param route
// doesn't capture them.

router.get('/me', requireAuth, asyncHandler(controller.getMe));

router.patch('/me', requireAuth, validate({ body: updateMeBody }), asyncHandler(controller.updateMe));

router.get(
  '/me/follow-requests',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.getFollowRequests)
);

router.get(
  '/me/blocked',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.getBlockedUsers)
);

router.get(
  '/suggested',
  requireAuth,
  validate({ query: suggestedQuery }),
  asyncHandler(controller.getSuggested)
);

router.post(
  '/report',
  requireAuth,
  validate({ body: reportBody }),
  asyncHandler(controller.createReport)
);

router.get(
  '/:username',
  optionalAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.getProfile)
);

router.post(
  '/:username/follow',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.follow)
);

router.delete(
  '/:username/follow',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.unfollow)
);

router.delete(
  '/:username/follower',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.removeFollower)
);

router.post(
  '/:username/follow/accept',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.acceptFollowRequest)
);

router.post(
  '/:username/follow/decline',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.declineFollowRequest)
);

router.get(
  '/:username/followers',
  requireAuth,
  validate({ params: usernameParams, query: listQuery }),
  asyncHandler(controller.getFollowers)
);

router.get(
  '/:username/following',
  requireAuth,
  validate({ params: usernameParams, query: listQuery }),
  asyncHandler(controller.getFollowing)
);

router.post(
  '/:username/block',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.block)
);

router.delete(
  '/:username/block',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.unblock)
);

router.get(
  '/:username/posts',
  optionalAuth,
  validate({ params: usernameParams, query: listQuery }),
  asyncHandler(controller.getUserPosts)
);

router.get(
  '/:username/reels',
  requireAuth,
  validate({ params: usernameParams, query: listQuery }),
  asyncHandler(controller.getUserReels)
);

router.get(
  '/:username/tagged',
  requireAuth,
  validate({ params: usernameParams, query: listQuery }),
  asyncHandler(controller.getUserTagged)
);

export default router;
