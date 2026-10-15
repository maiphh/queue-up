export type DevActorRole =
  | 'PLATFORM_ADMIN'
  | 'CLIENT_ADMIN'
  | 'BRANCH_MANAGER';

export type DevActor = {
  role: DevActorRole;
  clientId?: string;
  branchId?: string;
};

export type DevActorPreset = {
  id: string;
  label: string;
  email?: string;
  actor: DevActor;
};

export const DEV_ACTOR_STORAGE_KEY = 'luotdi.devActor';
export const DEV_ACTOR_CHANGE_EVENT = 'luotdi-actor-change';

export const DEFAULT_DEV_ACTOR: DevActor = {
  role: 'PLATFORM_ADMIN',
};

export const DEV_ACTOR_PRESETS: DevActorPreset[] = [
  {
    id: 'admin',
    label: 'Admin',
    email: 'admin@luotdi.vn',
    actor: { role: 'PLATFORM_ADMIN' },
  },
  {
    id: 'client-an-tam',
    label: 'Client Nhóm An Tâm',
    email: 'client@antam.vn',
    actor: { role: 'CLIENT_ADMIN', clientId: 'client-an-tam' },
  },
  {
    id: 'client-cafe',
    label: 'Client Cafe Trung',
    email: 'client@cafetrung.vn',
    actor: { role: 'CLIENT_ADMIN', clientId: 'client-cafe' },
  },
  {
    id: 'manager-pho-d1',
    label: 'Quản lý Nguyễn Huệ',
    email: 'manager@pho-nh.vn',
    actor: { role: 'BRANCH_MANAGER', branchId: 'branch-pho-d1' },
  },
  {
    id: 'manager-pho-d3',
    label: 'Quản lý Quận 3',
    email: 'manager@pho-q3.vn',
    actor: { role: 'BRANCH_MANAGER', branchId: 'branch-pho-d3' },
  },
  {
    id: 'manager-clinic',
    label: 'Quản lý phòng khám',
    email: 'manager@clinic.vn',
    actor: { role: 'BRANCH_MANAGER', branchId: 'branch-clinic-tb' },
  },
  {
    id: 'manager-cafe',
    label: 'Quản lý cafe',
    email: 'manager@cafe.vn',
    actor: { role: 'BRANCH_MANAGER', branchId: 'branch-cafe-d3' },
  },
];

function isDevActorRole(value: unknown): value is DevActorRole {
  return (
    value === 'PLATFORM_ADMIN' ||
    value === 'CLIENT_ADMIN' ||
    value === 'BRANCH_MANAGER'
  );
}

function parseDevActor(raw: string | null): DevActor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DevActor>;
    if (!isDevActorRole(parsed.role)) return null;
    const actor: DevActor = { role: parsed.role };
    if (typeof parsed.clientId === 'string' && parsed.clientId) {
      actor.clientId = parsed.clientId;
    }
    if (typeof parsed.branchId === 'string' && parsed.branchId) {
      actor.branchId = parsed.branchId;
    }
    return actor;
  } catch {
    return null;
  }
}

function persistDevActor(actor: DevActor): void {
  sessionStorage.setItem(DEV_ACTOR_STORAGE_KEY, JSON.stringify(actor));
}

/** Read actor from sessionStorage; write PLATFORM_ADMIN default on first read. */
export function readDevActor(): DevActor {
  const existing = parseDevActor(sessionStorage.getItem(DEV_ACTOR_STORAGE_KEY));
  if (existing) return existing;
  persistDevActor(DEFAULT_DEV_ACTOR);
  return { ...DEFAULT_DEV_ACTOR };
}

export function writeDevActor(actor: DevActor): void {
  persistDevActor(actor);
  window.dispatchEvent(new CustomEvent(DEV_ACTOR_CHANGE_EVENT));
}

export function applyDevActorPreset(preset: DevActorPreset): void {
  writeDevActor({ ...preset.actor });
}

export function matchDevActorPreset(actor: DevActor): DevActorPreset | null {
  return (
    DEV_ACTOR_PRESETS.find((preset) => {
      if (preset.actor.role !== actor.role) return false;
      if ((preset.actor.clientId ?? '') !== (actor.clientId ?? '')) return false;
      if ((preset.actor.branchId ?? '') !== (actor.branchId ?? '')) return false;
      return true;
    }) ?? null
  );
}
