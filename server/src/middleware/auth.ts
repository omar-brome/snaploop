import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from './error';

// The authenticated user is attached to req.user by requireAuth/optionalAuth.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; username: string };
    }
  }
}

function extractToken(req: Request): string | null {
  // Access token travels in an httpOnly cookie; Authorization header is also
  // accepted for API clients and tests.
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(new ApiError(401, 'Authentication required', 'UNAUTHENTICATED'));
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch {
    return next(new ApiError(401, 'Invalid or expired access token', 'TOKEN_EXPIRED'));
  }
}

// Attaches req.user when a valid token is present but never rejects —
// used for public pages that render differently when logged in.
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, username: payload.username };
    } catch {
      // ignore invalid token on optional routes
    }
  }
  return next();
}
