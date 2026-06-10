import { Request, Response } from 'express';
import * as postsService from '../services/posts.service';
import { created, ok } from '../utils/response';
import { decodeCursor } from '../utils/cursor';

function pagination(req: Request) {
  return {
    cursor: decodeCursor(req.query.cursor as string | undefined),
    limit: Math.max(1, Math.min(parseInt((req.query.limit as string) ?? '12', 10), 50)),
  };
}

// ───────────────────────── Posts ─────────────────────────

export async function createPost(req: Request, res: Response) {
  const post = await postsService.createPost(req.user!.id, req.body);
  return created(res, post);
}

export async function getPost(req: Request, res: Response) {
  const post = await postsService.getPostById(req.params.id, req.user?.id ?? null);
  return ok(res, post);
}

export async function updatePost(req: Request, res: Response) {
  const post = await postsService.updatePost(req.user!.id, req.params.id, req.body);
  return ok(res, post);
}

export async function deletePost(req: Request, res: Response) {
  const result = await postsService.deletePost(req.user!.id, req.params.id);
  return ok(res, result);
}

// ───────────────────────── Likes ─────────────────────────

export async function likePost(req: Request, res: Response) {
  const result = await postsService.likePost(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function unlikePost(req: Request, res: Response) {
  const result = await postsService.unlikePost(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function listPostLikes(req: Request, res: Response) {
  const { cursor, limit } = pagination(req);
  const { items, meta } = await postsService.listPostLikes(
    req.user!.id,
    req.params.id,
    cursor,
    limit
  );
  return ok(res, items, meta);
}

// ───────────────────────── Saves ─────────────────────────

export async function savePost(req: Request, res: Response) {
  const result = await postsService.savePost(req.user!.id, req.params.id, req.body.collectionId);
  return ok(res, result);
}

export async function unsavePost(req: Request, res: Response) {
  const result = await postsService.unsavePost(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function listSavedPosts(req: Request, res: Response) {
  const { cursor, limit } = pagination(req);
  const { items, meta } = await postsService.listSavedPosts(req.user!.id, cursor, limit);
  return ok(res, items, meta);
}

export async function listArchivedPosts(req: Request, res: Response) {
  const { cursor, limit } = pagination(req);
  const { items, meta } = await postsService.listArchivedPosts(req.user!.id, cursor, limit);
  return ok(res, items, meta);
}

// ───────────────────────── Collections ─────────────────────────

export async function listCollections(req: Request, res: Response) {
  const { cursor, limit } = pagination(req);
  const { items, meta } = await postsService.listCollections(req.user!.id, cursor, limit);
  return ok(res, items, meta);
}

export async function createCollection(req: Request, res: Response) {
  const collection = await postsService.createCollection(req.user!.id, req.body.name);
  return created(res, collection);
}

export async function updateCollection(req: Request, res: Response) {
  const collection = await postsService.updateCollection(req.user!.id, req.params.id, req.body);
  return ok(res, collection);
}

export async function deleteCollection(req: Request, res: Response) {
  const result = await postsService.deleteCollection(req.user!.id, req.params.id);
  return ok(res, result);
}

export async function listCollectionPosts(req: Request, res: Response) {
  const { cursor, limit } = pagination(req);
  const { items, meta } = await postsService.listCollectionPosts(
    req.user!.id,
    req.params.id,
    cursor,
    limit
  );
  return ok(res, items, meta);
}
