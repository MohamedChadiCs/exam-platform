import { randomBytes } from 'node:crypto';

for (const name of ['CODE_PEPPER', 'CODE_ENC_KEY', 'CSRF_SECRET']) {
  console.log(`${name}=${randomBytes(32).toString('base64')}`);
}
