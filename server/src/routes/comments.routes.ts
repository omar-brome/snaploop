import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/comments.controller';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';

const router = Router();

const id = z.string().min(1);
const targetType = z.enum(['post', 'reel']);
const content = z.string().trim().min(1, 'Comment cannot be empty').max(500);

const idParams = z.object({ id });
const paging = {
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a number').optional(),
};

router.get(
  '/',
  requireAuth,
  validate({ query: z.object({ targetType, targetId: id, ...paging }) }),
  asyncHandler(controller.listComments)
);

router.get(
  '/:id/replies',
  requireAuth,
  validate({ params: idParams, query: z.object({ ...paging }) }),
  asyncHandler(controller.listReplies)
);

router.post(
  '/',
  requireAuth,
  validate({ body: z.object({ targetType, targetId: id, content, parentId: id.optional() }) }),
  asyncHandler(controller.createComment)
);

router.delete(
  '/:id',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.deleteComment)
);

router.post(
  '/:id/like',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.likeComment)
);

router.delete(
  '/:id/like',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.unlikeComment)
);

router.post(
  '/:id/pin',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.pinComment)
);

router.delete(
  '/:id/pin',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.unpinComment)
);

export default router;
