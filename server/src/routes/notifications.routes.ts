import { Router } from 'express';
import { z } from 'zod';
import { NotificationType } from '@prisma/client';
import * as controller from '../controllers/notifications.controller';
import { asyncHandler } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(requireAuth);

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

const readBody = z.object({
  // Omit ids entirely to mark every notification read.
  ids: z.array(z.string().min(1)).max(100).optional(),
});

// Preference keys are validated against the NotificationType enum: the object
// shape only contains enum keys and .strict() rejects anything else.
const preferencesShape = Object.fromEntries(
  Object.values(NotificationType).map((type) => [type, z.boolean().optional()])
);
const preferencesBody = z.object(preferencesShape).strict();

router.get('/', validate({ query: listQuery }), asyncHandler(controller.list));

router.get('/unread-count', asyncHandler(controller.unreadCount));

router.post('/read', validate({ body: readBody }), asyncHandler(controller.markRead));

router.get('/preferences', asyncHandler(controller.getPreferences));

router.patch(
  '/preferences',
  validate({ body: preferencesBody }),
  asyncHandler(controller.updatePreferences)
);

export default router;
