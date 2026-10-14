import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { badRequest } from '../lib/errors';

export const validate =
  (schema: ZodSchema, where: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req[where]);
    if (!r.success) return next(badRequest('VALIDATION_ERROR', 'Check the highlighted fields', r.error.flatten()));
    (req as unknown as Record<string, unknown>)[where] = r.data;
    next();
  };
