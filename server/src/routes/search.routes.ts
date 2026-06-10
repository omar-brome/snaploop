import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/search.controller';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';

const router = Router();

const limit = z.string().regex(/^\d+$/, 'limit must be a positive integer').optional();
const cursor = z.string().optional();
const q = z.string().trim().min(1, 'q is required');

const searchQuery = z.object({ q, cursor, limit });
const placePostsQuery = z.object({
  name: z.string().trim().min(1, 'name is required'),
  cursor,
  limit,
});
const pageQuery = z.object({ cursor, limit });
const trendingQuery = z.object({ limit });
const hashtagParams = z.object({ name: z.string().trim().min(1, 'name is required') });

// Literal routes are registered before param routes so e.g. /trending-hashtags
// and /places/posts never fall into /hashtags/:name.
router.get(
  '/',
  requireAuth,
  validate({ query: searchQuery }),
  asyncHandler(controller.unifiedSearch)
);

router.get(
  '/users',
  requireAuth,
  validate({ query: searchQuery }),
  asyncHandler(controller.searchUsers)
);

router.get(
  '/hashtags',
  requireAuth,
  validate({ query: searchQuery }),
  asyncHandler(controller.searchHashtags)
);

router.get(
  '/places',
  requireAuth,
  validate({ query: searchQuery }),
  asyncHandler(controller.searchPlaces)
);

router.get(
  '/places/posts',
  requireAuth,
  validate({ query: placePostsQuery }),
  asyncHandler(controller.getPlacePosts)
);

router.get(
  '/trending-hashtags',
  requireAuth,
  validate({ query: trendingQuery }),
  asyncHandler(controller.getTrendingHashtags)
);

router.get(
  '/hashtags/:name/posts',
  requireAuth,
  validate({ params: hashtagParams, query: pageQuery }),
  asyncHandler(controller.getHashtagPosts)
);

router.get(
  '/hashtags/:name',
  requireAuth,
  validate({ params: hashtagParams }),
  asyncHandler(controller.getHashtag)
);

export default router;
