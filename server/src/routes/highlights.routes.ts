import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/highlights.controller';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';

const router = Router();

const idParams = z.object({ id: z.string().min(1) });

const usernameParams = z.object({
  username: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-zA-Z0-9._]+$/, 'Invalid username'),
});

const createBody = z.object({
  title: z.string().min(1).max(50),
  storyIds: z.array(z.string().min(1)).min(1, 'At least one story is required'),
  coverUrl: z.string().min(1).max(2048).optional(),
});

const updateBody = z.object({
  title: z.string().min(1).max(50).optional(),
  coverUrl: z.string().min(1).max(2048).optional(),
  addStoryIds: z.array(z.string().min(1)).optional(),
  removeStoryIds: z.array(z.string().min(1)).optional(),
});

router.get(
  '/user/:username',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.getUserHighlights)
);

router.get('/:id', requireAuth, validate({ params: idParams }), asyncHandler(controller.getHighlight));

router.post('/', requireAuth, validate({ body: createBody }), asyncHandler(controller.createHighlight));

router.patch(
  '/:id',
  requireAuth,
  validate({ params: idParams, body: updateBody }),
  asyncHandler(controller.updateHighlight)
);

router.delete(
  '/:id',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.deleteHighlight)
);

export default router;
