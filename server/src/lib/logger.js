import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]',
      '*.password', '*.token', '*.code',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
});
