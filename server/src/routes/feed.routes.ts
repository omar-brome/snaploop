import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/feed.controller';
import { asyncHandler } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

router.get(
  '/home',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.homeFeed)
);

router.get(
  '/explore',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.exploreFeed)
);

router.get(
  '/suggested-posts',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.suggestedPosts)
);

export default router;
