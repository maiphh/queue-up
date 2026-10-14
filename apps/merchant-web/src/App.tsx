import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HostPosPage } from './modules/host-pos';
import { OwnerAdminPage } from './modules/owner-admin';
import { SuperAdminPage } from './modules/super-admin';
import { TvKioskPage } from './modules/tv-kiosk';
import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <BrowserRouter>
      <main className="min-h-screen bg-chassis text-carbon font-sans">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/host/:branchId" element={<HostPosPage />} />
          <Route path="/tv/:branchSlug" element={<TvKioskPage />} />
          <Route path="/admin" element={<OwnerAdminPage />} />
          <Route path="/admin/:branchId" element={<OwnerAdminPage />} />
          <Route path="/super-admin" element={<SuperAdminPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
