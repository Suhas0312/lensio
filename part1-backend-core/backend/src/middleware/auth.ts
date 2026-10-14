import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser { id: string; role: Role; email?: string | null; phone?: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

export function signToken(u: AuthUser): string {
  return jwt.sign({ sub: u.id, role: u.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const p = jwt.verify(h.slice(7), env.JWT_SECRET) as jwt.JwtPayload;
    req.user = { id: p.sub as string, role: p.role as Role };
    next();
  } catch {
    next(unauthorized('Your session has expired. Sign in again.'));
  }
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

/** Attaches req.user when a valid token is sent, but lets anonymous visitors through. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    try {
      const p = jwt.verify(h.slice(7), env.JWT_SECRET) as jwt.JwtPayload;
      req.user = { id: p.sub as string, role: p.role as Role };
    } catch { /* treat as signed out */ }
  }
  next();
}
