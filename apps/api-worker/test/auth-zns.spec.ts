import { env, SELF } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/index';
import { ZnsDispatcherService } from '../src/services';
import { hmacSha256Hex, signGuestJwt, verifyGuestJwt } from '../src/services/jwt';
import { fetchZaloProfile, ZALO_GRAPH_ME_URL } from '../src/services/zalo-auth';
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
    expect(await res.json()).toMatchObject({
      code: 'ZALO_AUTH_FAILED',
      zaloError: 452,
      zaloMessage: 'Invalid access token',
    });
  });

  it('accepts the user id when Zalo withholds personal fields outside Vietnam', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        id: 'z-vn',
        error: -501,
        message: 'Personal information is limited due to IP address not inside Vietnam',
      }),
    );
    const result = await fetchZaloProfile('tok', 'secret', fetchImpl);
    expect(result).toEqual({ ok: true, profile: { id: 'z-vn' } });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(ZALO_GRAPH_ME_URL);
    expect(ZALO_GRAPH_ME_URL).not.toContain('name');
  });

  it('trims a newline off the app secret before signing the proof', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'z1', error: 0, message: 'Success' }));
    const result = await fetchZaloProfile(' tok \n', ' secret \r\n', fetchImpl);
    expect(result.ok).toBe(true);
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.access_token).toBe('tok');
    expect(headers.appsecret_proof).toBe(await hmacSha256Hex('secret', 'tok'));
  });

  it('stores the client display name/avatar when the graph withholds personal fields (-501)', async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === ZALO_GRAPH_ME_URL) {
        return Response.json({
          id: 'z-vn',
          error: -501,
          message: 'Personal information is limited due to IP address not inside Vietnam',
        });
      }
      return realFetch(input, init);
    });

    const res = await SELF.fetch('http://localhost/api/auth/zalo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: 'tok-vn',
        displayName: 'Lan',
        avatarUrl: 'https://cdn.example/a.png',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      guest: { id: string; name: string | null; avatarUrl: string | null };
    };
    const claims = await verifyGuestJwt(env.JWT_SECRET, body.token);
    expect(claims).toMatchObject({ zid: 'z-vn', sub: body.guest.id });
    expect(body.guest.name).toBe('Lan');
    expect(body.guest.avatarUrl).toBe('https://cdn.example/a.png');

    const row = await env.DB.prepare(
      'SELECT display_name, avatar_url FROM guest_users WHERE zalo_user_id = ?',
    )
      .bind('z-vn')
      .first<{ display_name: string; avatar_url: string }>();
    expect(row).toEqual({ display_name: 'Lan', avatar_url: 'https://cdn.example/a.png' });
    expect(ZALO_GRAPH_ME_URL).not.toContain('name');
  });

  it('keeps the graph name when the client also sends a displayName', async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input) === ZALO_GRAPH_ME_URL
        ? Response.json({ id: 'z-graph', name: 'Lan' })
        : realFetch(input, init),
    );
    const res = await SELF.fetch('http://localhost/api/auth/zalo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'tok', displayName: 'Other' }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(
      'SELECT display_name FROM guest_users WHERE zalo_user_id = ?',
    )
      .bind('z-graph')
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe('Lan');
  });
});

describe('POST /api/me/display', () => {
  beforeAll(async () => {
    await applySchema(env.DB, env.TEST_SCHEMA_SQL).catch(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  async function seedGuest(id: string, zid: string): Promise<void> {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO guest_users (id, zalo_user_id, created_at) VALUES (?, ?, ?)',
    )
      .bind(id, zid, Date.now())
      .run();
  }

  function guestToken(sub: string, zid: string): Promise<string> {
    return signGuestJwt(env.JWT_SECRET, { sub, zid });
  }

  it('updates only the JWT guest and rejects a non-https avatar', async () => {
    await seedGuest('g-own', 'z-own');
    await seedGuest('g-other', 'z-other');
    const token = await guestToken('g-own', 'z-own');

    const res = await SELF.fetch('http://localhost/api/me/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // A body guest id is not a field the route understands: ignored.
      body: JSON.stringify({
        displayName: '  Lan   Nguyễn  ',
        avatarUrl: 'javascript:alert(1)',
        guestId: 'g-other',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Lan Nguyễn', avatarUrl: null });

    const own = await env.DB.prepare(
      'SELECT display_name, avatar_url FROM guest_users WHERE id = ?',
    )
      .bind('g-own')
      .first<{ display_name: string | null; avatar_url: string | null }>();
    expect(own).toEqual({ display_name: 'Lan Nguyễn', avatar_url: null });

    const other = await env.DB.prepare('SELECT display_name FROM guest_users WHERE id = ?')
      .bind('g-other')
      .first<{ display_name: string | null }>();
    expect(other?.display_name).toBeNull();
  });

  it('stores a valid https avatar and never wipes a field that was omitted', async () => {
    await seedGuest('g-http', 'z-http');
    const token = await guestToken('g-http', 'z-http');

    const first = await SELF.fetch('http://localhost/api/me/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'Lan', avatarUrl: 'http://insecure.example/a.png' }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ name: 'Lan', avatarUrl: null });

    const second = await SELF.fetch('http://localhost/api/me/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatarUrl: 'https://cdn.example/b.png' }),
    });
    expect(second.status).toBe(200);
    // displayName omitted → kept; avatar updated.
    expect(await second.json()).toEqual({ name: 'Lan', avatarUrl: 'https://cdn.example/b.png' });
  });

  it('rejects a missing JWT (401) and a non-JSON body (400)', async () => {
    const noAuth = await SELF.fetch('http://localhost/api/me/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'X' }),
    });
    expect(noAuth.status).toBe(401);

    await seedGuest('g-bad-body', 'z-bad-body');
    const token = await guestToken('g-bad-body', 'z-bad-body');
    const badBody = await SELF.fetch('http://localhost/api/me/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: 'not json',
    });
    expect(badBody.status).toBe(400);
  });

  it('returns 404 when the guest row is gone', async () => {
    const token = await guestToken('g-missing', 'z-missing');
    const res = await SELF.fetch('http://localhost/api/me/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'Ghost' }),
    });
    expect(res.status).toBe(404);
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
