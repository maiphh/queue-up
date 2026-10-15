import { useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { DevActorSwitch } from './dev/DevActorSwitch';
import { HostPosPage } from './modules/host-pos';
import { HistoryPage, QrPage, ReportsPage, SettingsPage } from './modules/manage';
import { OwnerAdminPage } from './modules/owner-admin';
import { SuperAdminPage } from './modules/super-admin';
import { TvKioskPage } from './modules/tv-kiosk';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import {
  STAFF_SESSION_EVENT,
  devHeadersEnabled,
  readStaffSession,
  staffLogout,
} from './auth/staffSession';
import { DEV_ACTOR_CHANGE_EVENT } from './dev/actor';

function useStaffSession() {
  const [session, setSession] = useState(readStaffSession);
  useEffect(() => {
    const sync = () => setSession(readStaffSession());
    window.addEventListener(STAFF_SESSION_EVENT, sync);
    return () => window.removeEventListener(STAFF_SESSION_EVENT, sync);
  }, []);
  return session;
}

/** Staff pages need a session, except in dev builds (dev actor headers). */
function RequireStaff({ children }: { children: ReactNode }) {
  const session = useStaffSession();
  const location = useLocation();
  if (session || devHeadersEnabled()) return <>{children}</>;
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

function RedirectHostToManage() {
  const { branchId } = useParams<{ branchId: string }>();
  return <Navigate to={`/manage/${branchId ?? ''}`} replace />;
}

function RedirectAdminBranchToClient() {
  const { branchId } = useParams<{ branchId: string }>();
  return <Navigate to={`/client/branches/${branchId ?? ''}`} replace />;
}

function ActorChrome({ children }: { children: ReactNode }) {
  const location = useLocation();
  const session = useStaffSession();
  const onTv = location.pathname.startsWith('/tv/');
  const dev = devHeadersEnabled();

  // Picking a dev actor drops any real session so the switch takes effect.
  useEffect(() => {
    if (!dev) return;
    const onSwitch = () => { if (readStaffSession()) staffLogout(); };
    window.addEventListener(DEV_ACTOR_CHANGE_EVENT, onSwitch);
    return () => window.removeEventListener(DEV_ACTOR_CHANGE_EVENT, onSwitch);
  }, [dev]);

  return (
    <>
      {onTv || !dev ? null : <DevActorSwitch />}
      {session && !onTv && location.pathname !== '/login' ? (
        <button type="button" className="d-pill r4-logout" data-testid="staff-logout" onClick={() => { staffLogout(); window.location.assign('/login'); }}>
          {session.staff.email} · Đăng xuất
        </button>
      ) : null}
      {children}
    </>
  );
}

const staff = (el: ReactNode) => <RequireStaff>{el}</RequireStaff>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={staff(<SuperAdminPage />)} />
      <Route path="/client" element={staff(<OwnerAdminPage />)} />
      <Route
        path="/client/branches/:branchId"
        element={staff(<OwnerAdminPage />)}
      />
      <Route path="/manage/:branchId" element={staff(<HostPosPage />)} />
      <Route path="/manage/:branchId/history" element={staff(<HistoryPage />)} />
      <Route path="/manage/:branchId/reports" element={staff(<ReportsPage />)} />
      <Route path="/manage/:branchId/qr" element={staff(<QrPage />)} />
      <Route path="/manage/:branchId/settings" element={staff(<SettingsPage />)} />
      <Route path="/tv/branch/:branchId" element={<TvKioskPage />} />
      <Route path="/tv/:branchSlug" element={<TvKioskPage />} />
      <Route path="/super-admin" element={<Navigate to="/admin" replace />} />
      <Route path="/host/:branchId" element={<RedirectHostToManage />} />
      <Route
        path="/admin/:branchId"
        element={<RedirectAdminBranchToClient />}
      />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <main className="min-h-screen bg-chassis text-carbon font-sans">
        <ActorChrome>
          <AppRoutes />
        </ActorChrome>
      </main>
    </BrowserRouter>
  );
}
