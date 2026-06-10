import { Router } from 'express';
import { z } from 'zod';
import { MediaType, MessageType } from '@prisma/client';
import * as controller from '../controllers/conversations.controller';
import { asyncHandler } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(requireAuth);

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/, 'limit must be a positive integer').optional(),
});

const idParams = z.object({ id: z.string().min(1) });

const participantParams = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
});

const messageParams = z.object({ messageId: z.string().min(1) });

const createBody = z.object({
  participantIds: z.array(z.string().min(1)).min(1).max(50),
  isGroup: z.boolean().optional(),
  groupName: z.string().min(1).max(100).optional(),
});

const patchBody = z
  .object({
    groupName: z.string().min(1).max(100).optional(),
    groupAvatarUrl: z.string().min(1).optional(),
  })
  .refine((b) => b.groupName !== undefined || b.groupAvatarUrl !== undefined, {
    message: 'At least one of groupName or groupAvatarUrl is required',
  });

const addParticipantsBody = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(50),
});

const sendMessageBody = z
  .object({
    type: z.nativeEnum(MessageType).optional(),
    content: z.string().min(1).max(2000).optional(),
    mediaUrl: z.string().min(1).optional(),
    mediaType: z.nativeEnum(MediaType).optional(),
    sharedPostId: z.string().min(1).optional(),
    sharedReelId: z.string().min(1).optional(),
    replyToId: z.string().min(1).optional(),
  })
  .refine((b) => !!(b.content || b.mediaUrl || b.sharedPostId || b.sharedReelId), {
    message: 'One of content, mediaUrl, sharedPostId or sharedReelId is required',
  });

const reactionBody = z.object({
  emoji: z.string().min(1).max(16),
});

router.get('/', validate({ query: listQuery }), asyncHandler(controller.list));

router.post('/', validate({ body: createBody }), asyncHandler(controller.create));

// Static and /messages/* paths must be registered before the '/:id' matchers.
router.get('/unread-total', asyncHandler(controller.unreadTotal));

router.delete(
  '/messages/:messageId',
  validate({ params: messageParams }),
  asyncHandler(controller.deleteMessage)
);

router.post(
  '/messages/:messageId/reactions',
  validate({ params: messageParams, body: reactionBody }),
  asyncHandler(controller.toggleReaction)
);

router.get('/:id', validate({ params: idParams }), asyncHandler(controller.getOne));

router.patch(
  '/:id',
  validate({ params: idParams, body: patchBody }),
  asyncHandler(controller.update)
);

router.post(
  '/:id/participants',
  validate({ params: idParams, body: addParticipantsBody }),
  asyncHandler(controller.addParticipants)
);

router.delete(
  '/:id/participants/:userId',
  validate({ params: participantParams }),
  asyncHandler(controller.removeParticipant)
);

router.get(
  '/:id/messages',
  validate({ params: idParams, query: listQuery }),
  asyncHandler(controller.listMessages)
);

router.post(
  '/:id/messages',
  validate({ params: idParams, body: sendMessageBody }),
  asyncHandler(controller.sendMessage)
);

router.post('/:id/read', validate({ params: idParams }), asyncHandler(controller.markRead));

export default router;
