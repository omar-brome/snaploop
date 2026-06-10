import rateLimit from 'express-rate-limit';

// Sensitive endpoints get tighter limits. Limits are generous in development
// so seeding/manual testing is not throttled.
const isDev = process.env.NODE_ENV !== 'production';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, meta: null, error: { message: 'Too many attempts, try again later', code: 'RATE_LIMITED' } },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: null, meta: null, error: { message: 'Upload limit reached, try again later', code: 'RATE_LIMITED' } },
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});
