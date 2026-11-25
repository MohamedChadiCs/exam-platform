import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { healthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { academicRouter } from './routes/academic.js';
import { questionsRouter } from './routes/questions.js';
import { examsRouter } from './routes/exams.js';
import { studentRouter } from './routes/student.js';
import { uploadsRouter } from './routes/uploads.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { originCheck, attachSession, createAuthLimiters } from './middleware/security.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url.startsWith('/api/v1/health') },
  }));
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));

  // Generous global limit (campus NAT = many students behind one IP); strict limits live on specific routes.
  app.use(rateLimit({
    windowMs: 60_000, limit: 1000, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
  }));

  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());
  app.use(originCheck);
  app.use(attachSession);

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter(createAuthLimiters()));
  app.use('/api/v1/academic', academicRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/questions', questionsRouter);
  app.use('/api/v1/exams', examsRouter);
  app.use('/api/v1/student', studentRouter);
  app.use('/api/v1/uploads', uploadsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
