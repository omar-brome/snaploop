import { Request, Response } from 'express';
import * as usersService from '../services/users.service';
import { created, ok } from '../utils/response';

export async function getMe(req: Request, res: Response) {
  const profile = await usersService.getOwnProfile(req.user!.id);
  return ok(res, profile);
}

export async function updateMe(req: Request, res: Response) {
  const profile = await usersService.updateOwnProfile(req.user!.id, req.body);
  return ok(res, profile);
}

export async function getSuggested(req: Request, res: Response) {
  const users = await usersService.getSuggestedUsers(
    req.user!.id,
    req.query.limit as string | undefined
  );
  return ok(res, users);
}

export async function getFollowRequests(req: Request, res: Response) {
  const { items, meta } = await usersService.getFollowRequests(
    req.user!.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function getBlockedUsers(req: Request, res: Response) {
  const { items, meta } = await usersService.getBlockedUsers(
    req.user!.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function createReport(req: Request, res: Response) {
  const report = await usersService.createReport(req.user!.id, req.body);
  return created(res, report);
}

export async function getProfile(req: Request, res: Response) {
  const profile = await usersService.getPublicProfile(
    req.params.username,
    req.user?.id ?? null
  );
  return ok(res, profile);
}

export async function follow(req: Request, res: Response) {
  const result = await usersService.followUser(req.user!.id, req.params.username);
  return ok(res, result);
}

export async function unfollow(req: Request, res: Response) {
  const result = await usersService.unfollowUser(req.user!.id, req.params.username);
  return ok(res, result);
}

export async function removeFollower(req: Request, res: Response) {
  const result = await usersService.removeFollower(req.user!.id, req.params.username);
  return ok(res, result);
}

export async function acceptFollowRequest(req: Request, res: Response) {
  const result = await usersService.acceptFollowRequest(req.user!.id, req.params.username);
  return ok(res, result);
}

export async function declineFollowRequest(req: Request, res: Response) {
  const result = await usersService.declineFollowRequest(req.user!.id, req.params.username);
  return ok(res, result);
}

export async function getFollowers(req: Request, res: Response) {
  const { items, meta } = await usersService.getFollowers(
    req.params.username,
    req.user!.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function getFollowing(req: Request, res: Response) {
  const { items, meta } = await usersService.getFollowing(
    req.params.username,
    req.user!.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function block(req: Request, res: Response) {
  const result = await usersService.blockUser(req.user!.id, req.params.username);
  return ok(res, result);
}

export async function unblock(req: Request, res: Response) {
  const result = await usersService.unblockUser(req.user!.id, req.params.username);
  return ok(res, result);
}

export async function getUserPosts(req: Request, res: Response) {
  const { items, meta } = await usersService.getUserPosts(
    req.params.username,
    req.user?.id ?? null,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function getUserReels(req: Request, res: Response) {
  const { items, meta } = await usersService.getUserReels(
    req.params.username,
    req.user!.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}

export async function getUserTagged(req: Request, res: Response) {
  const { items, meta } = await usersService.getUserTagged(
    req.params.username,
    req.user!.id,
    req.query.cursor as string | undefined,
    req.query.limit as string | undefined
  );
  return ok(res, items, meta);
}
