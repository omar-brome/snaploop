import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/reels.controller';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth } from '../middleware/auth';

const router = Router();

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

const idParams = z.object({ id: z.string().min(1) });

const createReelBody = z.object({
  videoUrl: z.string().min(1).max(2048),
  thumbnailUrl: z.string().min(1).max(2048).optional(),
  caption: z.string().max(2200).optional(),
  audioName: z.string().max(255).optional(),
  audioArtist: z.string().max(255).optional(),
  durationSeconds: z
    .number()
    .positive()
    .max(90, 'Reel duration must be 90 seconds or less')
    .optional(),
});

router.get('/', requireAuth, validate({ query: listQuery }), asyncHandler(controller.listReels));

router.post(
  '/',
  requireAuth,
  validate({ body: createReelBody }),
  asyncHandler(controller.createReel)
);

router.get('/:id', optionalAuth, validate({ params: idParams }), asyncHandler(controller.getReel));

router.delete(
  '/:id',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.deleteReel)
);

router.post(
  '/:id/like',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.likeReel)
);

router.delete(
  '/:id/like',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.unlikeReel)
);

router.post(
  '/:id/view',
  requireAuth,
  validate({ params: idParams }),
  asyncHandler(controller.viewReel)
);

export default router;
