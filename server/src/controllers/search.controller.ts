import { Request, Response } from 'express';
import * as searchService from '../services/search.service';
import { ok } from '../utils/response';

function parseLimit(raw: unknown, fallback: number): number {
  const parsed = parseInt(typeof raw === 'string' ? raw : `${fallback}`, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 50);
}

export async function unifiedSearch(req: Request, res: Response) {
  const results = await searchService.unifiedSearch(req.user!.id, req.query.q as string);
  return ok(res, results);
}

export async function searchUsers(req: Request, res: Response) {
  const { items, meta } = await searchService.searchUsers(
    req.user!.id,
    req.query.q as string,
    req.query.cursor as string | undefined,
    parseLimit(req.query.limit, 12)
  );
  return ok(res, items, meta);
}

export async function searchHashtags(req: Request, res: Response) {
  const { items, meta } = await searchService.searchHashtags(
    req.query.q as string,
    req.query.cursor as string | undefined,
    parseLimit(req.query.limit, 12)
  );
  return ok(res, items, meta);
}

export async function searchPlaces(req: Request, res: Response) {
  // Places are aggregated per query (no keyset cursor) — the service always
  // returns hasMore: false, so the accepted cursor param is a no-op.
  const { items, meta } = await searchService.searchPlaces(
    req.user!.id,
    req.query.q as string,
    parseLimit(req.query.limit, 12)
  );
  return ok(res, items, meta);
}

export async function getHashtag(req: Request, res: Response) {
  const hashtag = await searchService.getHashtag(req.params.name);
  return ok(res, hashtag);
}

export async function getHashtagPosts(req: Request, res: Response) {
  const { items, meta } = await searchService.getHashtagPosts(
    req.user!.id,
    req.params.name,
    req.query.cursor as string | undefined,
    parseLimit(req.query.limit, 12)
  );
  return ok(res, items, meta);
}

export async function getPlacePosts(req: Request, res: Response) {
  // meta carries { name, lat, lng } alongside the pagination fields.
  const { items, meta } = await searchService.getPlacePosts(
    req.user!.id,
    req.query.name as string,
    req.query.cursor as string | undefined,
    parseLimit(req.query.limit, 12)
  );
  return ok(res, items, meta);
}

export async function getTrendingHashtags(req: Request, res: Response) {
  const hashtags = await searchService.getTrendingHashtags(parseLimit(req.query.limit, 10));
  return ok(res, hashtags);
}
