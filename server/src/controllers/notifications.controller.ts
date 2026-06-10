import { Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';
import { ok } from '../utils/response';
import { decodeCursor } from '../utils/cursor';

function parseLimit(raw: unknown, fallback: number): number {
  const parsed = parseInt(typeof raw === 'string' ? raw : `${fallback}`, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 50);
}

export async function list(req: Request, res: Response) {
  const cursor = decodeCursor(req.query.cursor as string | undefined);
  const limit = parseLimit(req.query.limit, 20);
  const { items, meta } = await notificationsService.listNotifications(
    req.user!.id,
    cursor,
    limit
  );
  return ok(res, items, meta);
}

export async function unreadCount(req: Request, res: Response) {
  const count = await notificationsService.getUnreadCount(req.user!.id);
  return ok(res, { count });
}

export async function markRead(req: Request, res: Response) {
  const { ids } = req.body as { ids?: string[] };
  const updated = await notificationsService.markRead(req.user!.id, ids);
  return ok(res, { updated });
}

export async function getPreferences(req: Request, res: Response) {
  const prefs = await notificationsService.getPreferences(req.user!.id);
  return ok(res, prefs);
}

export async function updatePreferences(req: Request, res: Response) {
  const prefs = await notificationsService.updatePreferences(req.user!.id, req.body);
  return ok(res, prefs);
}
