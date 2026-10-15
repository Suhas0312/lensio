import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { ah } from '../../lib/asyncHandler';
import { optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { chat } from './assistant.service';

const r = Router();

// Keeps the free Gemini quota safe: a normal conversation never hits these.
const perMinute = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: 'SLOW_DOWN', message: 'Too many questions at once. Wait a minute and try again.' } } });
const perDay = rateLimit({ windowMs: 24 * 3600_000, limit: 150, standardHeaders: false, legacyHeaders: false,
  message: { error: { code: 'DAILY_LIMIT', message: 'You have reached today\'s chat limit. Chat with us on WhatsApp instead.' } } });

r.post('/chat', perMinute, perDay, optionalAuth, validate(z.object({
  // Earlier replies can be long: trim instead of rejecting (the app sends the whole chat back each time).
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(20000).transform((t) => t.slice(0, 1500)) }))
    .min(1).max(60).refine((m) => m[m.length - 1].role === 'user', 'The last message must be from the customer'),
  // Optional photo with the last question ("Google Lens"-style): glasses, a prescription or a face.
  image: z.object({
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z.string().max(1_400_000, 'That photo is too large. Try again with a smaller photo.').regex(/^[A-Za-z0-9+/=]+$/, 'Unreadable photo'),
  }).optional(),
})), ah(async (req, res) => {
  const history = req.body.messages.slice(-12); // recent context is enough and keeps requests small
  const out = await chat(history, req.user?.id ?? null, req.body.image);
  res.json({ ...out, supportWhatsApp: `https://wa.me/${env.SUPPORT_WHATSAPP_NUMBER}` });
}));

export default r;
