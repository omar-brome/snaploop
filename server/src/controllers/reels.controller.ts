import { Request, Response } from 'express';
import * as reelsService from '../services/reels.service';
import { created, ok } from '../utils/response';

export async function listReels(req: Request, res: Response) {
  const { items, meta } = await reelsService.getReelsFeed(
    req.user!.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function getReel(req: Request, res: Response) {
  const reel = await reelsService.getReelById(req.params.id, req.user?.id ?? null);
  return ok(res, reel);
}

export async function createReel(req: Request, res: Response) {
  const reel = await reelsService.createReel(req.user!.id, req.body);
  return created(res, reel);
}

export async function deleteReel(req: Request, res: Response) {
  await reelsService.deleteReel(req.user!.id, req.params.id);
  return ok(res, { message: 'Reel deleted' });
}

export async function likeReel(req: Request, res: Response) {
  const result = await reelsService.likeReel(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function unlikeReel(req: Request, res: Response) {
  const result = await reelsService.unlikeReel(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function viewReel(req: Request, res: Response) {
  const result = await reelsService.incrementView(req.user!.id, req.params.id);
  return ok(res, result);
}
