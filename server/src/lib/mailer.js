import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/** In test mode mails are captured here instead of being sent. */
export const outbox = [];

const transport = env.NODE_ENV === 'test' ? null : nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
});

/** Fire-and-forget safe: failures are logged, never thrown into request handlers. */
export async function sendMail({ to, subject, text }) {
  if (!transport) { outbox.push({ to, subject, text }); return; }
  try {
    await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
  } catch (err) {
    logger.error({ err, to, subject }, 'failed to send email');
  }
}
