/**
 * Minimal HS256 JWT (WebCrypto) for guest sessions.
 * Claims: sub = guest_users.id, zid = Zalo user id (per Zalo App), exp (seconds).
 */

export type GuestClaims = {
  sub: string;
  zid: string;
  name?: string;
  iat: number;
  exp: number;
};

export const GUEST_JWT_TTL_SECONDS = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const bin = atob(input.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Lowercase hex HMAC-SHA256 — used for Zalo `appsecret_proof`. */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(key), enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signGuestJwt(
  secret: string,
  claims: { sub: string; zid: string; name?: string },
  nowMs = Date.now(),
  ttlSeconds = GUEST_JWT_TTL_SECONDS,
): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(
    enc.encode(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds })),
  );
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

/** Returns claims when signature, alg and exp are valid; otherwise null. */
export async function verifyGuestJwt(
  secret: string,
  token: string,
  nowMs = Date.now(),
): Promise<GuestClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h))) as {
      alg?: string;
    };
    if (header.alg !== 'HS256') return null;
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      b64urlDecode(s),
      enc.encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as GuestClaims;
    if (typeof claims.sub !== 'string' || typeof claims.zid !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return null;
    return claims;
  } catch {
    return null;
  }
}

export type BearerResult =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'ok'; claims: GuestClaims };

/** Parse `Authorization: Bearer <jwt>`; absent header → `none`. */
export async function readGuestBearer(
  authorization: string | undefined | null,
  secret: string | undefined,
): Promise<BearerResult> {
  if (!authorization) return { kind: 'none' };
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!m || !secret) return { kind: 'invalid' };
  const claims = await verifyGuestJwt(secret, m[1]!.trim());
  return claims ? { kind: 'ok', claims } : { kind: 'invalid' };
}
