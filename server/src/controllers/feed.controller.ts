import { Request, Response } from 'express';
import * as feedService from '../services/feed.service';
import { ok } from '../utils/response';
import { CursorPayload, decodeCursor } from '../utils/cursor';

function listParams(req: Request): { cursor: CursorPayload | null; limit: number } {
  const cursor = decodeCursor(req.query.cursor as string | undefined);
  const limit = Math.max(1, Math.min(parseInt((req.query.limit as string) ?? '12', 10), 50));
  return { cursor, limit };
}

export async function homeFeed(req: Request, res: Response) {
  const { cursor, limit } = listParams(req);
  const { items, meta } = await feedService.getHomeFeed(req.user!.id, cursor, limit);
  return ok(res, items, meta);
}

export async function exploreFeed(req: Request, res: Response) {
  const { cursor, limit } = listParams(req);
  const { items, meta } = await feedService.getExploreFeed(req.user!.id, cursor, limit);
  return ok(res, items, meta);
}

export async function suggestedPosts(req: Request, res: Response) {
  const { cursor, limit } = listParams(req);
  const { items, meta } = await feedService.getSuggestedPosts(req.user!.id, cursor, limit);
  return ok(res, items, meta);
}
