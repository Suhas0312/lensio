import pino from 'pino';
import { isProd } from '../config/env';
export const logger = pino({
  level: isProd ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'otp', 'code'],
});
