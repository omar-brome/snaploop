import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { fail } from '../utils/response';

// Throw ApiError(status, message) anywhere; the error handler turns it into
// the standard error envelope.
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  return fail(res, 404, `Route not found: ${req.method} ${req.path}`, 'NOT_FOUND');
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.message, err.code);
  }
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return fail(res, 400, message, 'VALIDATION_ERROR');
  }
  console.error(`[error] ${req.method} ${req.path}:`, err);
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Internal server error';
  return fail(res, 500, message, 'INTERNAL_ERROR');
}

// Wrap async route handlers so rejections reach the error handler
// (express 4 does not catch async errors natively).
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
