import bcrypt from 'bcryptjs';

// bcryptjs (pure JS) is used instead of the native bcrypt package so the
// project installs cleanly on Windows without node-gyp. Same algorithm.
const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
