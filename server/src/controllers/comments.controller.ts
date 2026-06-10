import { Request, Response } from 'express';
import * as commentsService from '../services/comments.service';
import { ok, created } from '../utils/response';
import { decodeCursor } from '../utils/cursor';

function pagination(req: Request) {
  return {
    cursor: decodeCursor(req.query.cursor as string | undefined),
    limit: Math.min(parseInt((req.query.limit as string) ?? '12', 10), 50),
  };
}

export async function listComments(req: Request, res: Response) {
  const { cursor, limit } = pagination(req);
  const { items, meta } = await commentsService.listComments(req.user!.id, {
    targetType: req.query.targetType as 'post' | 'reel',
    targetId: req.query.targetId as string,
    cursor,
    limit,
  });
  return ok(res, items, meta);
}

export async function listReplies(req: Request, res: Response) {
  const { cursor, limit } = pagination(req);
  const { items, meta } = await commentsService.listReplies(
    req.user!.id,
    req.params.id,
    cursor,
    limit
  );
  return ok(res, items, meta);
}

export async function createComment(req: Request, res: Response) {
  const comment = await commentsService.createComment(req.user!.id, {
    targetType: req.body.targetType,
    targetId: req.body.targetId,
    content: req.body.content,
    parentId: req.body.parentId,
  });
  return created(res, comment);
}

export async function deleteComment(req: Request, res: Response) {
  const result = await commentsService.deleteComment(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function likeComment(req: Request, res: Response) {
  const result = await commentsService.likeComment(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function unlikeComment(req: Request, res: Response) {
  const result = await commentsService.unlikeComment(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function pinComment(req: Request, res: Response) {
  const comment = await commentsService.setPinned(req.user!.id, req.params.id, true);
  return ok(res, comment);
}

export async function unpinComment(req: Request, res: Response) {
  const comment = await commentsService.setPinned(req.user!.id, req.params.id, false);
  return ok(res, comment);
}
