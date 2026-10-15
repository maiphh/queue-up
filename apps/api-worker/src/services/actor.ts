export type Actor =
  | { role: 'PLATFORM_ADMIN'; legacyUnscoped: boolean }
  | { role: 'CLIENT_ADMIN'; clientId: string | null; legacyUnscoped: boolean }
  | { role: 'BRANCH_MANAGER'; branchIds: string[] | null; legacyUnscoped: boolean };

type ActorOk = { ok: true; actor: Actor };
type ActorUnauthorized = { ok: false; status: 401; code: 'UNAUTHORIZED' };
type ActorForbidden = { status: 403; code: 'FORBIDDEN' };

const LEGACY_ROLE_MAP: Record<string, Actor['role']> = {
  BRANCH_HOST: 'BRANCH_MANAGER',
  MERCHANT_OWNER: 'CLIENT_ADMIN',
  SUPER_ADMIN: 'PLATFORM_ADMIN',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
};

function parseBranchIds(raw: string | undefined): string[] | null {
  if (raw === undefined || raw.trim() === '') return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return ids.length > 0 ? ids : null;
}

/**
 * Resolve staff actor from headers.
 * Prefer `X-Dev-Actor`; else `X-Test-Staff-Role`. Missing → 401.
 */
export function readActor(
  headers: Headers | { get(name: string): string | null | undefined },
): ActorOk | ActorUnauthorized {
  const get = (name: string) => {
    const v = headers.get(name);
    return v == null ? undefined : v;
  };

  const devActor = get('X-Dev-Actor')?.trim();
  const testRole = get('X-Test-Staff-Role')?.trim();
  const rawRole = devActor || testRole;
  if (!rawRole) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }

  const role = LEGACY_ROLE_MAP[rawRole];
  if (!role) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }

  const fromDevActor = Boolean(devActor);
  const clientIdHeader = get('X-Dev-Client-Id')?.trim() || null;
  const branchIds = parseBranchIds(get('X-Dev-Branch-Id') ?? undefined);

  if (role === 'PLATFORM_ADMIN') {
    return { ok: true, actor: { role, legacyUnscoped: true } };
  }

  if (role === 'CLIENT_ADMIN') {
    // Legacy MERCHANT_OWNER with no client header → unscoped allow
    const isLegacyOwner = !fromDevActor && rawRole === 'MERCHANT_OWNER';
    if (isLegacyOwner && !clientIdHeader) {
      return {
        ok: true,
        actor: { role, clientId: null, legacyUnscoped: true },
      };
    }
    // New CLIENT_ADMIN (or scoped owner) requires client id when from X-Dev-Actor
    // or when using the new role name
    if (fromDevActor || rawRole === 'CLIENT_ADMIN') {
      return {
        ok: true,
        actor: {
          role,
          clientId: clientIdHeader,
          legacyUnscoped: false,
        },
      };
    }
    return {
      ok: true,
      actor: {
        role,
        clientId: clientIdHeader,
        legacyUnscoped: !clientIdHeader,
      },
    };
  }

  // BRANCH_MANAGER
  // Legacy BRANCH_HOST with no branch header → allow any branch
  const isLegacyHost = !fromDevActor && rawRole === 'BRANCH_HOST';
  if (isLegacyHost && !branchIds) {
    return {
      ok: true,
      actor: { role, branchIds: null, legacyUnscoped: true },
    };
  }
  // From X-Dev-Actor or new role name BRANCH_MANAGER → require branch list
  return {
    ok: true,
    actor: {
      role,
      branchIds,
      legacyUnscoped: false,
    },
  };
}

/**
 * Check actor may act on a branch.
 * PLATFORM_ADMIN / legacyUnscoped → ok.
 * CLIENT_ADMIN → merchant.client_id must match.
 * BRANCH_MANAGER → branchId must be in branchIds.
 */
export async function assertBranchAccess(
  db: D1Database,
  actor: Actor,
  branchId: string,
): Promise<true | ActorForbidden> {
  if (actor.role === 'PLATFORM_ADMIN') return true;
  if (actor.legacyUnscoped) return true;

  if (actor.role === 'BRANCH_MANAGER') {
    if (!actor.branchIds || actor.branchIds.length === 0) {
      return { status: 403, code: 'FORBIDDEN' };
    }
    if (!actor.branchIds.includes(branchId)) {
      return { status: 403, code: 'FORBIDDEN' };
    }
    return true;
  }

  // CLIENT_ADMIN
  if (!actor.clientId) {
    return { status: 403, code: 'FORBIDDEN' };
  }

  const row = await db
    .prepare(
      `SELECT m.client_id AS client_id
       FROM branches b
       JOIN merchants m ON m.id = b.merchant_id
       WHERE b.id = ?1`,
    )
    .bind(branchId)
    .first<{ client_id: string }>();

  if (!row || row.client_id !== actor.clientId) {
    return { status: 403, code: 'FORBIDDEN' };
  }
  return true;
}
