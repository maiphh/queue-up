import type { ReactNode } from 'react';
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
  const hideSwitch = location.pathname.startsWith('/tv/');

  return (
    <>
      {hideSwitch ? null : <DevActorSwitch />}
      {children}
    </>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<SuperAdminPage />} />
      <Route path="/client" element={<OwnerAdminPage />} />
      <Route
        path="/client/branches/:branchId"
        element={<OwnerAdminPage />}
      />
      <Route path="/manage/:branchId" element={<HostPosPage />} />
      <Route path="/manage/:branchId/history" element={<HistoryPage />} />
      <Route path="/manage/:branchId/reports" element={<ReportsPage />} />
      <Route path="/manage/:branchId/qr" element={<QrPage />} />
      <Route path="/manage/:branchId/settings" element={<SettingsPage />} />
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
