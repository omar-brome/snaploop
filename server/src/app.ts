import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { generalLimiter } from './middleware/rateLimit';

import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import postsRoutes from './routes/posts.routes';
import commentsRoutes from './routes/comments.routes';
import feedRoutes from './routes/feed.routes';
import storiesRoutes from './routes/stories.routes';
import reelsRoutes from './routes/reels.routes';
import searchRoutes from './routes/search.routes';
import notificationsRoutes from './routes/notifications.routes';
import conversationsRoutes from './routes/conversations.routes';
import highlightsRoutes from './routes/highlights.routes';
import uploadRoutes from './routes/upload.routes';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
if (!env.isProd) app.use(morgan('dev'));
app.use('/api', generalLimiter);

// Uploaded media (local storage driver)
app.use('/uploads', express.static(path.resolve(process.cwd(), env.storage.uploadDir), {
  maxAge: '7d',
  immutable: true,
}));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, meta: null, error: null });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/reels', reelsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/highlights', highlightsRoutes);
app.use('/api/upload', uploadRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
