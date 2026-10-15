import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { resolveInitialRoute } from './lib/initialRoute';
import {
  BranchCheckInPage,
  LivePassPage,
  MarketplacePage,
} from './pages';

/**
 * MemoryRouter: inside Zalo the page is served under a Zalo-controlled path
 * (h5.zdn.vn/zapps/<appId>/...), so BrowserRouter routes never match without
 * an exact basename. Memory routing is path-independent; the initial route
 * comes from launch params. The Zalo action bar is hidden (app-config.json),
 * so we render our own back button.
 */
function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.key !== 'default';
  return (
    <header className="flex items-center gap-3 border-b border-grid bg-ink px-4 py-3 text-panel">
      {canGoBack ? (
        <button
          type="button"
          aria-label="Quay lại"
          className="font-mono text-sm"
          onClick={() => navigate(-1)}
        >
          ←
        </button>
      ) : null}
      <h1 className="font-mono text-sm tracking-widest tabular">LUOTDI</h1>
    </header>
  );
}

export function App({ initialPath }: { initialPath?: string } = {}) {
  return (
    <MemoryRouter initialEntries={[initialPath ?? resolveInitialRoute()]}>
      <main className="min-h-screen bg-chassis text-carbon font-sans">
        <Header />
        <Routes>
          <Route path="/" element={<MarketplacePage />} />
          <Route path="/b/:qrToken" element={<BranchCheckInPage />} />
          <Route path="/ticket/:ticketId" element={<LivePassPage />} />
        </Routes>
      </main>
    </MemoryRouter>
  );
}
