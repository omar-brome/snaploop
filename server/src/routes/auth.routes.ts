import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/auth.controller';
import { asyncHandler } from '../middleware/error';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

const username = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30)
  .regex(/^[a-zA-Z0-9._]+$/, 'Only letters, numbers, dots and underscores');
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

router.post(
  '/register',
  authLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
      username,
      password,
      fullName: z.string().min(1).max(100),
    }),
  }),
  asyncHandler(controller.register)
);

router.post(
  '/login',
  authLimiter,
  validate({
    body: z.object({ identifier: z.string().min(1), password: z.string().min(1) }),
  }),
  asyncHandler(controller.login)
);

router.post('/refresh', asyncHandler(controller.refresh));
router.post('/logout', asyncHandler(controller.logout));

router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: z.object({ email: z.string().email() }) }),
  asyncHandler(controller.forgotPassword)
);

router.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(1), password }) }),
  asyncHandler(controller.resetPassword)
);

router.post(
  '/change-password',
  requireAuth,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: password }) }),
  asyncHandler(controller.changePassword)
);

router.post(
  '/verify-email',
  validate({ body: z.object({ token: z.string().min(1) }) }),
  asyncHandler(controller.verifyEmail)
);

router.post(
  '/deactivate',
  requireAuth,
  validate({ body: z.object({ password: z.string().min(1) }) }),
  asyncHandler(controller.deactivate)
);

export default router;
