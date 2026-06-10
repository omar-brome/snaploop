import { Request, Response } from 'express';
import * as highlightsService from '../services/highlights.service';
import { created, ok } from '../utils/response';

export async function getUserHighlights(req: Request, res: Response) {
  const highlights = await highlightsService.getUserHighlights(req.user!.id, req.params.username);
  return ok(res, highlights);
}

export async function getHighlight(req: Request, res: Response) {
  const highlight = await highlightsService.getHighlightById(req.user!.id, req.params.id);
  return ok(res, highlight);
}

export async function createHighlight(req: Request, res: Response) {
  const highlight = await highlightsService.createHighlight(req.user!.id, req.body);
  return created(res, highlight);
}

export async function updateHighlight(req: Request, res: Response) {
  const highlight = await highlightsService.updateHighlight(req.user!.id, req.params.id, req.body);
  return ok(res, highlight);
}

export async function deleteHighlight(req: Request, res: Response) {
  await highlightsService.deleteHighlight(req.user!.id, req.params.id);
  return ok(res, { message: 'Highlight deleted' });
}
