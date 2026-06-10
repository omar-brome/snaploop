import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/stories.controller';
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

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

router.get('/tray', requireAuth, asyncHandler(controller.getTray));

router.get(
  '/user/:username',
  requireAuth,
  validate({ params: usernameParams }),
  asyncHandler(controller.getUserStories)
);

router.post(
  '/',
  requireAuth,
  validate({
    body: z.object({
      mediaUrl: z.string().min(1).max(2048),
      mediaType: z.enum(['IMAGE', 'VIDEO']),
      durationSeconds: z.number().positive().max(60).optional(),
      caption: z.string().max(500).optional(),
      // Arbitrary sticker/overlay JSON, stored as-is.
      stickerData: z.any().optional(),
    }),
  }),
  asyncHandler(controller.createStory)
);

router.delete('/:id', requireAuth, validate({ params: idParams }), asyncHandler(controller.deleteStory));

router.post('/:id/view', requireAuth, validate({ params: idParams }), asyncHandler(controller.viewStory));

router.get(
  '/:id/views',
  requireAuth,
  validate({ params: idParams, query: listQuery }),
  asyncHandler(controller.getStoryViewers)
);

router.post(
  '/:id/react',
  requireAuth,
  validate({ params: idParams, body: z.object({ emoji: z.string().min(1).max(16) }) }),
  asyncHandler(controller.reactToStory)
);

export default router;
