import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HostPosPage } from './modules/host-pos';

export function App() {
  return (
    <BrowserRouter>
      <main className="min-h-screen bg-chassis text-carbon font-sans">
        <Routes>
          <Route path="/host/:branchId" element={<HostPosPage />} />
          <Route
            path="/"
            element={
              <>
                <header className="border-b border-grid bg-ink px-4 py-3 text-panel">
                  <h1 className="font-mono text-sm tracking-widest tabular">
                    LUOTDI / MERCHANT
                  </h1>
                </header>
                <section className="m-4 border border-grid bg-panel p-4">
                  <p className="font-mono text-xs text-graphite tabular">
                    01 / MERCHANT PWA SHELL
                  </p>
                  <p className="mt-2 text-sm">
                    Host / TV / Owner / SuperAdmin scaffold
                  </p>
                </section>
              </>
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
