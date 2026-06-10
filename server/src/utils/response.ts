import { Response } from 'express';

// Every endpoint returns { success, data, meta, error } so the client can
// handle responses uniformly.
export interface Meta {
  nextCursor?: string | null;
  hasMore?: boolean;
  total?: number;
  [key: string]: unknown;
}

export function ok(res: Response, data: unknown = null, meta?: Meta, status = 200) {
  return res.status(status).json({ success: true, data, meta: meta ?? null, error: null });
}

export function created(res: Response, data: unknown = null, meta?: Meta) {
  return ok(res, data, meta, 201);
}

export function fail(res: Response, status: number, message: string, code?: string) {
  return res
    .status(status)
    .json({ success: false, data: null, meta: null, error: { message, code: code ?? null } });
}
