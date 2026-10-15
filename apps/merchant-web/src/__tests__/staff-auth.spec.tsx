import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF_SESSION_KEY, homeFor, readStaffSession } from '../auth/staffSession';
import { LoginPage } from '../pages/LoginPage';

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
const jwt = (exp = Math.floor(Date.now() / 1000) + 3600) => `${b64({ alg: 'HS256' })}.${b64({ typ: 'staff', exp })}.sig`;
const MGR = { id: 's1', email: 'mgr@w.vn', role: 'BRANCH_MANAGER' as const, clientId: null, branchIds: ['branch-w1'] };

async function freshFetch(env: Record<string, string | boolean>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as never);
  const inner = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', inner);
  window.fetch = inner as unknown as typeof fetch;
  const { installActorFetch } = await import('../dev/installActorFetch');
  installActorFetch();
  return inner;
}
const sentHeaders = (inner: ReturnType<typeof vi.fn>) => new Headers((inner.mock.calls.at(-1)![1] as RequestInit).headers);

beforeEach(() => sessionStorage.clear());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('staff fetch wrapper', () => {
  it('production build: sends the Bearer and never the X-Dev headers', async () => {
    sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify({ token: jwt(), staff: MGR }));
    const inner = await freshFetch({ DEV: false, VITE_DEV_ACTOR: '' });
    await window.fetch('/api/manage/branch-w1/settings');
    const h = sentHeaders(inner);
    expect(h.get('Authorization')).toBe(`Bearer ${jwt().split('.').slice(0, 2).join('.')}.sig`);
    expect(h.has('X-Dev-Actor')).toBe(false);
    expect(h.has('X-Test-Staff-Role')).toBe(false);
  });

  it('production build without a session sends no staff identity at all', async () => {
    const inner = await freshFetch({ DEV: false, VITE_DEV_ACTOR: '' });
    await window.fetch('/api/admin/overview');
    const h = sentHeaders(inner);
    expect(h.has('Authorization')).toBe(false);
    expect(h.has('X-Dev-Actor')).toBe(false);
  });

  it('dev build without a session keeps the dev actor bypass', async () => {
    const inner = await freshFetch({ DEV: true });
    await window.fetch('/api/admin/overview');
    expect(sentHeaders(inner).get('X-Dev-Actor')).toBe('PLATFORM_ADMIN');
  });

  it('expired tokens are dropped client-side', () => {
    sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify({ token: jwt(1), staff: MGR }));
    expect(readStaffSession()).toBeNull();
  });

  it('routes each role home', () => {
    expect(homeFor(MGR)).toBe('/manage/branch-w1');
    expect(homeFor({ ...MGR, role: 'CLIENT_ADMIN', branchIds: [] })).toBe('/client');
    expect(homeFor({ ...MGR, role: 'PLATFORM_ADMIN', branchIds: [] })).toBe('/admin');
  });
});

describe('LoginPage', () => {
  const renderLogin = (path = '/login') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/manage/:id" element={<p>manager home</p>} />
          <Route path="/manage/:id/history" element={<p>history page</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it('posts email + password, stores the session and lands on the role home', async () => {
    const f = vi.fn(async () => Response.json({ token: jwt(), staff: MGR }));
    vi.stubGlobal('fetch', f);
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'mgr@w.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'pw-123456789');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('manager home')).toBeInTheDocument();
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ email: 'mgr@w.vn', password: 'pw-123456789' });
    expect(readStaffSession()?.staff.email).toBe('mgr@w.vn');
  });

  it('honours a same-origin ?next= but not an external one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ token: jwt(), staff: MGR })));
    const user = userEvent.setup();
    renderLogin('/login?next=%2Fmanage%2Fbranch-w1%2Fhistory');
    await user.type(screen.getByLabelText('Email'), 'a@b.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'x');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('history page')).toBeInTheDocument();
  });

  it('shows the server error on a wrong password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Email hoặc mật khẩu không đúng', code: 'INVALID_CREDENTIALS' }, { status: 401 })));
    const user = userEvent.setup();
    renderLogin('/login?next=//evil.example');
    await user.type(screen.getByLabelText('Email'), 'a@b.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() => expect(screen.getByTestId('login-error')).toHaveTextContent('không đúng'));
    expect(readStaffSession()).toBeNull();
  });
});

describe('RequireStaff', () => {
  it('production build: staff pages without a session go to /login, TV stays public', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DEV_ACTOR', '');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 404 })));
    const { AppRoutes } = await import('../App');
    const { unmount } = render(<MemoryRouter initialEntries={['/admin']}><AppRoutes /></MemoryRouter>);
    expect(await screen.findByRole('form', { name: 'Đăng nhập LượtĐi' })).toBeInTheDocument();
    unmount();
    render(<MemoryRouter initialEntries={['/tv/pho-nh']}><AppRoutes /></MemoryRouter>);
    expect(screen.queryByRole('form', { name: 'Đăng nhập LượtĐi' })).not.toBeInTheDocument();
  });
});
