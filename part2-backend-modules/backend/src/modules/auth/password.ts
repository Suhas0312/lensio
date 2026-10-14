import crypto from 'crypto';

const N = 16384, KEYLEN = 64;

/** scrypt password hash: "scrypt$N$salt$hash" (no native dependencies). */
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, KEYLEN, { N }).toString('hex');
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, n, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, a.length, { N: Number(n) });
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
