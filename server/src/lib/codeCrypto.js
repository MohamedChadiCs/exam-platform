import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateAccessCode(length = 8) {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return code;
}

export function hashAccessCode(code) {
  const normalized = code.trim().toUpperCase();
  const pepper = Buffer.from(env.CODE_PEPPER, 'base64');
  return createHmac('sha256', pepper).update(normalized).digest();
}

export function hashQrToken(token) {
  return createHash('sha256').update(token.trim()).digest();
}

export function encryptAccessCode(code) {
  const key = Buffer.from(env.CODE_ENC_KEY, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(code.trim().toUpperCase(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Packed format: [12 bytes IV] [16 bytes Tag] [Ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptAccessCode(packed) {
  if (!packed || packed.length < 28) return null;
  const key = Buffer.from(env.CODE_ENC_KEY, 'base64');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
