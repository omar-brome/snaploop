import { Request, Response } from 'express';
import * as storiesService from '../services/stories.service';
import { created, ok } from '../utils/response';

export async function getTray(req: Request, res: Response) {
  const tray = await storiesService.getTray(req.user!.id);
  return ok(res, tray);
}

export async function getUserStories(req: Request, res: Response) {
  const stories = await storiesService.getUserStories(req.user!.id, req.params.username);
  return ok(res, stories);
}

export async function createStory(req: Request, res: Response) {
  const story = await storiesService.createStory(req.user!.id, req.body);
  return created(res, story);
}

export async function deleteStory(req: Request, res: Response) {
  await storiesService.deleteStory(req.user!.id, req.params.id);
  return ok(res, { message: 'Story deleted' });
}

export async function viewStory(req: Request, res: Response) {
  const result = await storiesService.viewStory(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function getStoryViewers(req: Request, res: Response) {
  const { items, meta } = await storiesService.getStoryViewers(
    req.user!.id,
    req.params.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function reactToStory(req: Request, res: Response) {
  const result = await storiesService.reactToStory(req.user!.id, req.params.id, req.body.emoji);
  return ok(res, result);
}
