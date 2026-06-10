import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { ok, created } from '../utils/response';
import { env } from '../config/env';

const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 min
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const base = { httpOnly: true, secure: env.isProd, sameSite: 'lax' as const };
  res.cookie('accessToken', accessToken, { ...base, maxAge: ACCESS_COOKIE_MAX_AGE });
  // Refresh cookie is scoped to the auth routes so it never rides along on
  // ordinary API calls.
  res.cookie('refreshToken', refreshToken, {
    ...base,
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken', { path: '/api/auth' });
}

export async function register(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  setAuthCookies(res, accessToken, refreshToken);
  return created(res, { user });
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login(identifier, password);
  setAuthCookies(res, accessToken, refreshToken);
  return ok(res, { user });
}

export async function refresh(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.refresh(
    req.cookies?.refreshToken
  );
  setAuthCookies(res, accessToken, refreshToken);
  return ok(res, { user });
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.refreshToken);
  clearAuthCookies(res);
  return ok(res, { message: 'Logged out' });
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.forgotPassword(req.body.email);
  return ok(res, { message: 'If that email exists, a reset link has been sent' });
}

export async function resetPassword(req: Request, res: Response) {
  await authService.resetPassword(req.body.token, req.body.password);
  return ok(res, { message: 'Password updated, please log in' });
}

export async function changePassword(req: Request, res: Response) {
  await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
  return ok(res, { message: 'Password changed' });
}

export async function verifyEmail(req: Request, res: Response) {
  await authService.verifyEmail(req.body.token);
  return ok(res, { message: 'Email verified' });
}

export async function deactivate(req: Request, res: Response) {
  await authService.deactivateAccount(req.user!.id, req.body.password);
  clearAuthCookies(res);
  return ok(res, { message: 'Account deactivated' });
}
