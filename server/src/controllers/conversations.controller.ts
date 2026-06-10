import { Request, Response } from 'express';
import * as conversationsService from '../services/conversations.service';
import { created, ok } from '../utils/response';
import { decodeCursor } from '../utils/cursor';

function parseLimit(raw: unknown, fallback: number): number {
  const parsed = parseInt(typeof raw === 'string' ? raw : `${fallback}`, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 50);
}

export async function list(req: Request, res: Response) {
  const limit = parseLimit(req.query.limit, 20);
  const { items, meta } = await conversationsService.listConversations(
    req.user!.id,
    req.query.cursor as string | undefined,
    limit
  );
  return ok(res, items, meta);
}

export async function create(req: Request, res: Response) {
  const { conversation, reused } = await conversationsService.createConversation(
    req.user!.id,
    req.body
  );
  // Reusing an existing 1:1 thread is not a resource creation.
  return reused ? ok(res, conversation) : created(res, conversation);
}

export async function unreadTotal(req: Request, res: Response) {
  const result = await conversationsService.getUnreadTotal(req.user!.id);
  return ok(res, result);
}

export async function getOne(req: Request, res: Response) {
  const conversation = await conversationsService.getConversation(req.user!.id, req.params.id);
  return ok(res, conversation);
}

export async function update(req: Request, res: Response) {
  const conversation = await conversationsService.updateConversation(
    req.user!.id,
    req.params.id,
    req.body
  );
  return ok(res, conversation);
}

export async function addParticipants(req: Request, res: Response) {
  const { userIds } = req.body as { userIds: string[] };
  const conversation = await conversationsService.addParticipants(
    req.user!.id,
    req.params.id,
    userIds
  );
  return ok(res, conversation);
}

export async function removeParticipant(req: Request, res: Response) {
  const result = await conversationsService.removeParticipant(
    req.user!.id,
    req.params.id,
    req.params.userId
  );
  return ok(res, result);
}

export async function listMessages(req: Request, res: Response) {
  const cursor = decodeCursor(req.query.cursor as string | undefined);
  const limit = parseLimit(req.query.limit, 30);
  const { items, meta } = await conversationsService.listMessages(
    req.user!.id,
    req.params.id,
    cursor,
    limit
  );
  return ok(res, items, meta);
}

export async function sendMessage(req: Request, res: Response) {
  const message = await conversationsService.sendMessage(req.user!.id, req.params.id, req.body);
  return created(res, message);
}

export async function markRead(req: Request, res: Response) {
  const result = await conversationsService.markRead(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function deleteMessage(req: Request, res: Response) {
  const result = await conversationsService.deleteMessage(req.user!.id, req.params.messageId);
  return ok(res, result);
}

export async function toggleReaction(req: Request, res: Response) {
  const { emoji } = req.body as { emoji: string };
  const result = await conversationsService.toggleReaction(
    req.user!.id,
    req.params.messageId,
    emoji
  );
  return ok(res, result);
}
