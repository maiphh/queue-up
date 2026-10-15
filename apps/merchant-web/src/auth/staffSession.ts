/**
 * Staff session (Platform Admin / Client / Manager): a 12h HS256 JWT from
 * POST /api/auth/staff, kept in sessionStorage (per tab, gone on close).
 * Dev bypass: POST /api/auth/staff/dev { email } (server 404s outside dev).
 */
export type StaffRole = 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'BRANCH_MANAGER';
export type StaffInfo = { id: string; email: string; role: StaffRole; clientId: string | null; branchIds: string[] };
export type StaffSession = { token: string; staff: StaffInfo };

export const STAFF_SESSION_KEY = 'luotdi.staffSession';
export const STAFF_SESSION_EVENT = 'luotdi-staff-session';

export function readStaffSession(): StaffSession | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STAFF_SESSION_KEY) ?? 'null') as StaffSession | null;
    if (!s || typeof s.token !== 'string' || !s.staff?.role) return null;
    // Drop an expired token client-side; the server is the real check.
    const exp = (JSON.parse(atob(s.token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }).exp;
    if (exp && exp * 1000 <= Date.now()) {
      sessionStorage.removeItem(STAFF_SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function writeStaffSession(s: StaffSession | null): void {
  if (s) sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(s));
  else sessionStorage.removeItem(STAFF_SESSION_KEY);
  window.dispatchEvent(new CustomEvent(STAFF_SESSION_EVENT));
}

/** Where a role lands after login. */
export function homeFor(staff: StaffInfo): string {
  if (staff.role === 'PLATFORM_ADMIN') return '/admin';
  if (staff.role === 'CLIENT_ADMIN') return '/client';
  return staff.branchIds[0] ? `/manage/${staff.branchIds[0]}` : '/login';
}

export type LoginResult = { ok: true; session: StaffSession } | { ok: false; status: number; message: string };

async function postLogin(path: string, body: unknown): Promise<LoginResult> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as Partial<StaffSession> & { error?: string };
    if (!res.ok || !j.token || !j.staff) return { ok: false, status: res.status, message: j.error ?? 'Đăng nhập không thành công' };
    const session = { token: j.token, staff: j.staff };
    writeStaffSession(session);
    return { ok: true, session };
  } catch {
    return { ok: false, status: 0, message: 'Mất kết nối. Thử lại nhé.' };
  }
}

export const staffLogin = (email: string, password: string) => postLogin('/api/auth/staff', { email, password });
export const devStaffLogin = (email: string) => postLogin('/api/auth/staff/dev', { email });
export const staffLogout = () => writeStaffSession(null);

/** Dev headers (X-Dev-Actor…) are only sent by dev builds; the server ignores them elsewhere. */
export function devHeadersEnabled(): boolean {
  return Boolean(import.meta.env.DEV) || import.meta.env.VITE_DEV_ACTOR === '1';
}
