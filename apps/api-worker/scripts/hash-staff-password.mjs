#!/usr/bin/env node
/**
 * Print a staff password hash for staff_users.password_hash (same format as
 * src/services/jwt.ts hashPassword: pbkdf2$<iter>$<salt>$<hash>, base64url).
 *   pnpm -s staff:hash 'the-password'
 * then: wrangler d1 execute luotdi-db --remote --command
 *   "UPDATE staff_users SET password_hash='<hash>' WHERE email='<email>'"
 */
import { webcrypto as crypto } from 'node:crypto';

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('usage: staff:hash <password of at least 10 chars>');
  process.exit(1);
}
const b64url = (u8) => Buffer.from(u8).toString('base64url');
const iter = 100_000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
console.log(`pbkdf2$${iter}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`);
