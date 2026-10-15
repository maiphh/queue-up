import { env, SELF } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index';
import { ZnsDispatcherService } from '../src/services';
import { hmacSha256Hex, signGuestJwt, verifyGuestJwt } from '../src/services/jwt';
import { ZALO_GRAPH_ME_URL } from '../src/services/zalo-auth';
import { toZnsPhone, ZaloZnsSender, ZNS_TEMPLATE_URL } from '../src/services/zns-sender';

async function applySchema(db: D1Database, sql: string): Promise<void> {
  for (const st of sql.split(';').map((s) => s.trim())) {
    if (st.length > 0 && !st.startsWith('--')) await db.prepare(st).run();
  }
}

describe('guest JWT', () => {
  it('round-trips and rejects wrong key / expiry', async () => {
    const t = await signGuestJwt('k1', { sub: 'g1', zid: 'z1' }, 1_000_000);
    expect((await verifyGuestJwt('k1', t, 1_000_000))?.zid).toBe('z1');
    expect(await verifyGuestJwt('k2', t, 1_000_000)).toBeNull();
    expect(await verifyGuestJwt('k1', t, 1_000_000 + 8 * 24 * 3600 * 1000)).toBeNull();
  });

  it('hmac hex matches a known vector', async () => {
    // RFC 4231-style sanity: HMAC_SHA256("key", "The quick brown fox jumps over the lazy dog")
    expect(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });
});

describe('POST /api/auth/zalo', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL);
  });
  afterEach(() => vi.restoreAllMocks());

  it('verifies via graph.zalo.me with appsecret_proof, upserts guest, returns JWT', async () => {
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === ZALO_GRAPH_ME_URL) {
        return Response.json({ id: 'zalo-123', name: 'Lan', picture: { data: { url: 'https://a/p.png' } } });
      }
      return realFetch(input, init);
    });

    const res = await SELF.fetch('http://localhost/api/auth/zalo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'tok-abc' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; guest: { id: string } };
    const claims = await verifyGuestJwt(env.JWT_SECRET, body.token);
    expect(claims).toMatchObject({ zid: 'zalo-123', sub: body.guest.id });

    const graphCall = spy.mock.calls.find(([u]) => String(u) === ZALO_GRAPH_ME_URL);
    const headers = graphCall?.[1]?.headers as Record<string, string>;
    expect(headers.access_token).toBe('tok-abc');
    expect(headers.appsecret_proof).toBe(await hmacSha256Hex(env.ZALO_APP_SECRET, 'tok-abc'));

    const row = await env.DB.prepare('SELECT id, display_name FROM guest_users WHERE zalo_user_id = ?')
      .bind('zalo-123')
      .first<{ id: string; display_name: string }>();
    expect(row).toEqual({ id: body.guest.id, display_name: 'Lan' });
  });

  it('returns 401 when Zalo rejects the token', async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input) === ZALO_GRAPH_ME_URL
        ? Response.json({ error: 452, message: 'Invalid access token' })
        : realFetch(input, init),
    );
    const res = await SELF.fetch('http://localhost/api/auth/zalo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'bad' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('ZaloZnsSender', () => {
  it('normalizes phones to 84xxxxxxxxx', () => {
    expect(toZnsPhone('+84 912 345 678')).toBe('84912345678');
    expect(toZnsPhone('0912345678')).toBe('84912345678');
    expect(toZnsPhone('123')).toBeNull();
  });

  it('POSTs template with access_token header and dedupe tracking_id', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: 0, data: { msg_id: 'm1' } }));
    const sender = new ZaloZnsSender({ accessToken: 'oa-tok', approachingTemplateId: 'tpl-1', fetchImpl });
    await sender.sendApproachingTurn({
      template: 'APPROACHING_TURN', merchantId: 'm', ticketId: 't-1',
      displayNumber: 'A·014', partiesAhead: 2, at: 1, phone: '+84912345678', branchName: 'Q1',
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ZNS_TEMPLATE_URL);
    expect((init.headers as Record<string, string>).access_token).toBe('oa-tok');
    expect(JSON.parse(String(init.body))).toEqual({
      phone: '84912345678',
      template_id: 'tpl-1',
      template_data: { ticket_number: 'A·014', parties_ahead: '2', branch_name: 'Q1' },
      tracking_id: 'zns_approaching_t-1',
    });
  });

  it('throws on Zalo error codes', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: -124, message: 'invalid token' }));
    const sender = new ZaloZnsSender({ accessToken: 'x', approachingTemplateId: 't', fetchImpl });
    await expect(
      sender.sendApproachingTurn({
        template: 'APPROACHING_TURN', merchantId: 'm', ticketId: 't', displayNumber: 'A', partiesAhead: 2, at: 1, phone: '0912345678',
      }),
    ).rejects.toThrow('invalid token');
  });
});

describe('ZnsDispatcherService with a real-style sender', () => {
  const now = Date.now();
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL).catch(() => undefined);
  });
  beforeEach(async () => {
    for (const t of ['tickets', 'wallet_ledger', 'guest_users', 'queue_buckets', 'branches', 'merchants', 'clients']) {
      await env.DB.prepare(`DELETE FROM ${t}`).run();
    }
    await env.DB.prepare(`INSERT INTO clients (id, name, created_at) VALUES ('c', 'C', ?)`).bind(now).run();
    await env.DB.prepare(
      `INSERT INTO merchants (id, client_id, name, slug, industry_type, plan_tier, monthly_ticket_count, wallet_balance_vnd, status, created_at)
       VALUES ('m', 'c', 'M', 'm', 'RESTAURANT', 'FREE', 0, 1000, 'ACTIVE', ?)`,
    ).bind(now).run();
    await env.DB.prepare(
      `INSERT INTO branches (id, merchant_id, name, address, district, city, qr_code_token, routing_mode, allow_remote_queue, is_paused, grace_period_mins, created_at)
       VALUES ('b', 'm', 'Q1', 'a', 'd', 'HCM', 'qr', 'PARTY_SIZE', 1, 0, 10, ?)`,
    ).bind(now).run();
    await env.DB.prepare(
      `INSERT INTO queue_buckets (id, branch_id, prefix, label_vi, label_en, min_pax, max_pax, active_counters, rolling_turnover_mins, current_seq, is_active)
       VALUES ('k', 'b', 'A', 'x', 'x', 1, 2, 1, 10, 0, 1)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO tickets (id, branch_id, bucket_id, ticket_date, seq_number, display_number, zalo_user_id, customer_name, pax_count, source, status, priority_boost, preferences_json, created_at)
       VALUES ('t1', 'b', 'k', '2026-10-15', 1, 'A·001', 'z1', 'G', 2, 'QR_ONSITE', 'WAITING', 0, '[]', ?)`,
    ).bind(now).run();
  });

  async function wallet() {
    return (await env.DB.prepare(`SELECT wallet_balance_vnd AS w FROM merchants WHERE id='m'`).first<{ w: number }>())!.w;
  }

  it('skips without charge when the guest has no phone', async () => {
    const sender = new ZaloZnsSender({ accessToken: 'x', approachingTemplateId: 't', fetchImpl: vi.fn() });
    const r = await new ZnsDispatcherService(env.DB, sender).notifyApproachingTurn('t1');
    expect(r.skippedReason).toBe('NO_RECIPIENT');
    expect(await wallet()).toBe(1000);
  });

  it('refunds and frees the dedupe key when ZNS fails, then charges once on retry', async () => {
    await env.DB.prepare(
      `INSERT INTO guest_users (id, zalo_user_id, phone_e164, created_at) VALUES ('g', 'z1', '+84912345678', ?)`,
    ).bind(now).run();
    const failing = new ZaloZnsSender({
      accessToken: 'x', approachingTemplateId: 't',
      fetchImpl: vi.fn(async () => Response.json({ error: -1, message: 'boom' })),
    });
    const r1 = await new ZnsDispatcherService(env.DB, failing).notifyApproachingTurn('t1');
    expect(r1).toMatchObject({ charged: false, skippedReason: 'SEND_FAILED' });
    expect(await wallet()).toBe(1000);

    const okFetch = vi.fn(async () => Response.json({ error: 0 }));
    const ok = new ZaloZnsSender({ accessToken: 'x', approachingTemplateId: 't', fetchImpl: okFetch });
    expect((await new ZnsDispatcherService(env.DB, ok).notifyApproachingTurn('t1')).charged).toBe(true);
    expect((await new ZnsDispatcherService(env.DB, ok).notifyApproachingTurn('t1')).skippedReason).toBe('ALREADY_SENT');
    expect(okFetch).toHaveBeenCalledTimes(1);
    expect(await wallet()).toBe(600);
  });
});
