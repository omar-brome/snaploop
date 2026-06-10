import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/posts.controller';
import { asyncHandler } from '../middleware/error';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// ───────────────────────── Schemas ─────────────────────────

const id = z.string().min(1);
const idParams = z.object({ id });

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

const mediaItem = z.object({
  url: z.string().min(1),
  mediaType: z.enum(['IMAGE', 'VIDEO']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  displayOrder: z.number().int().min(0),
});

// x/y are 0-1 fractions of the image.
const tagItem = z.object({
  userId: id,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const createPostBody = z.object({
  caption: z.string().trim().max(2200).optional(),
  locationName: z.string().trim().max(255).optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  commentsOff: z.boolean().optional(),
  media: z.array(mediaItem).min(1, 'At least one media item is required').max(10),
  tagUserIds: z.array(tagItem).max(20).optional(),
});

const updatePostBody = z.object({
  caption: z.string().trim().max(2200).nullable().optional(),
  locationName: z.string().trim().max(255).nullable().optional(),
  commentsOff: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

const collectionName = z.string().trim().min(1, 'Name is required').max(100);

const saveBody = z.object({ collectionId: id.optional() });

// ───────────────────────── Create ─────────────────────────

router.post(
  '/',
  requireAuth,
  validate({ body: createPostBody }),
  asyncHandler(controller.createPost)
);

// ─────────────── Static paths — MUST precede /:id routes ───────────────

router.get(
  '/me/saved',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.listSavedPosts)
);

router.get(
  '/me/archived',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.listArchivedPosts)
);

router.get(
  '/collections',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(controller.listCollections)
);

router.post(
  '/collections',
  requireAuth,
  validate({ body: z.object({ name: collectionName }) }),
  asyncHandler(controller.createCollection)
);

router.patch(
  '/collections/:id',
  requireAuth,
  validate({ params: idParams, body: z.object({ name: collectionName.optional() }) }),
  asyncHandler(controller.updateCollection)
);

router.delete(
  '/collections/:id',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.deleteCollection)
);

router.get(
  '/collections/:id/posts',
  requireAuth,
  validate({ params: idParams, query: listQuery }),
  asyncHandler(controller.listCollectionPosts)
);

// ───────────────────────── Single post ─────────────────────────

router.get(
  '/:id',
  optionalAuth,
  validate({ params: idParams }),
  asyncHandler(controller.getPost)
);

router.patch(
  '/:id',
  requireAuth,
  validate({ params: idParams, body: updatePostBody }),
  asyncHandler(controller.updatePost)
);

router.delete(
  '/:id',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.deletePost)
);

// ───────────────────────── Likes ─────────────────────────

router.post(
  '/:id/like',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.likePost)
);

router.delete(
  '/:id/like',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.unlikePost)
);

router.get(
  '/:id/likes',
  requireAuth,
  validate({ params: idParams, query: listQuery }),
  asyncHandler(controller.listPostLikes)
);

// ───────────────────────── Saves ─────────────────────────

router.post(
  '/:id/save',
  requireAuth,
  validate({ params: idParams, body: saveBody }),
  asyncHandler(controller.savePost)
);

router.delete(
  '/:id/save',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.unsavePost)
);

export default router;
