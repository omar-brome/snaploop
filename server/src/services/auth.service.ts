import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { ApiError } from '../middleware/error';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.service';
import { env } from '../config/env';

// Refresh tokens are whitelisted in Redis under refresh:<userId>:<jti>.
// Rotation: every /refresh consumes the old jti and issues a new one, so a
// stolen-but-already-used refresh token is dead on arrival.

const refreshKey = (userId: string, jti: string) => `refresh:${userId}:${jti}`;
const resetKey = (token: string) => `pwreset:${token}`;
const verifyKey = (token: string) => `emailverify:${token}`;

export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  bio: true,
  avatarUrl: true,
  websiteUrl: true,
  isPrivate: true,
  isVerified: true,
  createdAt: true,
} as const;

async function issueTokens(user: { id: string; username: string }) {
  const accessToken = signAccessToken({ sub: user.id, username: user.username });
  const { token: refreshToken, jti } = signRefreshToken(user.id);
  await redis.set(refreshKey(user.id, jti), '1', 'EX', REFRESH_TOKEN_TTL_SECONDS);
  return { accessToken, refreshToken };
}

async function revokeAllRefreshTokens(userId: string) {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `refresh:${userId}:*`, 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
}

export async function register(input: {
  email: string;
  username: string;
  password: string;
  fullName: string;
}) {
  const email = input.email.toLowerCase();
  const username = input.username.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    throw new ApiError(
      409,
      existing.email === email ? 'Email is already registered' : 'Username is taken',
      'ALREADY_EXISTS'
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      username,
      fullName: input.fullName,
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: env.email.skipVerification ? new Date() : null,
    },
    select: PUBLIC_USER_SELECT,
  });

  if (!env.email.skipVerification) {
    const token = randomUUID();
    await redis.set(verifyKey(token), user.id, 'EX', 24 * 3600);
    await sendVerificationEmail(email, token);
  }

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function login(identifier: string, password: string) {
  const id = identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { username: id }] },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, 'Incorrect username or password', 'INVALID_CREDENTIALS');
  }

  // Logging in reactivates a deactivated (soft-deleted) account.
  if (!user.isActive) {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  }

  const tokens = await issueTokens(user);
  const { passwordHash: _ph, ...safeUser } = user;
  return { user: safeUser, ...tokens };
}

export async function refresh(refreshToken: string | undefined) {
  if (!refreshToken) throw new ApiError(401, 'No refresh token', 'NO_REFRESH_TOKEN');
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Consume-on-use: if the jti is gone the token was already rotated or revoked.
  const deleted = await redis.del(refreshKey(payload.sub, payload.jti));
  if (deleted === 0) throw new ApiError(401, 'Refresh token revoked', 'REFRESH_REVOKED');

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: PUBLIC_USER_SELECT,
  });
  if (!user) throw new ApiError(401, 'User no longer exists', 'USER_GONE');

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    await redis.del(refreshKey(payload.sub, payload.jti));
  } catch {
    // already invalid — nothing to revoke
  }
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always succeed from the caller's perspective to avoid account enumeration.
  if (!user) return;
  const token = randomUUID();
  await redis.set(resetKey(token), user.id, 'EX', 3600); // 1 hour
  await sendPasswordResetEmail(user.email, token);
}

export async function resetPassword(token: string, newPassword: string) {
  const userId = await redis.get(resetKey(token));
  if (!userId) throw new ApiError(400, 'Reset link is invalid or expired', 'INVALID_RESET_TOKEN');
  await redis.del(resetKey(token));
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await revokeAllRefreshTokens(userId);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(400, 'Current password is incorrect', 'WRONG_PASSWORD');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}

export async function verifyEmail(token: string) {
  const userId = await redis.get(verifyKey(token));
  if (!userId) throw new ApiError(400, 'Verification link is invalid or expired', 'INVALID_VERIFY_TOKEN');
  await redis.del(verifyKey(token));
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
}

export async function deactivateAccount(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(400, 'Password is incorrect', 'WRONG_PASSWORD');
  }
  await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  await revokeAllRefreshTokens(userId);
}
