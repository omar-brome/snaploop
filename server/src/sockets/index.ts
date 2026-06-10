import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { env } from '../config/env';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';

// Socket layer. Clients authenticate with the same JWT used for HTTP (sent
// via auth payload or the httpOnly cookie on the handshake request).
//
// Rooms:
//   user:<id>          — private room per user (notifications, DMs, presence)
//   conversation:<id>  — joined while a DM thread is open (typing indicators)
//   post:<id>          — joined on the post detail page (live comments)

let io: Server | null = null;

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      parseCookies(socket.handshake.headers.cookie).accessToken;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    // Presence: track sockets per user; first socket -> online broadcast.
    const count = await redis.sadd(PRESENCE_KEY(userId), socket.id);
    if (count === 1 && (await redis.scard(PRESENCE_KEY(userId))) === 1) {
      socket.broadcast.emit('user_online', { userId });
    }

    socket.on('conversation:join', (conversationId: string) => {
      if (typeof conversationId === 'string') socket.join(`conversation:${conversationId}`);
    });
    socket.on('conversation:leave', (conversationId: string) => {
      if (typeof conversationId === 'string') socket.leave(`conversation:${conversationId}`);
    });

    socket.on('post:join', (postId: string) => {
      if (typeof postId === 'string') socket.join(`post:${postId}`);
    });
    socket.on('post:leave', (postId: string) => {
      if (typeof postId === 'string') socket.leave(`post:${postId}`);
    });

    socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
      if (!data?.conversationId) return;
      socket.to(`conversation:${data.conversationId}`).emit('user_typing', {
        conversationId: data.conversationId,
        userId,
        username: socket.data.username,
        isTyping: !!data.isTyping,
      });
    });

    socket.on('disconnect', async () => {
      await redis.srem(PRESENCE_KEY(userId), socket.id);
      const remaining = await redis.scard(PRESENCE_KEY(userId));
      if (remaining === 0) {
        socket.broadcast.emit('user_offline', { userId, lastSeenAt: new Date().toISOString() });
        await prisma.user
          .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined);
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown) {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function emitToPost(postId: string, event: string, payload: unknown) {
  io?.to(`post:${postId}`).emit(event, payload);
}

export async function isUserOnline(userId: string): Promise<boolean> {
  return (await redis.scard(PRESENCE_KEY(userId))) > 0;
}
